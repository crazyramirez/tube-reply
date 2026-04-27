import { getAudienceStats } from '../../services/analytics-engine'

export default defineEventHandler(async () => {
  return getAudienceStats()
})
