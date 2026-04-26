import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  type Content,
} from '@google/generative-ai'
import { desc, eq } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { videos, comments, knowledgeBase, oauthTokens, agentMessages } from '../db/schema'

interface ChannelContext {
  channelName: string | null
  subscriberCount: string | null
  videoCount: string | null
  recentVideos: Array<{
    id: string
    title: string
    viewCount: number
    commentCount: number
    publishedAt: string
    tags: string | null
  }>
  totalComments: number
  pendingComments: number
  kbEntries: Array<{ type: string; title: string; content: string }>
}

async function buildChannelContext(): Promise<ChannelContext> {
  const db = useDb()

  const [channel] = await db.select({
    channelTitle: oauthTokens.channelTitle,
    subscriberCount: oauthTokens.channelSubscriberCount,
    videoCount: oauthTokens.channelVideoCount,
  }).from(oauthTokens).limit(1)

  const recentVideos = await db.select({
    id: videos.id,
    title: videos.title,
    viewCount: videos.viewCount,
    commentCount: videos.commentCount,
    publishedAt: videos.publishedAt,
    tags: videos.tags,
  }).from(videos)
    .orderBy(desc(videos.publishedAt))
    .limit(15)

  const totalComments = await db.select({ id: comments.id }).from(comments)
  const pendingComments = await db.select({ id: comments.id }).from(comments).where(eq(comments.status, 'pending'))

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
    recentVideos: recentVideos.map(v => ({
      ...v,
      viewCount: v.viewCount ?? 0,
      commentCount: v.commentCount ?? 0,
    })),
    totalComments: totalComments.length,
    pendingComments: pendingComments.length,
    kbEntries,
  }
}

function buildSystemPrompt(ctx: ChannelContext): string {
  const channelName = ctx.channelName ?? 'this channel'
  const subscribers = ctx.subscriberCount
    ? Number(ctx.subscriberCount).toLocaleString()
    : 'unknown'

  const topVideos = ctx.recentVideos
    .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
    .slice(0, 8)
    .map(v => {
      const tags = v.tags ? (() => { try { return (JSON.parse(v.tags!) as string[]).slice(0, 4).join(', ') } catch { return '' } })() : ''
      return `  • "${v.title}" — ${(v.viewCount ?? 0).toLocaleString()} views, ${(v.commentCount ?? 0).toLocaleString()} comments${tags ? ` | tags: ${tags}` : ''}`
    }).join('\n') || '  No videos yet.'

  const kbSection = ctx.kbEntries.length
    ? ctx.kbEntries.map(e => `  [${e.type.toUpperCase()}] ${e.title}: ${e.content}`).join('\n')
    : '  Empty.'

  return `You are a sharp YouTube channel strategist for "${channelName}" (${subscribers} subscribers, ${ctx.videoCount ?? '?'} videos).

## YOUR ROLE
You are an expert consultant. The channel owner already knows their own content — DO NOT describe or list it back to them. Use the data below as silent background knowledge to form your strategic opinions.

## CHANNEL PERFORMANCE DATA (background only — do not recite this)
Top performing content:
${topVideos}

Brand & rules:
${kbSection}

## HOW YOU RESPOND
- **Go straight to the answer.** No preamble, no "Great question!", no recap of what they asked.
- **The owner knows their videos.** Never list or describe existing content unless making a specific comparative point that adds real value.
- **Be a strategist, not a reporter.** Give NEW ideas, angles, and tactics — not a summary of what already exists.
- **Be concise and punchy.** Short paragraphs. Use bullet points only when genuinely listing options. No padding.
- **Be opinionated.** Make clear recommendations. Say "Do X" not "You could consider X".
- **Match user's language exactly** — Spanish if they write in Spanish, English if in English.
- **Format:** Use bold for key points, numbered lists for ordered steps, bullet points for options. Keep responses scannable.
- **Max length:** Answer the question completely but stop there. No filler sections, no closing summaries.

## WHAT YOU NEVER DO
- Never recite the channel's video list back to the owner
- Never say "based on your data" or "according to your channel"
- Never use fluff phrases: "great question", "absolutely", "certainly", "of course"
- Never add a closing section summarizing what you just said
- Never suggest things the owner already clearly does (if they make crochet tutorials, don't suggest "make tutorials")`
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
      temperature: 0.75,
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
