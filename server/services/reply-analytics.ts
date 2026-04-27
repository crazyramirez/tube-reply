import { eq, isNull, and, gt } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { publishedReplies, comments } from '../db/schema'
import { getAuthenticatedYouTube } from '../utils/youtube'
import { logger } from '../utils/logger'

const SYNC_BATCH = 25 // max replies to check per run

/**
 * For each published reply, fetch its current like count and check
 * whether the original commenter replied back.
 */
export async function syncReplyMetrics(): Promise<{ updated: number }> {
  const db = useDb()

  let yt: Awaited<ReturnType<typeof getAuthenticatedYouTube>>
  try {
    yt = await getAuthenticatedYouTube()
  } catch {
    return { updated: 0 }
  }

  // Fetch replies that have a real YouTube reply ID and haven't been synced recently
  const rows = await db
    .select({
      id: publishedReplies.id,
      youtubeReplyId: publishedReplies.youtubeReplyId,
      commentId: publishedReplies.commentId,
      publishedAt: publishedReplies.publishedAt,
    })
    .from(publishedReplies)
    .where(
      and(
        // has a real YouTube ID (not local-)
        gt(publishedReplies.youtubeReplyId, 'A'), // excludes empty strings
      )
    )
    .orderBy(publishedReplies.publishedAt)
    .limit(SYNC_BATCH)

  if (rows.length === 0) return { updated: 0 }

  let updated = 0

  for (const row of rows) {
    try {
      // Fetch the reply's current data from YouTube
      const res = await yt.comments.list({
        part: ['snippet'],
        id: [row.youtubeReplyId],
        maxResults: 1,
      })

      const item = res.data.items?.[0]
      if (!item) continue

      const likeCount = item.snippet?.likeCount ?? 0

      // Check if original commenter replied back (any new reply on parent thread after our reply)
      const parentComment = await db.query.comments.findFirst({
        where: eq(comments.id, row.commentId),
        columns: { authorChannelId: true, videoId: true },
      })

      let commenterRepliedBack = false
      let threadGrowth = 0

      if (parentComment?.authorChannelId) {
        // Count replies after our published date from the original commenter
        const threadReplies = await db
          .select({ total: db.$count(comments, and(
            eq(comments.parentId, row.commentId),
            gt(comments.publishedAt, row.publishedAt ?? ''),
          )) })
          .from(comments)

        threadGrowth = Number(threadReplies[0]?.total ?? 0)

        // Check if the commenter themselves replied
        const commenterReply = await db.query.comments.findFirst({
          where: and(
            eq(comments.parentId, row.commentId),
            eq(comments.authorChannelId, parentComment.authorChannelId),
            gt(comments.publishedAt, row.publishedAt ?? ''),
          ),
          columns: { id: true },
        })
        commenterRepliedBack = !!commenterReply
      }

      await db
        .update(publishedReplies)
        .set({
          likeCount,
          commenterRepliedBack,
          threadGrowthAfter: threadGrowth,
          replyMetricsSyncedAt: new Date().toISOString(),
        })
        .where(eq(publishedReplies.id, row.id))

      updated++
      await new Promise(r => setTimeout(r, 100)) // respect quota
    } catch (err) {
      await logger.warn('reply-analytics', `Failed to sync reply ${row.id}`, { error: (err as Error).message })
    }
  }

  return { updated }
}

/**
 * Aggregate reply performance stats for the analytics dashboard.
 */
export async function getReplyPerformanceStats() {
  const db = useDb()

  const rows = await db
    .select({
      id: publishedReplies.id,
      likeCount: publishedReplies.likeCount,
      commenterRepliedBack: publishedReplies.commenterRepliedBack,
      threadGrowthAfter: publishedReplies.threadGrowthAfter,
      finalText: publishedReplies.finalText,
    })
    .from(publishedReplies)
    .where(gt(publishedReplies.likeCount, 0))

  if (rows.length === 0) return { avgLikes: 0, reEngagementRate: 0, bestReplies: [] }

  const avgLikes = rows.reduce((s, r) => s + (r.likeCount ?? 0), 0) / rows.length
  const reEngaged = rows.filter(r => r.commenterRepliedBack).length
  const reEngagementRate = Math.round((reEngaged / rows.length) * 100)

  const bestReplies = rows
    .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))
    .slice(0, 5)
    .map(r => ({
      text: r.finalText.slice(0, 120),
      likes: r.likeCount,
      reEngaged: r.commenterRepliedBack,
      threadGrowth: r.threadGrowthAfter,
    }))

  return { avgLikes: Math.round(avgLikes * 10) / 10, reEngagementRate, bestReplies }
}
