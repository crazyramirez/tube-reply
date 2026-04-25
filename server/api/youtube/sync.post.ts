import { autoSuggestPendingComments } from '../../services/auto-suggest'
import { syncComments } from '../../services/comment-sync'
import { getSetting } from '../../utils/settings'

export default defineEventHandler(async (_event) => {
  // Run sync + optional auto-suggest in background, return immediately
  ;(async () => {
    await syncComments('manual').catch(() => {})
    const enabled = (await getSetting('auto_suggest_enabled', 'false')) === 'true'
    if (enabled) {
      await autoSuggestPendingComments().catch(() => {})
    }
  })()
  return { ok: true, message: 'Sync started' }
})
