import { eq } from 'drizzle-orm'
import { useDb } from '../../../utils/db'
import { comments, suggestedReplies, publishedReplies } from '../../../db/schema'
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
  const yt = await getAuthenticatedYouTube()

  try {
    // 1. Delete from YouTube
    await yt.comments.delete({ id })
  }
  catch (err: any) {
    // If already deleted on YouTube, we still want to clean up local DB
    const msg = err.message?.toLowerCase() || ''
    if (!msg.includes('notfound') && !msg.includes('404')) {
      throw err
    }
  }

  // 2. Clean up local DB
  // Delete replies in this thread first (if it's a parent)
  await db.delete(comments).where(eq(comments.parentId, id))

  // Delete suggestions and published records
  await db.delete(suggestedReplies).where(eq(suggestedReplies.commentId, id))
  await db.delete(publishedReplies).where(eq(publishedReplies.commentId, id))

  // Finally delete the comment itself
  await db.delete(comments).where(eq(comments.id, id))

  return { success: true }
})
