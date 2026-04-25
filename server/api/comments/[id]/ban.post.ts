import { eq } from 'drizzle-orm'
import { useDb } from '../../../utils/db'
import { comments, bannedAuthors } from '../../../db/schema'
import { getAuthenticatedYouTube } from '../../../utils/youtube'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing comment ID',
    })
  }

  const db = useDb()
  const comment = await db.query.comments.findFirst({
    where: eq(comments.id, id),
  })

  if (!comment) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Comment not found',
    })
  }

  const yt = await getAuthenticatedYouTube()

  // 1. YouTube API: setModerationStatus to rejected with banAuthor=true
  // This effectively bans the user from the channel
  try {
    await yt.comments.setModerationStatus({
      id: [id],
      moderationStatus: 'rejected',
      banAuthor: true,
    })
  } catch (err: any) {
    console.error('YouTube ban failed:', err)
    // We continue anyway to mark it locally, or maybe we should fail?
    // If it's a "user already banned" error, we should still record it locally.
  }

  // 2. Locally record the ban if we have the channel ID
  if (comment.authorChannelId) {
    await db.insert(bannedAuthors).values({
      channelId: comment.authorChannelId,
      authorName: comment.authorName,
    }).onConflictDoNothing()

    // 3. Mark all comments from this author as dismissed
    await db.update(comments)
      .set({ status: 'dismissed', processedAt: new Date().toISOString() })
      .where(eq(comments.authorChannelId, comment.authorChannelId))
  } else {
    // Just mark this comment as dismissed if no channel ID
    await db.update(comments)
      .set({ status: 'dismissed', processedAt: new Date().toISOString() })
      .where(eq(comments.id, id))
  }

  return { success: true }
})
