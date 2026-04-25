import { eq } from 'drizzle-orm'
import { useDb } from '../../../utils/db'
import { comments, bannedAuthors } from '../../../db/schema'

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

  // 1. Locally remove the ban
  if (comment.authorChannelId) {
    await db.delete(bannedAuthors)
      .where(eq(bannedAuthors.channelId, comment.authorChannelId))

    // 2. Mark all comments from this author as pending again (only those that were dismissed)
    // Actually, maybe we only want to mark the current one? 
    // Usually, unbanning means we want to see their stuff again.
    await db.update(comments)
      .set({ status: 'pending', processedAt: null })
      .where(eq(comments.authorChannelId, comment.authorChannelId))
  } else {
    // Just mark this comment as pending
    await db.update(comments)
      .set({ status: 'pending', processedAt: null })
      .where(eq(comments.id, id))
  }

  // NOTE: We cannot unban on YouTube via API easily. 
  // The user should be informed they need to do it manually in YouTube Studio.

  return { 
    success: true,
    message: 'User unbanned locally. Please also remove them from "Hidden users" in YouTube Studio.'
  }
})
