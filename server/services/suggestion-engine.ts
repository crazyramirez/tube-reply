import { eq, or, like, desc } from 'drizzle-orm'
import { useDb } from '../utils/db'
import * as gemini from '../utils/gemini'
import * as openai from '../utils/openai'
import { getAiProvider } from '../utils/settings'
import { generateVideoSummary } from './video-summary'
import { buildContext, buildPrompt } from './context-builder'
import { logger } from '../utils/logger'
import { comments, suggestedReplies, videos, publishedReplies } from '../db/schema'

interface AIOutput {
  response_text: string
  response_es: string
  context_used: {
    kb_entries: string[]
    video_title: string | null
    video_summary_used: boolean
    existing_replies_checked: boolean
    existing_replies_count: number
  }
  confidence: number
  needs_confirmation: boolean
  confirmation_reason: string | null
  video_links_used: Array<{ video_id: string; video_title: string; url: string; thumbnail_url?: string }>
  tone_applied: string
  detected_language: string
}

export async function generateSuggestion(commentId: string, langOverride: string | null = null, additionalContext: string | null = null): Promise<{ suggestionId: number }> {
  const db = useDb()

  const existing = await db.query.publishedReplies.findFirst({
    where: eq(publishedReplies.commentId, commentId),
  })
  if (existing) throw new Error('Comment already has a published reply')

  const comment = await db.query.comments.findFirst({
    where: eq(comments.id, commentId),
    columns: { videoId: true },
  })
  if (!comment) throw new Error('Comment not found')

  await generateVideoSummary(comment.videoId)

  const ctx = await buildContext(commentId, langOverride, additionalContext)
  const prompt = buildPrompt(ctx)

  // Search function — called by Gemini/OpenAI via function calling when it needs to find a specific video
  async function searchVideos(query: string): Promise<Array<{ id: string; title: string; thumbnailUrl: string | null }>> {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length >= 3)
    if (!words.length) return []
    const conditions = words.map(w => like(videos.title, `%${w}%`))
    return db
      .select({ id: videos.id, title: videos.title, thumbnailUrl: videos.thumbnailUrl })
      .from(videos)
      .where(or(...conditions))
      .orderBy(desc(videos.publishedAt))
      .limit(10)
  }

  const provider = await getAiProvider()
  console.log(`[suggestion-engine] Using provider: ${provider}`)

  const { text: rawText, promptTokens, completionTokens } = provider === 'openai'
    ? await openai.openaiGenerateWithTools(prompt, searchVideos)
    : await gemini.geminiGenerateWithTools(prompt, searchVideos)

  let parsed: AIOutput
  try {
    parsed = JSON.parse(rawText) as AIOutput
    console.log(`[suggestion-engine] Parsed links:`, JSON.stringify(parsed.video_links_used, null, 2))
  }
  catch {
    console.error(`[suggestion-engine] Raw ${provider} output:`, rawText.substring(0, 1000))
    await logger.error('suggestion-engine', `Failed to parse ${provider} JSON`, undefined, { rawText: rawText.substring(0, 1000) })
    throw new Error('AI returned invalid JSON. Please try again.')
  }

  // Validate against full DB — tool may have returned videos not in ctx.recentVideos
  const allVideoRows = await db.select({ id: videos.id, thumbnailUrl: videos.thumbnailUrl }).from(videos)
  const videoMap = new Map(allVideoRows.map(v => [v.id, v.thumbnailUrl]))
  const validated = validateOutput(parsed, new Set(videoMap.keys()))

  // Enrich with thumbnails from DB to ensure accuracy
  validated.video_links_used = validated.video_links_used.map(link => ({
    ...link,
    thumbnail_url: (videoMap.get(link.video_id) ?? link.thumbnail_url ?? null)?.replace('mqdefault.jpg', 'hqdefault.jpg') || null,
  }))

  const config = useRuntimeConfig()
  const modelName = provider === 'openai'
    ? (config.openaiModel as string ?? 'gpt-4o-mini')
    : (config.geminiModel as string ?? 'gemini-3-flash-preview')

  const [inserted] = await db.insert(suggestedReplies).values({
    commentId,
    responseText: validated.response_text,
    responseEs: validated.response_es,
    originalGenerated: rawText,
    contextUsed: JSON.stringify(validated.context_used),
    confidenceScore: validated.confidence,
    needsConfirmation: validated.needs_confirmation,
    confirmationReason: validated.confirmation_reason,
    videoLinksUsed: JSON.stringify(validated.video_links_used),
    detectedCommentLang: validated.detected_language,
    modelUsed: `${provider}:${modelName}`,
    promptTokens,
    completionTokens,
    status: 'pending_review',
  }).returning({ id: suggestedReplies.id })

  await db.update(comments)
    .set({ status: 'suggested', processedAt: new Date().toISOString() })
    .where(eq(comments.id, commentId))

  return { suggestionId: inserted.id }
}
function validateOutput(raw: AIOutput, allVideoIds: Set<string>): AIOutput {
  const validatedLinks = (raw.video_links_used ?? []).filter((link) => {
    const isValid = allVideoIds.has(link.video_id)
    if (!isValid) {
      console.warn(`[suggestion-engine] Hallucinated video ID removed: ${link.video_id}`)
    }
    return isValid
  })

  const hadHallucination = validatedLinks.length < (raw.video_links_used?.length ?? 0)

  return {
    response_text: raw.response_text ?? '',
    response_es: raw.response_es ?? raw.response_text ?? '',
    context_used: raw.context_used ?? {
      kb_entries: [],
      video_title: null,
      video_summary_used: false,
      existing_replies_checked: false,
      existing_replies_count: 0,
    },
    confidence: Math.max(0, Math.min(1, raw.confidence ?? 0.5)),
    needs_confirmation: raw.needs_confirmation || hadHallucination,
    confirmation_reason: hadHallucination
      ? `Model referenced video IDs not in database — removed for safety. ${raw.confirmation_reason ?? ''}`
      : (raw.confirmation_reason ?? null),
    video_links_used: validatedLinks,
    tone_applied: raw.tone_applied ?? '',
    detected_language: raw.detected_language ?? 'und',
  }
}
