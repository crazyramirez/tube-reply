import { batchFetchTranscripts } from '../../services/captions-service'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  // limit: how many videos to process this run (default 30, max 100)
  const limit = Math.min(Number(body?.limit ?? 30), 100)
  // delayMs: pause between YouTube API calls (default 1500ms)
  const delayMs = Math.max(Number(body?.delayMs ?? 1500), 500)

  const result = await batchFetchTranscripts(limit, delayMs)

  return result
})
