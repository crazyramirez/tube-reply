import { eq, and, isNotNull } from 'drizzle-orm'
import { useDb } from '../../../utils/db'
import { comments, videos, suggestedReplies, publishedReplies, bannedAuthors, oauthTokens } from '../../../db/schema'

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
  const token = await db.query.oauthTokens.findFirst({ 
    columns: { 
      channelId: true,
      channelThumbnailUrl: true 
    } 
  })
  const ownerChannelId = token?.channelId
  const ownerThumbnail = token?.channelThumbnailUrl

  const replies = await db.query.comments.findMany({
    where: and(eq(comments.videoId, comment.videoId), isNotNull(comments.parentId), eq(comments.parentId, id)),
    columns: { id: true, authorName: true, text: true, publishedAt: true, authorChannelId: true, authorProfileImageUrl: true },
    orderBy: (c, { asc }) => [asc(c.publishedAt)],
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

  // Published replies (our own responses)
  const published = await db.query.publishedReplies.findMany({
    where: eq(publishedReplies.commentId, id),
    orderBy: (pr, { asc }) => [asc(pr.publishedAt)],
  })

  // Unified Thread: YouTube replies + Our published replies (Deduplicated by YouTube ID)
  const threadMap = new Map<string, any>()
  
  // 1. Add YouTube replies
  enrichedReplies.forEach(r => threadMap.set(r.id, r))

  // 2. Add local published replies (will overwrite if same ID, or add if local-only)
  published.forEach(p => {
    const id = p.youtubeReplyId || `local-${p.id}`
    // If we already have this ID from YouTube, we keep the YouTube version 
    // but if it's local only or YouTube version is missing, we add it.
    if (!threadMap.has(p.youtubeReplyId || '')) {
       threadMap.set(id, {
        id,
        authorName: 'You', 
        text: p.finalText,
        publishedAt: p.publishedAt,
        isOwner: true,
        isLocal: !p.youtubeReplyId
      })
    }
  })

  const threadReplies = Array.from(threadMap.values())
    .sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime())

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
      status: (hasOwnerReplied && (comment.status === 'suggested' || comment.status === 'skipped')) ? 'published' : comment.status
    },
    video,
    replies: threadReplies,
    suggestions: suggestions.map(s => ({
      ...s,
      contextUsed: s.contextUsed ? JSON.parse(s.contextUsed) : null,
      videoLinksUsed: s.videoLinksUsed ? JSON.parse(s.videoLinksUsed) : [],
    })),
    publishedReply: published[published.length - 1] ?? null,
    ownerThumbnail,
  }
})
