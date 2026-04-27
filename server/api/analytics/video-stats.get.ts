import { getVideoCommentStats } from '../../services/analytics-engine'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const limit = Math.min(20, Number(query.limit ?? 8))
  return getVideoCommentStats(limit)
})
