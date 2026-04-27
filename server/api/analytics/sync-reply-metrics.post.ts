import { syncReplyMetrics } from '../../services/reply-analytics'

export default defineEventHandler(async () => {
  return syncReplyMetrics()
})
