import { eq, and, isNull, gte, desc, inArray, ne } from 'drizzle-orm'
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

  if (!forceRefresh) {
    const cached = await db.query.videoIdeasCache.findFirst({
      orderBy: (t, { desc }) => [desc(t.generatedAt)],
    })
    if (cached) {
      const age = Date.now() - new Date(cached.generatedAt ?? 0).getTime()
      if (age < CACHE_TTL_MS) {
        const clusters = JSON.parse(cached.clusters) as VideoIdeaCluster[]
        return clusters.slice(0, 4)
      }
    }
  }

  if (isGenerating) {
    throw createError({
      statusCode: 429,
      statusMessage: 'A generation process is already in progress. Please wait.'
    })
  }

  return generateVideoIdeas(event)
}

async function generateVideoIdeas(event?: any): Promise<VideoIdeaCluster[]> {
  isGenerating = true
  try {
    const db = useDb()
    const ninetyDaysAgo = new Date(Date.now() - NINETY_DAYS_MS).toISOString()

    const rows = await db
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
          inArray(comments.detectedIntent, ['question', 'help_needed', 'video_request', 'suggestion']),
          gte(comments.publishedAt, ninetyDaysAgo),
          ne(comments.text, '')
        )
      )
      .orderBy(desc(comments.likeCount))
      .limit(60)

    if (rows.length < 5) return []

    const prompt = `You are a World-Class Content Strategist and YouTube Growth Expert.
Your task is to analyze audience comments and generate EXACTLY 4 "Content Blueprints".
These are not just titles; they are high-fidelity production guides for videos that the audience is literally begging for.

For each of the 4 Blueprints, you must provide:
1. "topic": Short category (e.g., "Sizing Masterclass").
2. "suggestedTitle": A high-CTR title.
3. "strategicObjective": Why this video is a strategic win.
4. "viralHook": A powerful first 10-second script/hook idea.
5. "keyPillars": Exactly 3 specific points that MUST be in the video.
6. "productionTips": Specific advice on filming/editing.
7. "expectedOutcome": What KPI will this improve.
8. "demandCount": Number of comments requesting this.
9. "totalLikes": Sum of likes on those comments.
10. "exampleQuestions": 3 representative quotes from fans.

Comments to analyze:
${rows.map((r, i) => {
  const clean = r.text
    .replace(/"/g, "'")
    .replace(/\\/g, "/")
    .replace(/\n/g, ' ')
    .slice(0, 150)
  return `${i + 1}. [Likes: ${r.likeCount}] ${clean}`
}).join('\n')}

Return ONLY a valid JSON object. Do not include markdown or extra text.
Schema:
{ "ideas": [{ "topic": string, "suggestedTitle": string, "strategicObjective": string, "viralHook": string, "keyPillars": string[], "productionTips": string, "expectedOutcome": string, "demandCount": number, "totalLikes": number, "exampleQuestions": string[] }] }`

    const { text } = await generateUnified(prompt, 2, event)
    const rawData = JSON.parse(text)
    let clusters: VideoIdeaCluster[] = Array.isArray(rawData) ? rawData : (rawData.ideas || [])
    
    // Force exactly 4 and add IDs
    clusters = clusters.slice(0, 4).map((c, idx) => ({
      ...c,
      id: `idea_${Date.now()}_${idx}`
    }))

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
