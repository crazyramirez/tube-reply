import { eq, and, gt, count, isNull, desc, or } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { comments, videos, publishedReplies } from '../../db/schema'

const COMMENT_PAGE_SIZE = 4

export default defineEventHandler(async (event) => {
  const db = useDb()
  const query = getQuery(event)
  const commentPage = Math.max(1, Number(query.commentPage ?? 1))
  const commentOffset = (commentPage - 1) * COMMENT_PAGE_SIZE

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayIso = todayStart.toISOString()

  const needsAttentionWhere = and(
    isNull(comments.parentId),
    or(eq(comments.status, 'pending'), eq(comments.status, 'suggested')),
  )

  const [
    [{ pending }],
    [{ suggested }],
    [{ publishedToday }],
    [{ totalPublished }],
    recentComments,
    [{ recentCommentsTotal }],
    topVideos,
  ] = await Promise.all([
    db.select({ pending: count() }).from(comments)
      .where(and(eq(comments.status, 'pending'), isNull(comments.parentId))),

    db.select({ suggested: count() }).from(comments)
      .where(and(eq(comments.status, 'suggested'), isNull(comments.parentId))),

    db.select({ publishedToday: count() }).from(publishedReplies)
      .where(gt(publishedReplies.publishedAt!, todayIso)),

    db.select({ totalPublished: count() }).from(publishedReplies),

    db.select({
      id: comments.id,
      videoId: comments.videoId,
      authorName: comments.authorName,
      text: comments.text,
      likeCount: comments.likeCount,
      detectedLang: comments.detectedLang,
      publishedAt: comments.publishedAt,
      status: comments.status,
      videoTitle: videos.title,
      videoThumbnail: videos.thumbnailUrl,
    })
      .from(comments)
      .leftJoin(videos, eq(comments.videoId, videos.id))
      .where(needsAttentionWhere)
      .orderBy(desc(comments.publishedAt))
      .limit(COMMENT_PAGE_SIZE)
      .offset(commentOffset),

    db.select({ recentCommentsTotal: count() })
      .from(comments)
      .where(needsAttentionWhere),

  ])

  return {
    comments: {
      pending,
      suggested,
      publishedToday,
      totalPublished,
    },
    recentComments,
    recentCommentsTotal,
  }
})
