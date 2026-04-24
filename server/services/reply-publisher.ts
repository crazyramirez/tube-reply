import { eq } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { getAuthenticatedYouTube } from '../utils/youtube'
import { logger } from '../utils/logger'
import { comments, suggestedReplies, publishedReplies } from '../db/schema'

export async function publishReply(commentId: string, suggestionId: number): Promise<{ youtubeReplyId: string }> {
  const db = useDb()

  // Check not already published
  const alreadyPublished = await db.query.publishedReplies.findFirst({
    where: eq(publishedReplies.commentId, commentId),
  })
  if (alreadyPublished) throw new Error('Reply already published for this comment')

  // Load suggestion
  const suggestion = await db.query.suggestedReplies.findFirst({
    where: eq(suggestedReplies.id, suggestionId),
  })
  if (!suggestion) throw new Error('Suggestion not found')
  if (suggestion.commentId !== commentId) throw new Error('Suggestion does not match comment')

  // Use edited text if available, otherwise generated text
  const finalText = suggestion.editedText ?? suggestion.responseText

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

  // Update statuses
  await db.update(comments)
    .set({ status: 'published' })
    .where(eq(comments.id, commentId))

  await db.update(suggestedReplies)
    .set({ status: 'published', reviewedAt: new Date().toISOString() })
    .where(eq(suggestedReplies.id, suggestionId))

  await logger.info('reply-publisher', 'Reply published', { commentId, youtubeReplyId })

  return { youtubeReplyId }
}
