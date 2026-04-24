import { eq } from 'drizzle-orm'
import { useDb } from '../../../utils/db'
import { videoSummaries } from '../../../db/schema'

export default defineEventHandler(async (event) => {
  const db = useDb()
  const videoId = getRouterParam(event, 'id')!

  const summary = await db.query.videoSummaries.findFirst({
    where: eq(videoSummaries.videoId, videoId),
  })

  return { summary: summary ?? null }
})
