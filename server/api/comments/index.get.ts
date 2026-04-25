import { eq, and, desc, count, isNull } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { comments, videos, publishedReplies } from '../../db/schema'

export default defineEventHandler(async (event) => {
  const db = useDb()
  const query = getQuery(event)

  const status = (query.status as string) || 'pending'
  const videoId = query.videoId as string | undefined
  const page = Math.max(1, Number(query.page ?? 1))
  const limit = Math.min(50, Math.max(1, Number(query.limit ?? 20)))
  const offset = (page - 1) * limit

  const whereConditions = [
    isNull(comments.parentId), // top-level only
    eq(comments.status, status as 'pending' | 'suggested' | 'dismissed' | 'published' | 'skipped'),
    ...(videoId ? [eq(comments.videoId, videoId)] : []),
  ]

  const rows = await db
    .select({
      id: comments.id,
      videoId: comments.videoId,
      authorName: comments.authorName,
      text: comments.text,
      likeCount: comments.likeCount,
      detectedLang: comments.detectedLang,
      langConfidence: comments.langConfidence,
      publishedAt: comments.publishedAt,
      status: comments.status,
      fetchedAt: comments.fetchedAt,
      videoTitle: videos.title,
      videoThumbnail: videos.thumbnailUrl,
      replyText: publishedReplies.finalText,
    })
    .from(comments)
    .leftJoin(videos, eq(comments.videoId, videos.id))
    .leftJoin(publishedReplies, eq(comments.id, publishedReplies.commentId))
    .where(and(...whereConditions))
    .orderBy(desc(comments.publishedAt))
    .limit(limit)
    .offset(offset)

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(comments)
    .where(and(...whereConditions))

  return {
    items: rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  }
})
