import { eq } from 'drizzle-orm'
import { useDb } from '../../../utils/db'
import { videoSummaries } from '../../../db/schema'
import { generateVideoSummary } from '../../../services/video-summary'

export default defineEventHandler(async (event) => {
  const db = useDb()
  const videoId = getRouterParam(event, 'id')!

  // Delete existing so generateVideoSummary will regenerate
  await db.delete(videoSummaries).where(eq(videoSummaries.videoId, videoId))

  await generateVideoSummary(videoId)

  const summary = await db.query.videoSummaries.findFirst({
    where: eq(videoSummaries.videoId, videoId),
  })

  return { summary: summary ?? null }
})
