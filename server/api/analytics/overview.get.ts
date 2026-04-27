import { getAnalyticsOverview } from '../../services/analytics-engine'

export default defineEventHandler(async () => {
  return getAnalyticsOverview()
})
