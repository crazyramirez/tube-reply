import { eq } from 'drizzle-orm'
import { useDb } from '../../../utils/db'
import { comments } from '../../../db/schema'
import { getAuthenticatedYouTube } from '../../../utils/youtube'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing comment ID',
    })
  }

  const yt = await getAuthenticatedYouTube()

  // 1. YouTube API: setModerationStatus to rejected with banAuthor=true
  // This effectively bans the user from the channel
  await yt.comments.setModerationStatus({
    id: [id],
    moderationStatus: 'rejected',
    banAuthor: true,
  })

  // 2. Locally, we mark it as dismissed
  const db = useDb()
  await db.update(comments)
    .set({ status: 'dismissed', processedAt: new Date().toISOString() })
    .where(eq(comments.id, id))

  return { success: true }
})
