import { syncYouTubeAnalytics } from '../../services/youtube-analytics-service'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const dayRange = Math.min(Number(body?.days ?? 28), 90)

  const result = await syncYouTubeAnalytics(dayRange)

  return result
})
