import { autoSuggestPendingComments } from '../services/auto-suggest'
import { syncComments } from '../services/comment-sync'
import { runDbCleanup } from '../services/db-cleanup'
import { getSetting } from '../utils/settings'

async function maybeTriggerAutoSuggest(): Promise<void> {
  const enabled = (await getSetting('auto_suggest_enabled', 'false')) === 'true'
  if (enabled) {
    autoSuggestPendingComments().catch(() => {})
  }
}

export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  const intervalMs = (config.syncIntervalMinutes ?? 30) * 60 * 1000

  // Initial recent sync after 30 seconds (controlled via AUTO_SYNC_ON_START)
  if (config.autoSyncOnStart) {
    setTimeout(async () => {
      await syncComments('scheduled', 'recent').catch(() => {})
      await maybeTriggerAutoSuggest()
      await runDbCleanup().catch(() => {})
    }, 30_000)
  }

  // Recurring recent sync — only videos from last 180 days
  setInterval(async () => {
    await syncComments('scheduled', 'recent').catch(() => {})
    await maybeTriggerAutoSuggest()
  }, intervalMs)

  // Deep scan — all videos, 4 times per day (every 6h)
  setInterval(async () => {
    await syncComments('scheduled', 'all').catch(() => {})
    await maybeTriggerAutoSuggest()
  }, 6 * 60 * 60 * 1000)

  // DB Maintenance — once per day (every 24h)
  setInterval(async () => {
    await runDbCleanup().catch(() => {})
  }, 24 * 60 * 60 * 1000)

  console.log(`[scheduler] Recent sync every ${config.syncIntervalMinutes}min | Deep scan every 6h | DB Cleanup every 24h`)
})
