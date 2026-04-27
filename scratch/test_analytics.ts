
import { getAudienceStats, getAnalyticsOverview } from '../server/services/analytics-engine'

async function test() {
  console.log('Testing Analytics Stats...')
  const audience = await getAudienceStats()
  console.log('Audience Stats:', JSON.stringify(audience, null, 2))
  
  const overview = await getAnalyticsOverview()
  console.log('Overview Stats:', JSON.stringify(overview, null, 2))
}

test()
