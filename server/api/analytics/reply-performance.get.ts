import { getReplyPerformanceStats } from '../../services/reply-analytics'

export default defineEventHandler(async () => {
  return getReplyPerformanceStats()
})
