import { eq, ne, and, desc, count, isNull, inArray, sql } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { comments, videos, authors } from '../../db/schema'
import { getVideoTranscript } from '../../services/captions-service'

const INBOX_STATUSES = ['pending', 'suggested'] as const

export default defineEventHandler(async (event) => {
  const db = useDb()
  const query = getQuery(event)

  const statusParam = (query.status as string) || 'inbox'
  const intentParam = query.intent as string | undefined
  const isInbox = statusParam === 'inbox'
  const videoId = query.videoId as string | undefined
  const authorId = query.authorId as string | undefined
  const searchParam = (query.search as string | undefined)?.trim() || ''
  const page = Math.max(1, Number(query.page ?? 1))
  const limit = Math.min(50, Math.max(1, Number(query.limit ?? 20)))
  const offset = (page - 1) * limit

  const statusCondition = statusParam === 'all'
    ? sql`1=1`
    : isInbox
      ? inArray(comments.status, INBOX_STATUSES)
      : eq(comments.status, statusParam as 'pending' | 'suggested' | 'dismissed' | 'published' | 'skipped')

  const searchCondition = searchParam
    ? sql`(
        LOWER(${comments.text}) LIKE LOWER(${'%' + searchParam + '%'})
        OR LOWER(COALESCE(${comments.lastActivityText}, '')) LIKE LOWER(${'%' + searchParam + '%'})
        OR LOWER(COALESCE(${comments.authorName}, '')) LIKE LOWER(${'%' + searchParam + '%'})
        OR LOWER(COALESCE(${videos.title}, '')) LIKE LOWER(${'%' + searchParam + '%'})
        OR EXISTS (
          SELECT 1 FROM published_replies pr
          WHERE pr.comment_id = ${comments.id}
          AND LOWER(COALESCE(pr.final_text, '')) LIKE LOWER(${'%' + searchParam + '%'})
        )
        OR EXISTS (
          SELECT 1 FROM suggested_replies sr
          WHERE sr.comment_id = ${comments.id}
          AND LOWER(COALESCE(sr.response_text, sr.edited_text, '')) LIKE LOWER(${'%' + searchParam + '%'})
        )
      )`
    : sql`1=1`

  const token = await db.query.oauthTokens.findFirst({ 
    columns: { 
      channelId: true,
      channelTitle: true
    } 
  })
  const ownerChannelId = token?.channelId
  const ownerAuthor = ownerChannelId ? await db.query.authors.findFirst({
    where: eq(authors.channelId, ownerChannelId)
  }) : null
  const ownerName = ownerAuthor?.name || token?.channelTitle

  const whereConditions = [
    isNull(comments.parentId),
    statusCondition,
    searchCondition,
    ...(videoId ? [eq(comments.videoId, videoId)] : []),
    ...(intentParam ? [eq(comments.detectedIntent, intentParam)] : []),
    ...(authorId ? [eq(comments.authorChannelId, authorId)] : []),
    ...(ownerChannelId ? [ne(comments.authorChannelId, ownerChannelId)] : []),
  ]

  // TARGETED TRANSCRIPT FETCH: If user is filtering by video, ensure we have the transcript
  if (videoId) {
    getVideoTranscript(videoId).catch(() => {})
  }


  const orderBy = isInbox
      ? [sql`CASE WHEN ${comments.status} = 'suggested' THEN 0 ELSE 1 END`, desc(comments.lastActivityAt)]
      : [desc(comments.lastActivityAt)]

  const rows = await db
    .select({
      id: comments.id,
      videoId: comments.videoId,
      authorName: comments.authorName,
      authorChannelId: comments.authorChannelId,
      authorProfileImageUrl: sql<string>`COALESCE(${authors.profileImageUrl}, ${comments.authorProfileImageUrl})`,
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
      isLive: comments.isLive,
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
    .leftJoin(authors, eq(comments.authorChannelId, authors.channelId))
    .where(and(...whereConditions))
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset)

  const [{ value: total }] = await db
    .select({ value: count(comments.id) })
    .from(comments)
    .leftJoin(videos, eq(comments.videoId, videos.id))
    .where(and(...whereConditions))

  const normalize = (s: string) => (s || '').trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")

  const enrichedRows = rows.map(row => {
    const lastAuthorName = normalize(row.lastAuthor || row.authorName)
    const oName = normalize(ownerName)
    
    const isLastAuthorOwner = 
      (ownerChannelId && row.authorChannelId === ownerChannelId) || 
      (oName && lastAuthorName === oName)
    
    return {
      ...row,
      isLastAuthorOwner
    }
  })

  return {
    items: enrichedRows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  }
})
