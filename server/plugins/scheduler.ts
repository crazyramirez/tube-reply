import { syncComments } from '../services/comment-sync'

export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  const intervalMs = (config.syncIntervalMinutes ?? 30) * 60 * 1000

  // Initial recent sync after 30 seconds (let server fully start)
  setTimeout(async () => {
    await syncComments('scheduled', 'recent').catch(() => {})
  }, 30_000)

  // Recurring recent sync — only videos from last 180 days
  setInterval(async () => {
    await syncComments('scheduled', 'recent').catch(() => {})
  }, intervalMs)

  // Deep scan — all 500 videos, twice per day (every 12h)
  setInterval(async () => {
    await syncComments('scheduled', 'all').catch(() => {})
  }, 12 * 60 * 60 * 1000)

  console.log(`[scheduler] Recent sync every ${config.syncIntervalMinutes}min | Deep scan every 24h`)
})
