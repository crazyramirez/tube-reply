import { eq, and, gt, count, lt, ne, isNull } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { comments, publishedReplies } from '../db/schema'
import { detectIntent, type CommentIntent } from './context-builder'

export type PriorityLabel = 'urgent' | 'high' | 'normal' | 'low'

export interface ScoreResult {
  score: number
  label: PriorityLabel
  intent: CommentIntent
  isReturnCommenter: boolean
  opportunityFlags: string[]
}

interface CommentRow {
  id: string
  text: string
  likeCount: number | null
  publishedAt: string
  authorChannelId: string | null
  videoPublishedAt?: string | null
  replyCount?: number
}

// Keywords that signal high-value opportunities
const OPPORTUNITY_PATTERNS: Record<string, RegExp> = {
  collab: /\b(collab|colabora(ci[oó]n)?|collaboration|joint video|hagamos|let.s do|work together|trabajemos)\b/i,
  sponsor: /\b(sponsor|patrocin|brand deal|partnership|endorse|auspici|publicidad pagada)\b/i,
  interview: /\b(entrevista|interview|podcast|talk show|guest|invitado|platica|charla)\b/i,
}

// Spam signals
const SPAM_PATTERNS = [
  /(.)\1{6,}/, // 7+ repeated chars: "aaaaaaaa"
  /[^\p{L}\p{N}\s]{5,}/u, // 5+ consecutive non-letter/non-digit chars
  /(\S+)\s+\1\s+\1/, // same word 3+ times in a row
  /\b(sub4sub|sub 4 sub|follow4follow|f4f|l4l|like4like)\b/i,
  /(🔥|❤️|😍|💯|👇){4,}/, // emoji spam
]

function isSpam(text: string): boolean {
  return SPAM_PATTERNS.some(p => p.test(text))
}

function getOpportunityFlags(text: string): string[] {
  return Object.entries(OPPORTUNITY_PATTERNS)
    .filter(([, pattern]) => pattern.test(text))
    .map(([flag]) => flag)
}

function labelFromScore(score: number): PriorityLabel {
  if (score >= 80) return 'urgent'
  if (score >= 60) return 'high'
  if (score >= 30) return 'normal'
  return 'low'
}

export function scoreComment(comment: CommentRow): ScoreResult {
  let score = 50

  // Spam check (early exit with heavy penalty)
  if (isSpam(comment.text)) {
    return {
      score: Math.max(0, score - 50),
      label: 'low',
      intent: 'general',
      isReturnCommenter: false,
      opportunityFlags: [],
    }
  }

  const intent = detectIntent(comment.text)
  const opportunityFlags = getOpportunityFlags(comment.text)

  // Like count signal (log-scaled, max +20)
  const likes = comment.likeCount ?? 0
  if (likes > 0) {
    score += Math.min(20, Math.log10(likes + 1) * 10)
  }

  // Intent signal
  switch (intent) {
    case 'help_needed': score += 20; break
    case 'question':    score += 20; break
    case 'complaint':   score += 15; break
    case 'video_request': score += 10; break
    case 'compliment':  score += 5; break
  }

  // Opportunity flags (collab, sponsor, etc.)
  if (opportunityFlags.length > 0) {
    score += 20
  }

  // Thread activity (>3 replies = active thread)
  if ((comment.replyCount ?? 0) > 3) {
    score += 10
  }

  // Early commenter bonus: within 24h of video publish
  if (comment.videoPublishedAt) {
    const videoTs = new Date(comment.videoPublishedAt).getTime()
    const commentTs = new Date(comment.publishedAt).getTime()
    const diffHours = (commentTs - videoTs) / (1000 * 60 * 60)
    if (diffHours >= 0 && diffHours <= 24) {
      score += 10
    }
  }

  score = Math.round(Math.min(100, Math.max(0, score)))

  return {
    score,
    label: labelFromScore(score),
    intent,
    isReturnCommenter: false, // filled in by batch scorer
    opportunityFlags,
  }
}

/**
 * Score all unscored (or all) top-level pending/suggested comments.
 * Returns count of updated rows.
 */
export async function scoreAllComments(options: { onlyUnscored?: boolean } = {}): Promise<number> {
  const db = useDb()

  // Fetch top-level comments needing scoring
  const rows = await db
    .select({
      id: comments.id,
      text: comments.text,
      likeCount: comments.likeCount,
      publishedAt: comments.publishedAt,
      authorChannelId: comments.authorChannelId,
      priorityScore: comments.priorityScore,
    })
    .from(comments)
    .where(
      and(
        isNull(comments.parentId),
        ...(options.onlyUnscored ? [eq(comments.priorityScore, 50)] : [])
      )
    )

  if (rows.length === 0) return 0

  // Build return-commenter map: channelIds with >1 comment in DB
  const channelIds = [...new Set(rows.map(r => r.authorChannelId).filter(Boolean) as string[])]
  const returnCommenters = new Set<string>()

  if (channelIds.length > 0) {
    // Count comments per channelId — those with count > 1 are return commenters
    const channelCounts = await db
      .select({
        authorChannelId: comments.authorChannelId,
        total: count(comments.id),
      })
      .from(comments)
      .where(
        and(
          isNull(comments.parentId),
          ne(comments.authorChannelId, '')
        )
      )
      .groupBy(comments.authorChannelId)

    for (const row of channelCounts) {
      if (row.authorChannelId && row.total > 1) {
        returnCommenters.add(row.authorChannelId)
      }
    }
  }

  let updated = 0
  for (const row of rows) {
    const result = scoreComment({
      id: row.id,
      text: row.text,
      likeCount: row.likeCount,
      publishedAt: row.publishedAt,
      authorChannelId: row.authorChannelId,
    })

    const isReturn = row.authorChannelId ? returnCommenters.has(row.authorChannelId) : false
    if (isReturn) result.score = Math.min(100, result.score + 15)
    result.label = labelFromScore(result.score)

    await db
      .update(comments)
      .set({
        priorityScore: result.score,
        priorityLabel: result.label,
        detectedIntent: result.intent,
        isReturnCommenter: isReturn,
        opportunityFlags: result.opportunityFlags.length > 0
          ? JSON.stringify(result.opportunityFlags)
          : null,
      })
      .where(eq(comments.id, row.id))

    updated++
  }

  return updated
}
