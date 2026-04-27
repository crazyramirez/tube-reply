import { getSentimentTrend } from '../../services/analytics-engine'

export default defineEventHandler(async () => {
  return getSentimentTrend()
})
