
import { syncComments } from '../server/services/comment-sync'
import { useDb } from '../server/utils/db'

async function test() {
  try {
    const db = useDb()
    console.log('Starting manual sync...')
    const result = await syncComments('manual')
    console.log('Sync Result:', JSON.stringify(result, null, 2))
  } catch (err) {
    console.error('Sync failed:', err)
  }
}

test()
