import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  type Content,
} from '@google/generative-ai'
import { desc, eq, and, isNull } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { videos, comments, knowledgeBase, oauthTokens, agentMessages } from '../db/schema'

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

  const allVideos = await db.select({
    id: videos.id,
    title: videos.title,
    viewCount: videos.viewCount,
    commentCount: videos.commentCount,
    publishedAt: videos.publishedAt,
    tags: videos.tags,
  }).from(videos)

  const videoStats: VideoStat[] = allVideos.map(v => ({
    id: v.id,
    title: v.title,
    viewCount: v.viewCount ?? 0,
    commentCount: v.commentCount ?? 0,
    publishedAt: v.publishedAt,
    tags: v.tags,
    engagementRate: v.viewCount && v.viewCount > 0
      ? Number(((v.commentCount ?? 0) / v.viewCount * 100).toFixed(3))
      : 0,
  }))

  const topByViews = [...videoStats]
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 8)

  const topByEngagement = [...videoStats]
    .filter(v => v.viewCount >= 100)
    .sort((a, b) => b.engagementRate - a.engagementRate)
    .slice(0, 5)

  const recentVideos = [...videoStats]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 6)

  const allComments = await db.select({ id: comments.id }).from(comments)
  const pendingRows = await db.select({ id: comments.id })
    .from(comments).where(eq(comments.status, 'pending'))
  const publishedRows = await db.select({ id: comments.id })
    .from(comments).where(eq(comments.status, 'published'))

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
    .limit(20)

  return {
    channelName: channel?.channelTitle ?? null,
    subscriberCount: channel?.subscriberCount ?? null,
    videoCount: channel?.videoCount ?? null,
    topByViews,
    topByEngagement,
    recentVideos,
    totalComments: allComments.length,
    pendingComments: pendingRows.length,
    publishedReplies: publishedRows.length,
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

  const kbSection = ctx.kbEntries.length
    ? ctx.kbEntries.map(e => `  [${e.type.toUpperCase()}] ${e.title}: ${e.content}`).join('\n')
    : '  No knowledge base entries.'

  const replyRate = ctx.totalComments > 0
    ? Math.round((ctx.publishedReplies / ctx.totalComments) * 100)
    : 0

  return `You are an elite YouTube growth strategist for "${channelName}" (${subscribers} subscribers, ${ctx.videoCount ?? '?'} videos total).

## PRIMARY MISSION
Every single response must serve ONE goal: **maximize this channel** — grow subscribers, increase views, improve engagement, and help the owner make better content decisions. Never give generic advice. Always tie recommendations to the real data below.

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

**Brand rules & knowledge base:**
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
  const config = useRuntimeConfig()
  if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY not configured')

  const ctx = await buildChannelContext()
  const systemPrompt = buildSystemPrompt(ctx)

  const client = new GoogleGenerativeAI(config.geminiApiKey)
  const model = client.getGenerativeModel({
    model: config.geminiModel ?? 'gemini-2.0-flash',
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: 0.65,
      maxOutputTokens: 4096,
      topP: 0.9,
    },
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ],
  })

  const geminiHistory: Content[] = history.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }],
  }))

  const chat = model.startChat({ history: geminiHistory })
  const result = await chat.sendMessage(userMessage)
  const response = result.response

  return {
    text: response.text(),
    promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
    completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
  }
}

export async function getChatMessages(chatId: number): Promise<AgentMessage[]> {
  const db = useDb()
  return db.select().from(agentMessages)
    .where(eq(agentMessages.chatId, chatId))
    .orderBy(agentMessages.createdAt) as Promise<AgentMessage[]>
}
