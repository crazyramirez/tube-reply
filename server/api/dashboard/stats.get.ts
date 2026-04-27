import { eq, and, count, isNull, desc, or, sql } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { comments, videos, publishedReplies } from '../../db/schema'

const COMMENT_PAGE_SIZE = 4

export default defineEventHandler(async (event) => {
  const db = useDb()
  const query = getQuery(event)
  const commentPage = Math.max(1, Number(query.commentPage ?? 1))
  const commentOffset = (commentPage - 1) * COMMENT_PAGE_SIZE

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
    recentVideos,
  ] = await Promise.all([
    db.select({ pending: count(comments.id) }).from(comments)
      .where(and(eq(comments.status, 'pending'), isNull(comments.parentId))),

    db.select({ suggested: count(comments.id) }).from(comments)
      .where(and(eq(comments.status, 'suggested'), isNull(comments.parentId))),

    db.select({ publishedToday: count(publishedReplies.id) }).from(publishedReplies)
      .where(sql`date(${publishedReplies.publishedAt}, 'localtime') = date('now', 'localtime')`),

    db.select({ totalPublished: count(publishedReplies.id) }).from(publishedReplies),

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
      authorProfileImageUrl: comments.authorProfileImageUrl,
      authorChannelId: comments.authorChannelId,
    })
      .from(comments)
      .leftJoin(videos, eq(comments.videoId, videos.id))
      .where(needsAttentionWhere)
      .orderBy(desc(comments.publishedAt))
      .limit(COMMENT_PAGE_SIZE)
      .offset(commentOffset),

    db.select({ recentCommentsTotal: count(comments.id) })
      .from(comments)
      .where(needsAttentionWhere),

    db.select({
      id: videos.id,
      title: videos.title,
      publishedAt: videos.publishedAt,
      thumbnailUrl: videos.thumbnailUrl,
      viewCount: videos.viewCount,
      likeCount: videos.likeCount,
      commentCount: videos.commentCount,
    })
      .from(videos)
      .orderBy(desc(videos.publishedAt))
      .limit(4),
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
    recentVideos,
  }
})
