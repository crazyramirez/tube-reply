import { autoSuggestPendingComments } from '../../services/auto-suggest'

export default defineEventHandler(async () => {
  autoSuggestPendingComments().catch(() => {})
  return { ok: true, message: 'AI suggestion process started' }
})
