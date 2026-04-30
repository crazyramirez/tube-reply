import {
  GoogleGenAI,
  HarmCategory,
  HarmBlockThreshold,
  FunctionCallingConfigMode,
  type Content,
  type Tool,
  type FunctionCall,
} from '@google/genai'
import { desc, eq, and, or, isNull, like, sql, count } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { videos, comments, knowledgeBase, oauthTokens, agentMessages, videoTranscripts } from '../db/schema'
import { getAiProvider, getSetting } from '../utils/settings'
import { openaiGenerate, getOpenAIClient } from '../utils/openai'
import { fetchAndCacheTranscript } from './captions-service'

// ─── DB search tools ─────────────────────────────────────────────────────────

interface CommentSearchResult {
  id: string
  authorName: string
  text: string
  publishedAt: string
  likeCount: number | null
  videoTitle: string
}

async function searchCommentsByText(query: string, limit = 8): Promise<CommentSearchResult[]> {
  const db = useDb()
  const cap = Math.min(Math.max(1, limit), 20)
  const words = query.split(/\s+/).filter(w => w.length >= 3)
  if (!words.length) return []

  const andConds = words.map(w => like(comments.text, `%${w}%`))

  const run = (cond: ReturnType<typeof and>) =>
    db.select({
      id: comments.id,
      authorName: comments.authorName,
      text: comments.text,
      publishedAt: comments.publishedAt,
      likeCount: comments.likeCount,
      videoTitle: videos.title,
    })
      .from(comments)
      .innerJoin(videos, eq(comments.videoId, videos.id))
      .where(cond)
      .orderBy(desc(comments.likeCount), desc(comments.publishedAt))
      .limit(cap)

  let rows = await run(and(...andConds) as ReturnType<typeof and>)
  if (!rows.length && words.length > 1) {
    rows = await run(or(...andConds) as ReturnType<typeof and>)
  }
  return rows
}

async function searchCommentsByAuthor(authorName: string, limit = 8): Promise<CommentSearchResult[]> {
  const db = useDb()
  const cap = Math.min(Math.max(1, limit), 20)
  return db.select({
    id: comments.id,
    authorName: comments.authorName,
    text: comments.text,
    publishedAt: comments.publishedAt,
    likeCount: comments.likeCount,
    videoTitle: videos.title,
  })
    .from(comments)
    .innerJoin(videos, eq(comments.videoId, videos.id))
    .where(like(comments.authorName, `%${authorName}%`))
    .orderBy(desc(comments.publishedAt))
    .limit(cap)
}

async function getVideoComments(videoKeyword: string, limit = 10): Promise<CommentSearchResult[]> {
  const db = useDb()
  const cap = Math.min(Math.max(1, limit), 30)
  return db.select({
    id: comments.id,
    authorName: comments.authorName,
    text: comments.text,
    publishedAt: comments.publishedAt,
    likeCount: comments.likeCount,
    videoTitle: videos.title,
  })
    .from(comments)
    .innerJoin(videos, eq(comments.videoId, videos.id))
    .where(like(videos.title, `%${videoKeyword}%`))
    .orderBy(desc(comments.likeCount), desc(comments.publishedAt))
    .limit(cap)
}

interface TranscriptSearchResult {
  videoId: string
  videoTitle: string
  transcriptSnippet: string
  language: string
}

async function searchVideoTranscripts(query: string, videoKeyword?: string, limit = 5): Promise<TranscriptSearchResult[]> {
  const db = useDb()
  const cap = Math.min(Math.max(1, limit), 10)
  
  // If a video keyword is provided, we check if we have the transcript for THAT video
  if (videoKeyword) {
    const targetVideo = await db.query.videos.findFirst({
      where: like(videos.title, `%${videoKeyword}%`),
      columns: { id: true, title: true }
    })

    if (targetVideo) {
      const existing = await db.query.videoTranscripts.findFirst({
        where: eq(videoTranscripts.videoId, targetVideo.id),
        columns: { id: true }
      })

      // Trigger fetch if missing (await it to ensure results are available for the search below)
      if (!existing) {
        await fetchAndCacheTranscript(targetVideo.id).catch(() => {})
      }
    }
  }

  let cond = like(videoTranscripts.transcript, `%${query}%`)
  if (videoKeyword) {
    cond = and(cond, like(videos.title, `%${videoKeyword}%`)) as any
  }

  const rows = await db.select({
    videoId: videoTranscripts.videoId,
    videoTitle: videos.title,
    transcript: videoTranscripts.transcript,
    language: videoTranscripts.language,
  })
    .from(videoTranscripts)
    .innerJoin(videos, eq(videoTranscripts.videoId, videos.id))
    .where(cond)
    .limit(cap)

  return rows.map(r => {
    const index = r.transcript.toLowerCase().indexOf(query.toLowerCase())
    const start = Math.max(0, index - 150)
    const end = Math.min(r.transcript.length, index + 150)
    let snippet = r.transcript.substring(start, end).trim()
    if (start > 0) snippet = '...' + snippet
    if (end < r.transcript.length) snippet = snippet + '...'
    
    return {
      videoId: r.videoId,
      videoTitle: r.videoTitle,
      transcriptSnippet: snippet,
      language: r.language,
    }
  })
}

async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === 'search_comments') {
    const rows = await searchCommentsByText(String(args.query ?? ''), Number(args.limit ?? 8))
    return rows.length
      ? rows.map(r => ({
          id: r.id,
          author: r.authorName,
          comment: r.text,
          video: r.videoTitle,
          date: r.publishedAt,
          likes: r.likeCount ?? 0,
        }))
      : { message: 'No comments found matching that query.' }
  }
  if (name === 'search_comments_by_author') {
    const rows = await searchCommentsByAuthor(String(args.author_name ?? ''), Number(args.limit ?? 8))
    return rows.length
      ? rows.map(r => ({
          id: r.id,
          author: r.authorName,
          comment: r.text,
          video: r.videoTitle,
          date: r.publishedAt,
          likes: r.likeCount ?? 0,
        }))
      : { message: 'No comments found for that author.' }
  }
  if (name === 'get_video_comments') {
    const rows = await getVideoComments(String(args.video_keyword ?? ''), Number(args.limit ?? 10))
    return rows.length
      ? rows.map(r => ({
          id: r.id,
          author: r.authorName,
          comment: r.text,
          video: r.videoTitle,
          date: r.publishedAt,
          likes: r.likeCount ?? 0,
        }))
      : { message: 'No comments found for that video.' }
  }
  if (name === 'search_video_transcripts') {
    const rows = await searchVideoTranscripts(
      String(args.query ?? ''), 
      args.video_keyword ? String(args.video_keyword) : undefined,
      Number(args.limit ?? 5)
    )
    return rows.length
      ? rows.map(r => ({
          videoId: r.videoId,
          video: r.videoTitle,
          snippet: r.transcriptSnippet,
          language: r.language,
        }))
      : { message: 'No transcripts found matching that query.' }
  }
  return { error: `Unknown tool: ${name}` }
}

const agentTools: Tool[] = [{
  functionDeclarations: [
    {
      name: 'search_comments',
      description: 'Search the comments database for specific comments by keyword or phrase. Use when the user asks who said something, wants to find a specific comment, or asks about what viewers said about a topic.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Keywords or phrase to search for in comment text' },
          limit: { type: 'number', description: 'Max results to return (default 8, max 20)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'search_comments_by_author',
      description: 'Find all comments made by a specific person (commenter/viewer) by their name.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          author_name: { type: 'string', description: 'Name of the commenter to search for' },
          limit: { type: 'number', description: 'Max results to return (default 8, max 20)' },
        },
        required: ['author_name'],
      },
    },
    {
      name: 'get_video_comments',
      description: 'Get comments for a specific video by searching the video title. Useful when the user wants to know what people said about a particular video.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          video_keyword: { type: 'string', description: 'Part of the video title to search for' },
          limit: { type: 'number', description: 'Max results to return (default 10, max 30)' },
        },
        required: ['video_keyword'],
      },
    },
    {
      name: 'search_video_transcripts',
      description: 'Search through the full text of video transcriptions. Use this to find what was SPOKEN in a specific video or across all videos.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Keywords or phrase to search for in transcripts' },
          video_keyword: { type: 'string', description: 'Optional: Filter by video title (e.g. "Blusa Abril")' },
          limit: { type: 'number', description: 'Max videos to return (default 5, max 10)' },
        },
        required: ['query'],
      },
    },
  ],
}]

interface VideoStat {
  id: string
  title: string
  viewCount: number
  commentCount: number
  publishedAt: string
  tags: string | null
  engagementRate: number
}

interface ChannelContext {
  channelName: string | null
  subscriberCount: string | null
  videoCount: string | null
  topByViews: VideoStat[]
  topByEngagement: VideoStat[]
  recentVideos: VideoStat[]
  totalComments: number
  pendingComments: number
  publishedReplies: number
  audienceSignals: string[]
  kbEntries: Array<{ type: string; title: string; content: string }>
}

async function buildChannelContext(): Promise<ChannelContext> {
  const db = useDb()

  const [channel] = await db.select({
    channelTitle: oauthTokens.channelTitle,
    subscriberCount: oauthTokens.channelSubscriberCount,
    videoCount: oauthTokens.channelVideoCount,
  }).from(oauthTokens).limit(1)

  // 1. Get Top Videos (Views)
  const topByViews = await db.select({
    id: videos.id,
    title: videos.title,
    viewCount: videos.viewCount,
    commentCount: videos.commentCount,
    publishedAt: videos.publishedAt,
    tags: videos.tags,
  }).from(videos)
    .orderBy(desc(videos.viewCount))
    .limit(8)

  // 2. Get Top Videos (Engagement)
  const engagementRateExpr = sql<number>`CAST(${videos.commentCount} AS FLOAT) / NULLIF(${videos.viewCount}, 0) * 100`
  const topByEngagement = await db.select({
    id: videos.id,
    title: videos.title,
    viewCount: videos.viewCount,
    commentCount: videos.commentCount,
    publishedAt: videos.publishedAt,
    tags: videos.tags,
    engagementRate: engagementRateExpr
  }).from(videos)
    .where(sql`${videos.viewCount} >= 100`)
    .orderBy(desc(engagementRateExpr))
    .limit(5)

  // 3. Get Recent Videos
  const recentVideos = await db.select({
    id: videos.id,
    title: videos.title,
    viewCount: videos.viewCount,
    commentCount: videos.commentCount,
    publishedAt: videos.publishedAt,
    tags: videos.tags,
  }).from(videos)
    .orderBy(desc(videos.publishedAt))
    .limit(6)

  // 4. Counts (Optimized with count())
  const [{ total: totalComments }] = await db.select({ total: count() }).from(comments)
  const [{ total: pendingComments }] = await db.select({ total: count() }).from(comments).where(eq(comments.status, 'pending'))
  const [{ total: publishedReplies }] = await db.select({ total: count() }).from(comments).where(eq(comments.status, 'published'))

  // Transform video data for the return type (adding default values)
  const formatStats = (v: any) => ({
    ...v,
    viewCount: v.viewCount ?? 0,
    commentCount: v.commentCount ?? 0,
    engagementRate: Number((v.engagementRate ?? 0).toFixed(3))
  })

  // Audience signals: sample of recent pending top-level comments
  const recentPending = await db.select({ text: comments.text })
    .from(comments)
    .where(and(eq(comments.status, 'pending'), isNull(comments.parentId)))
    .orderBy(desc(comments.publishedAt))
    .limit(25)

  const audienceSignals = recentPending
    .map(c => c.text.substring(0, 100).replace(/\n/g, ' ').trim())
    .filter(t => t.length > 5)

  const kbEntries = await db.select({
    type: knowledgeBase.type,
    title: knowledgeBase.title,
    content: knowledgeBase.content,
  }).from(knowledgeBase)
    .where(eq(knowledgeBase.isActive, true))
    .orderBy(desc(knowledgeBase.priority))
    .limit(40)

  return {
    channelName: channel?.channelTitle ?? null,
    subscriberCount: channel?.subscriberCount ?? null,
    videoCount: channel?.videoCount ?? null,
    topByViews: topByViews.map(formatStats),
    topByEngagement: topByEngagement.map(formatStats),
    recentVideos: recentVideos.map(formatStats),
    totalComments,
    pendingComments,
    publishedReplies,
    audienceSignals,
    kbEntries,
  }
}

function formatVideoRow(v: VideoStat, showEngagement = false): string {
  const tags = v.tags
    ? (() => { try { return (JSON.parse(v.tags!) as string[]).slice(0, 3).join(', ') } catch { return '' } })()
    : ''
  const engStr = showEngagement ? ` | engagement: ${v.engagementRate}%` : ''
  return `  • "${v.title}" — ${v.viewCount.toLocaleString()} views, ${v.commentCount.toLocaleString()} comments${engStr}${tags ? ` | tags: ${tags}` : ''}`
}

function buildSystemPrompt(ctx: ChannelContext): string {
  const channelName = ctx.channelName ?? 'this channel'
  const subscribers = ctx.subscriberCount
    ? Number(ctx.subscriberCount).toLocaleString()
    : 'unknown'

  const topViewsSection = ctx.topByViews.length
    ? ctx.topByViews.map(v => formatVideoRow(v)).join('\n')
    : '  No video data available.'

  const topEngagementSection = ctx.topByEngagement.length
    ? ctx.topByEngagement.map(v => formatVideoRow(v, true)).join('\n')
    : '  No engagement data available.'

  const recentSection = ctx.recentVideos.length
    ? ctx.recentVideos.map(v => formatVideoRow(v)).join('\n')
    : '  No recent videos.'

  const audienceSection = ctx.audienceSignals.length
    ? ctx.audienceSignals.slice(0, 15).map((s, i) => `  ${i + 1}. "${s}"`).join('\n')
    : '  No pending comments yet.'

  const kbRules = ctx.kbEntries.filter(e => e.type === 'rule')
  const kbInfo = ctx.kbEntries.filter(e => e.type !== 'rule')

  const kbSection = kbInfo.length
    ? kbInfo.map(e => `  [${e.type.toUpperCase()}] ${e.title}: ${e.content}`).join('\n')
    : '  No knowledge base entries.'

  const mandatoryRules = kbRules.length
    ? kbRules.map(e => `  - ${e.content}`).join('\n')
    : '  No specific channel rules configured.'

  const replyRate = ctx.totalComments > 0
    ? Math.round((ctx.publishedReplies / ctx.totalComments) * 100)
    : 0

  return `You are an elite YouTube growth strategist AND comment analyst for "${channelName}" (${subscribers} subscribers, ${ctx.videoCount ?? '?'} videos total).

## TOOLS AVAILABLE
You have direct database access via function calls. Use them whenever the user asks about specific comments, who said something, or what viewers wrote. Do NOT say "I don't have access to individual comments" — you do. Call the tool first, then answer based on the real results.

- **search_comments(query, limit)** — search comments by keyword/phrase
- **search_comments_by_author(author_name, limit)** — find all comments by a specific person
- **get_video_comments(video_keyword, limit)** — get top comments for a specific video
- **search_video_transcripts(query, video_keyword, limit)** — search the full SPOKEN text of videos. Use when the user asks what you said about a topic, when you mentioned something, or to find details about a project discussed in a video.

When a user asks "who said X?", "find comments about Y", "what did people say about Z" — call search_comments immediately.
When a user asks "what did I say about X?", "when did I mention Y?", "look for the video where I talk about Z", or asks for design/technical details of a video's subject — call search_video_transcripts immediately. Always provide the video title in video_keyword if you know which video they are asking about.

**CRITICAL — Link format for found comments:** After retrieving comments from a tool, always render each one with a clickable link using this exact markdown format at the end of each comment entry:
[Ver comentario →](/comments/COMMENT_ID) — replace COMMENT_ID with the actual id field from the result.
If the user writes in English, use [View comment →](/comments/COMMENT_ID) instead.

**CRITICAL — Link format for found transcripts:** When mentioning a video found via search_video_transcripts, always provide a link to the video library:
[Ver video →](/videos/VIDEO_ID) — replace VIDEO_ID with the actual videoId from the result.

## PRIMARY MISSION
Every single response must serve ONE goal: **maximize this channel** — grow subscribers, increase views, improve engagement, and help the owner make better content decisions. Never give generic advice. Always tie recommendations to the real data below.

## MANDATORY CHANNEL RULES (STRICT COMPLIANCE REQUIRED)
${mandatoryRules}

## CHANNEL DATA (use this as evidence — never recite it verbatim)

**Performance stats:**
- Subscribers: ${subscribers}
- Total comments in DB: ${ctx.totalComments.toLocaleString()}
- Pending replies: ${ctx.pendingComments.toLocaleString()}
- Reply rate: ${replyRate}% (${ctx.publishedReplies} replies published)

**Top videos by views:**
${topViewsSection}

**Highest engagement rate (comments/views — shows what resonates most):**
${topEngagementSection}

**Most recent uploads:**
${recentSection}

**Live audience signals (what viewers are asking/saying RIGHT NOW):**
${audienceSection}

**Knowledge base & context:**
${kbSection}

## RESPONSE RULES

**Ground every answer in real data.** When you see a pattern in the numbers above (a topic with 5x more views, a high engagement rate on a specific format), SAY IT explicitly. "Your videos on X average Y views vs Z for the rest" is useful. Vague advice is useless.

**Never fabricate.** Only cite numbers, video titles, or viewer quotes that appear in the data above. If you don't have data for something, say so explicitly: "I don't have that data — here's what I'd recommend anyway."

**Always give ONE clear primary recommendation.** Not 5 options. Not "you could consider." Say: "Do X. Here's why the data supports it."

**Identify patterns the owner might be missing.** High engagement on a specific topic? A recent video with unexpectedly low views? Audience asking for a specific type of content in their comments? Surface it.

**Prioritize subscriber growth actions.** Every answer should ideally include a nudge toward what will convert viewers to subscribers: CTAs in replies, content gaps the audience is signaling, topics that over-perform.

**Match language exactly** — Spanish if they write in Spanish, English if in English.

**Be concise and punchy.** Short paragraphs. No filler. No "great question". No closing summaries. Get to the point.

**Format:** Bold key insights. Numbered steps for ordered actions. Bullet points only for genuine lists. Max response length: answer completely, then stop.

## STRICT PROHIBITIONS
${kbRules.map(r => `- ${r.content}`).join('\n')}
- Never invent video metrics, subscriber counts, or engagement numbers not in the data above
- Never describe or recite the channel's video list back to the owner (they know their own content)
- Never say "based on your data" or "according to your channel" — just state the insight directly
- Never use: "great question", "absolutely", "certainly", "of course", "I'd be happy to"
- Never add a closing section summarizing what you just said
- Never suggest the owner create content they're clearly already creating`
}

export interface AgentMessage {
  id: number
  chatId: number
  role: 'user' | 'assistant'
  content: string
  metadata: string | null
  createdAt: string | null
}

export async function runAgentChat(
  userMessage: string,
  history: AgentMessage[],
): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  const provider = await getAiProvider()
  const dbModel = await getSetting('ai_model', '')
  const config = useRuntimeConfig()
  
  const ctx = await buildChannelContext()
  const systemPrompt = buildSystemPrompt(ctx)

  // ─── Case: OpenAI ──────────────────────────────────────────────────────────
  if (provider === 'openai') {
    const client = getOpenAIClient()
    const model = (config.openaiModel as string) ?? 'gpt-4o-mini'
    
    // Map Google AI tools to OpenAI tools
    const openAiTools = agentTools[0].functionDeclarations?.map(fd => ({
      type: 'function',
      function: {
        name: fd.name,
        description: fd.description,
        parameters: fd.parametersJsonSchema,
      }
    }))

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
      })),
      { role: 'user', content: userMessage }
    ]

    let totalPromptTokens = 0
    let totalCompletionTokens = 0

    let response = await client.chat.completions.create({
      model,
      messages,
      tools: openAiTools as any,
      tool_choice: 'auto',
    })

    totalPromptTokens += response.usage?.prompt_tokens ?? 0
    totalCompletionTokens += response.usage?.completion_tokens ?? 0

    let responseMessage = response.choices[0].message
    
    // Tool call loop (OpenAI)
    let rounds = 0
    while (rounds++ < 5 && responseMessage.tool_calls?.length) {
      messages.push(responseMessage)

      for (const toolCall of responseMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments)
        const result = await executeTool(toolCall.function.name, args)
        
        messages.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolCall.function.name,
          content: JSON.stringify(result),
        })
      }

      response = await client.chat.completions.create({
        model,
        messages,
        tools: openAiTools as any,
      })

      totalPromptTokens += response.usage?.prompt_tokens ?? 0
      totalCompletionTokens += response.usage?.completion_tokens ?? 0
      responseMessage = response.choices[0].message
    }

    return {
      text: responseMessage.content || '',
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
    }
  }

  // ─── Case: Gemini (Default) ────────────────────────────────────────────────
  const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')

  const model = dbModel || config.geminiModel || 'gemini-3-flash-preview'

  const ai = new GoogleGenAI({ apiKey })
  
  const contents: Content[] = history.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }],
  }))
  contents.push({ role: 'user', parts: [{ text: userMessage }] })

  let promptTokens = 0
  let completionTokens = 0

  let response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: systemPrompt,
      tools: agentTools,
      toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
      temperature: 0.65,
      maxOutputTokens: 4096,
      topP: 0.9,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      ],
    }
  })

  promptTokens += response.usageMetadata?.promptTokenCount ?? 0
  completionTokens += response.usageMetadata?.candidatesTokenCount ?? 0

  // Tool call loop
  let iterations = 0
  while (iterations++ < 5) {
    const fcs = response.functionCalls
    if (!fcs?.length) break

    // Add model's function calls to content history
    contents.push({ role: 'model', parts: fcs.map(fc => ({ functionCall: fc })) })

    const toolResponses = await Promise.all(
      fcs.map(async (fc) => ({
        functionResponse: {
          name: fc.name,
          response: { result: await executeTool(fc.name, fc.args as Record<string, unknown>) },
        },
      })),
    )

    // Add tool responses to content history
    contents.push({ role: 'user', parts: toolResponses })

    response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: systemPrompt,
        tools: agentTools,
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
        temperature: 0.65,
        maxOutputTokens: 4096,
        topP: 0.9,
      }
    })

    promptTokens += response.usageMetadata?.promptTokenCount ?? 0
    completionTokens += response.usageMetadata?.candidatesTokenCount ?? 0
  }

  return {
    text: response.text || '',
    promptTokens,
    completionTokens,
  }
}

export async function getChatMessages(chatId: number): Promise<AgentMessage[]> {
  const db = useDb()
  return db.select().from(agentMessages)
    .where(eq(agentMessages.chatId, chatId))
    .orderBy(agentMessages.createdAt) as Promise<AgentMessage[]>
}
