import { syncComments } from '../../services/comment-sync'

export default defineEventHandler(async (_event) => {
  // Run sync in background, return immediately
  syncComments('manual').catch(() => {})
  return { ok: true, message: 'Sync started' }
})
