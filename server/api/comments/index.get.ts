import { eq, and, desc, count, isNull, inArray, sql } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { comments, videos, publishedReplies } from '../../db/schema'

const INBOX_STATUSES = ['pending', 'suggested'] as const

export default defineEventHandler(async (event) => {
  const db = useDb()
  const query = getQuery(event)

  const statusParam = (query.status as string) || 'inbox'
  const isInbox = statusParam === 'inbox'
  const videoId = query.videoId as string | undefined
  const page = Math.max(1, Number(query.page ?? 1))
  const limit = Math.min(50, Math.max(1, Number(query.limit ?? 20)))
  const offset = (page - 1) * limit

  const statusCondition = isInbox
    ? inArray(comments.status, INBOX_STATUSES)
    : eq(comments.status, statusParam as 'pending' | 'suggested' | 'dismissed' | 'published' | 'skipped')

  const whereConditions = [
    isNull(comments.parentId),
    statusCondition,
    ...(videoId ? [eq(comments.videoId, videoId)] : []),
  ]

  // Inbox: suggested first (ready to act on), then pending — within each group by recency of last activity
  const lastActivitySql = sql`COALESCE((SELECT published_at FROM comments c2 WHERE c2.parent_id = ${comments.id} ORDER BY published_at DESC LIMIT 1), ${comments.publishedAt})`;
  
  const orderBy = isInbox
    ? [sql`CASE WHEN ${comments.status} = 'suggested' THEN 0 ELSE 1 END`, desc(lastActivitySql)]
    : [desc(lastActivitySql)]

  // Pre-calculate last activity parts in a more efficient way for SQLite
  // We use correlated subqueries but only those strictly necessary
  const latestReplySubquery = (field: 'text' | 'author_name' | 'published_at') => sql<string>`(
    SELECT ${sql.raw(field)} FROM comments c2 
    WHERE c2.parent_id = ${comments.id} 
    ORDER BY published_at DESC 
    LIMIT 1
  )`

  const rows = await db
    .select({
      id: comments.id,
      videoId: comments.videoId,
      authorName: comments.authorName,
      text: comments.text,
      lastText: sql<string>`COALESCE(${latestReplySubquery('text')}, ${comments.text})`,
      lastAuthor: sql<string>`COALESCE(${latestReplySubquery('author_name')}, ${comments.authorName})`,
      likeCount: comments.likeCount,
      detectedLang: comments.detectedLang,
      langConfidence: comments.langConfidence,
      publishedAt: comments.publishedAt,
      lastActivityAt: sql<string>`COALESCE(${latestReplySubquery('published_at')}, ${comments.publishedAt})`,
      status: comments.status,
      fetchedAt: comments.fetchedAt,
      videoTitle: videos.title,
      videoThumbnail: videos.thumbnailUrl,
      replyText: sql<string | null>`(
        SELECT final_text FROM published_replies
        WHERE comment_id = ${comments.id}
        ORDER BY published_at DESC
        LIMIT 1
      )`,
      suggestedReplyText: sql<string | null>`(
        SELECT COALESCE(edited_text, response_text) FROM suggested_replies
        WHERE comment_id = ${comments.id}
        AND status = 'pending_review'
        ORDER BY generated_at DESC
        LIMIT 1
      )`,
    })
    .from(comments)
    .leftJoin(videos, eq(comments.videoId, videos.id))
    .where(and(...whereConditions))
    .orderBy(...orderBy)
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
