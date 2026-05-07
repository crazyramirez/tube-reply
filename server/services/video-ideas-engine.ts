import { eq, and, isNull, gte, desc, ne, sql, or } from 'drizzle-orm'
import { createError } from 'h3'
import { useDb } from '../utils/db'
import { comments, videoIdeasCache } from '../db/schema'
import { generateUnified } from '../utils/ai'
import { logger } from '../utils/logger'
import type { VideoIdeaCluster } from '../../shared/types'

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000
const CACHE_TTL_MS   = 6 * 60 * 60 * 1000 // 6 hours

let isGenerating = false

export async function getVideoIdeas(forceRefresh = false, event?: any): Promise<VideoIdeaCluster[]> {
  const db = useDb()

  const cached = await db.query.videoIdeasCache.findFirst({
    orderBy: (t, { desc }) => [desc(t.generatedAt)],
  })

  if (!forceRefresh && cached) {
    const age = Date.now() - new Date(cached.generatedAt ?? 0).getTime()
    if (age < CACHE_TTL_MS) {
      return (JSON.parse(cached.clusters) as VideoIdeaCluster[]).slice(0, 4)
    }
  }

  if (isGenerating) {
    // Return stale cache rather than throwing 429 to client if we have something
    if (cached) {
      return (JSON.parse(cached.clusters) as VideoIdeaCluster[]).slice(0, 4)
    }
    throw createError({
      statusCode: 429,
      statusMessage: 'A generation process is already in progress. Please wait.'
    })
  }

  const fresh = await generateVideoIdeas(event)

  // If generation failed or returned nothing, serve stale cache as fallback
  if (fresh.length === 0 && cached) {
    return (JSON.parse(cached.clusters) as VideoIdeaCluster[]).slice(0, 4)
  }

  return fresh
}

async function generateVideoIdeas(event?: any): Promise<VideoIdeaCluster[]> {
  isGenerating = true
  try {
    const db = useDb()
    const ninetyDaysAgo = new Date(Date.now() - NINETY_DAYS_MS).toISOString()

    // Fetch all non-reply comments from last 90 days, no intent filter —
    // the AI will identify demand signals across all comment types.
    // Two passes: high-signal intents first (up to 50), then fill with remaining (up to 30).
    const highSignal = await db
      .select({
        id: comments.id,
        text: comments.text,
        likeCount: comments.likeCount,
        detectedIntent: comments.detectedIntent,
      })
      .from(comments)
      .where(
        and(
          isNull(comments.parentId),
          or(
            eq(comments.detectedIntent, 'question'),
            eq(comments.detectedIntent, 'help_needed'),
            eq(comments.detectedIntent, 'video_request'),
            eq(comments.detectedIntent, 'suggestion'),
          ),
          gte(comments.publishedAt, ninetyDaysAgo),
          ne(comments.text, '')
        )
      )
      .orderBy(desc(comments.likeCount))
      .limit(50)

    const otherSignal = await db
      .select({
        id: comments.id,
        text: comments.text,
        likeCount: comments.likeCount,
        detectedIntent: comments.detectedIntent,
      })
      .from(comments)
      .where(
        and(
          isNull(comments.parentId),
          or(
            eq(comments.detectedIntent, 'general'),
            eq(comments.detectedIntent, 'compliment'),
          ),
          gte(comments.publishedAt, ninetyDaysAgo),
          ne(comments.text, ''),
          sql`${comments.likeCount} >= 1` // only include general/compliment with at least 1 like
        )
      )
      .orderBy(desc(comments.likeCount))
      .limit(30)

    const rows = [...highSignal, ...otherSignal]

    if (rows.length < 3) return []

    const existingCaches = await db.select({ clusters: videoIdeasCache.clusters }).from(videoIdeasCache)
    const previousTitles: string[] = []
    const previousTopics: string[] = []
    for (const cache of existingCaches) {
      try {
        const prevClusters = JSON.parse(cache.clusters) as VideoIdeaCluster[]
        for (const cluster of prevClusters) {
          if (cluster.suggestedTitle) previousTitles.push(cluster.suggestedTitle.trim())
          if (cluster.topic) previousTopics.push(cluster.topic.trim())
        }
      } catch {
        // ignore parse errors
      }
    }

    let dedupeSection = ''
    if (previousTitles.length > 0) {
      dedupeSection = `
CRITICAL — DEDUPLICATION:
These topics/titles have already been generated. Do NOT generate ideas with similar or overlapping themes, even with different wording:
${previousTitles.map(t => `- "${t}"`).join('\n')}

Find FRESH angles and topics not covered above. If you cannot find 4 genuinely distinct new ideas, generate fewer but ensure each is unique and highly demanded.
`
    }

    // Format comments: high-signal ones marked with [★] for AI visibility
    const highSignalIds = new Set(highSignal.map(r => r.id))
    const commentLines = rows.map((r, i) => {
      const clean = r.text
        .replace(/"/g, "'")
        .replace(/\\/g, "/")
        .replace(/\n/g, ' ')
        .trim()
        .slice(0, 180)
      const signal = highSignalIds.has(r.id) ? '[★]' : ''
      return `${i + 1}. ${signal}[Likes:${r.likeCount}][${r.detectedIntent ?? 'general'}] ${clean}`
    }).join('\n')

    const prompt = `You are a World-Class YouTube Content Strategist with deep expertise in audience psychology and content virality.

Your task: analyze these ${rows.length} audience comments and extract the most VIABLE video ideas — ones the audience is genuinely demanding.

Comments marked [★] are high-signal (questions, requests, help-seeking). Others provide context on what resonates.
${dedupeSection}
RULES:
- Generate UP TO 4 blueprints, but ONLY for topics with clear evidence of demand (multiple people asking, high likes, or strong pattern)
- Each blueprint must address a DISTINCT audience need — no overlap in topic or angle
- Prioritize specificity: "How to size a sweater for different body types" beats "Sweater tutorial"
- viralHook must be genuinely attention-grabbing for the first 10 seconds
- demandCount = number of comments requesting this specific topic
- totalLikes = sum of likes on those specific comments
- exampleQuestions = 3 VERBATIM quotes (or very close) from the comments provided

For each blueprint provide:
1. "topic": Short category label (3-5 words max)
2. "suggestedTitle": High-CTR YouTube title (use numbers, questions, or power words)
3. "strategicObjective": Why this video is a strategic win for the channel
4. "viralHook": Powerful first 10-second script hook
5. "keyPillars": Exactly 3 specific, actionable content points
6. "productionTips": Concrete filming/editing advice specific to this content
7. "expectedOutcome": Which KPI improves and why
8. "demandCount": Integer
9. "totalLikes": Integer
10. "exampleQuestions": Array of exactly 3 strings

Comments to analyze:
${commentLines}

Return ONLY valid JSON, no markdown, no explanation.
Schema: { "ideas": [{ "topic": string, "suggestedTitle": string, "strategicObjective": string, "viralHook": string, "keyPillars": string[], "productionTips": string, "expectedOutcome": string, "demandCount": number, "totalLikes": number, "exampleQuestions": string[] }] }`

    const { text } = await generateUnified(prompt, 2, event)

    let rawData: any
    try {
      // Strip markdown fences if AI wraps in ```json ... ```
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
      rawData = JSON.parse(cleaned)
    } catch {
      await logger.error('video-ideas-engine', 'JSON parse failed', new Error(`Raw: ${text.slice(0, 300)}`))
      return []
    }

    let clusters: VideoIdeaCluster[] = Array.isArray(rawData) ? rawData : (rawData.ideas ?? [])

    clusters = clusters.slice(0, 4).map((c, idx) => ({
      ...c,
      id: `idea_${Date.now()}_${idx}`
    }))

    if (clusters.length === 0) return []

    await db.insert(videoIdeasCache).values({
      clusters: JSON.stringify(clusters),
      commentsAnalyzed: rows.length,
      modelUsed: 'ai-engine',
    })

    return clusters
  } catch (err) {
    await logger.error('video-ideas-engine', 'Clustering failed', err as Error)
    return []
  } finally {
    isGenerating = false
  }
}
