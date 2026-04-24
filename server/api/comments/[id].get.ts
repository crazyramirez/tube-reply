import { eq, and, isNotNull } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { comments, videos, suggestedReplies, publishedReplies } from '../../db/schema'

export default defineEventHandler(async (event) => {
  const db = useDb()
  const id = getRouterParam(event, 'id')!

  const comment = await db.query.comments.findFirst({
    where: eq(comments.id, id),
  })
  if (!comment) throw createError({ statusCode: 404, statusMessage: 'Comment not found' })

  const video = await db.query.videos.findFirst({
    where: eq(videos.id, comment.videoId),
  })

  // Thread replies
  const replies = await db.query.comments.findMany({
    where: and(eq(comments.videoId, comment.videoId), isNotNull(comments.parentId), eq(comments.parentId, id)),
    columns: { id: true, authorName: true, text: true, publishedAt: true, authorChannelId: true },
  })

  // Suggestions for this comment
  const suggestions = await db.query.suggestedReplies.findMany({
    where: eq(suggestedReplies.commentId, id),
    orderBy: (s, { desc }) => [desc(s.generatedAt)],
  })

  // Published reply if any
  const published = await db.query.publishedReplies.findFirst({
    where: eq(publishedReplies.commentId, id),
  })

  return {
    comment,
    video,
    replies,
    suggestions: suggestions.map(s => ({
      ...s,
      contextUsed: s.contextUsed ? JSON.parse(s.contextUsed) : null,
      videoLinksUsed: s.videoLinksUsed ? JSON.parse(s.videoLinksUsed) : [],
    })),
    publishedReply: published ?? null,
  }
})
