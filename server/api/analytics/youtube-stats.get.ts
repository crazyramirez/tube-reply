import { getChannelAnalyticsSummary } from '../../services/youtube-analytics-service'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const dayRange = Math.min(Number(query.days ?? 28), 90)

  const summary = await getChannelAnalyticsSummary(dayRange)

  return { summary, hasData: summary !== null }
})
