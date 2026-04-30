import { eq } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { getAuthenticatedYouTube } from '../utils/youtube'
import { logger } from '../utils/logger'
import { comments, suggestedReplies, publishedReplies } from '../db/schema'
import { assertQuotaAvailable } from '../utils/quota'

export async function publishReply(commentId: string, suggestionId: number): Promise<{ youtubeReplyId: string }> {
  const db = useDb()

  // Check if this specific suggestion has already been published
  const alreadyPublished = await db.query.publishedReplies.findFirst({
    where: eq(publishedReplies.suggestionId, suggestionId),
  })
  if (alreadyPublished) throw new Error('This specific suggestion has already been published')

  // Load suggestion
  const suggestion = await db.query.suggestedReplies.findFirst({
    where: eq(suggestedReplies.id, suggestionId),
  })
  if (!suggestion) throw new Error('Suggestion not found')
  if (suggestion.commentId !== commentId) throw new Error('Suggestion does not match comment')

  // Use edited text if available, otherwise generated text
  const finalText = suggestion.editedText ?? suggestion.responseText

  // Guard: comments.insert costs 50 quota units
  await assertQuotaAvailable(50)

  // Call YouTube API
  const yt = await getAuthenticatedYouTube()

  const response = await yt.comments.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        parentId: commentId, // replies to a top-level comment use its ID as parentId
        textOriginal: finalText,
      },
    },
  })

  const youtubeReplyId = response.data.id
  if (!youtubeReplyId) throw new Error('YouTube did not return a reply ID')

  // Record published reply
  await db.insert(publishedReplies).values({
    commentId,
    suggestionId,
    youtubeReplyId,
    finalText,
    publishedBy: 'owner',
  })

  // Update statuses and denormalized activity
  await db.update(comments)
    .set({ 
      status: 'published',
      lastActivityAt: new Date().toISOString(),
      lastActivityText: finalText,
      lastActivityAuthor: 'You'
    })
    .where(eq(comments.id, commentId))

  await db.update(suggestedReplies)
    .set({ status: 'published', reviewedAt: new Date().toISOString() })
    .where(eq(suggestedReplies.id, suggestionId))

  await logger.info('reply-publisher', 'Reply published', { commentId, youtubeReplyId })

  return { youtubeReplyId }
}

export async function updateReply(youtubeReplyId: string, text: string): Promise<{ ok: boolean }> {
  const db = useDb()
  
  // Guard: comments.update costs 50 quota units
  await assertQuotaAvailable(50)

  // Call YouTube API
  const yt = await getAuthenticatedYouTube()
  await yt.comments.update({
    part: ['snippet'],
    requestBody: {
      id: youtubeReplyId,
      snippet: {
        textOriginal: text,
      },
    },
  })

  // Update local DB
  // First, check if it's in our comments table (synced from YouTube)
  await db.update(comments)
    .set({ text, updatedAt: new Date().toISOString() })
    .where(eq(comments.id, youtubeReplyId))

  // Also update in publishedReplies table if it exists there
  await db.update(publishedReplies)
    .set({ finalText: text, publishedAt: new Date().toISOString() })
    .where(eq(publishedReplies.youtubeReplyId, youtubeReplyId))

  await logger.info('reply-publisher', 'Reply updated', { youtubeReplyId })

  return { ok: true }
}

export async function deleteReply(youtubeReplyId: string): Promise<{ ok: boolean }> {
  const db = useDb()

  // Guard: comments.delete costs 50 quota units
  await assertQuotaAvailable(50)

  // Call YouTube API
  const yt = await getAuthenticatedYouTube()
  await yt.comments.delete({
    id: youtubeReplyId,
  })

  // Update local DB
  await db.delete(comments).where(eq(comments.id, youtubeReplyId))
  await db.delete(publishedReplies).where(eq(publishedReplies.youtubeReplyId, youtubeReplyId))

  await logger.info('reply-publisher', 'Reply deleted', { youtubeReplyId })

  return { ok: true }
}
