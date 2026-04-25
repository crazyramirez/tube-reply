import { eq, and, isNotNull } from 'drizzle-orm'
import { useDb } from '../../../utils/db'
import { comments, videos, suggestedReplies, publishedReplies, bannedAuthors } from '../../../db/schema'

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
  const token = await db.query.oauthTokens.findFirst({ columns: { channelId: true } })
  const ownerChannelId = token?.channelId

  const replies = await db.query.comments.findMany({
    where: and(eq(comments.videoId, comment.videoId), isNotNull(comments.parentId), eq(comments.parentId, id)),
    columns: { id: true, authorName: true, text: true, publishedAt: true, authorChannelId: true },
  })

  const enrichedReplies = replies.map(r => ({
    ...r,
    isOwner: ownerChannelId && r.authorChannelId === ownerChannelId
  }))

  const hasOwnerReplied = enrichedReplies.some(r => r.isOwner)

  // Suggestions for this comment
  const suggestions = await db.query.suggestedReplies.findMany({
    where: eq(suggestedReplies.commentId, id),
    orderBy: (s, { desc }) => [desc(s.generatedAt)],
  })

  // Published reply if any
  const published = await db.query.publishedReplies.findFirst({
    where: eq(publishedReplies.commentId, id),
  })

  // Check if author is banned
  let isBanned = false
  if (comment.authorChannelId) {
    const ban = await db.query.bannedAuthors.findFirst({
      where: eq(bannedAuthors.channelId, comment.authorChannelId),
    })
    isBanned = !!ban
  }

  return {
    comment: {
      ...comment,
      isBanned,
      status: (hasOwnerReplied && comment.status !== 'published') ? 'published' : comment.status
    },
    video,
    replies: enrichedReplies,
    suggestions: suggestions.map(s => ({
      ...s,
      contextUsed: s.contextUsed ? JSON.parse(s.contextUsed) : null,
      videoLinksUsed: s.videoLinksUsed ? JSON.parse(s.videoLinksUsed) : [],
    })),
    publishedReply: published ?? null,
  }
})
