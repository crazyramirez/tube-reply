import { getTopTopics } from '../../services/analytics-engine'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const limit = Math.min(30, Number(query.limit ?? 15))
  return getTopTopics(limit, event)

})
