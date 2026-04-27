import { eq, and, desc, count, isNull, inArray, sql } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { comments, videos } from '../../db/schema'

const INBOX_STATUSES = ['pending', 'suggested'] as const

export default defineEventHandler(async (event) => {
  const db = useDb()
  const query = getQuery(event)

  const statusParam = (query.status as string) || 'inbox'
  const intentParam = query.intent as string | undefined
  const isInbox = statusParam === 'inbox'
  const isPriority = statusParam === 'priority'
  const videoId = query.videoId as string | undefined
  const page = Math.max(1, Number(query.page ?? 1))
  const limit = Math.min(50, Math.max(1, Number(query.limit ?? 20)))
  const offset = (page - 1) * limit

  const statusCondition = statusParam === 'all'
    ? sql`1=1`
    : (isInbox || isPriority)
      ? inArray(comments.status, INBOX_STATUSES)
      : eq(comments.status, statusParam as 'pending' | 'suggested' | 'dismissed' | 'published' | 'skipped')


  const whereConditions = [
    isNull(comments.parentId),
    statusCondition,
    ...(videoId ? [eq(comments.videoId, videoId)] : []),
    ...(intentParam ? [eq(comments.detectedIntent, intentParam)] : []),
  ]


  const orderBy = isPriority
    ? [desc(comments.priorityScore), sql`CASE WHEN ${comments.status} = 'suggested' THEN 0 ELSE 1 END`]
    : isInbox
      ? [sql`CASE WHEN ${comments.status} = 'suggested' THEN 0 ELSE 1 END`, desc(comments.lastActivityAt)]
      : [desc(comments.lastActivityAt)]

  const rows = await db
    .select({
      id: comments.id,
      videoId: comments.videoId,
      authorName: comments.authorName,
      authorChannelId: comments.authorChannelId,
      text: comments.text,
      lastText: comments.lastActivityText,
      lastAuthor: comments.lastActivityAuthor,
      likeCount: comments.likeCount,
      detectedLang: comments.detectedLang,
      langConfidence: comments.langConfidence,
      publishedAt: comments.publishedAt,
      lastActivityAt: comments.lastActivityAt,
      status: comments.status,
      fetchedAt: comments.fetchedAt,
      priorityScore: comments.priorityScore,
      priorityLabel: comments.priorityLabel,
      isReturnCommenter: comments.isReturnCommenter,
      opportunityFlags: comments.opportunityFlags,
      detectedIntent: comments.detectedIntent,
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
    .select({ value: count(comments.id) })
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
