import { eq, and, ne, isNull, desc, count, sum } from 'drizzle-orm'
import { useDb } from '../../../utils/db'
import { comments, videos } from '../../../db/schema'

export default defineEventHandler(async (event) => {
  const db = useDb()
  const id = getRouterParam(event, 'id')!

  const comment = await db.query.comments.findFirst({
    where: eq(comments.id, id),
    columns: { authorChannelId: true, authorName: true },
  })

  if (!comment?.authorChannelId) {
    return { total: 0, totalLikes: 0, firstSeenAt: null, items: [] }
  }

  const [stats] = await db
    .select({
      total: count(comments.id),
      totalLikes: sum(comments.likeCount),
    })
    .from(comments)
    .where(
      and(
        eq(comments.authorChannelId, comment.authorChannelId),
        isNull(comments.parentId)
      )
    )

  const items = await db
    .select({
      id: comments.id,
      text: comments.text,
      likeCount: comments.likeCount,
      publishedAt: comments.publishedAt,
      status: comments.status,
      videoTitle: videos.title,
      videoId: comments.videoId,
    })
    .from(comments)
    .leftJoin(videos, eq(comments.videoId, videos.id))
    .where(
      and(
        eq(comments.authorChannelId, comment.authorChannelId),
        isNull(comments.parentId),
        ne(comments.id, id)
      )
    )
    .orderBy(desc(comments.publishedAt))
    .limit(5)

  return {
    authorName: comment.authorName,
    total: stats.total,
    totalLikes: stats.totalLikes ?? 0,
    items,
  }
})
