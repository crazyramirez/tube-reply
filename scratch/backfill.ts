
import { backfillAuthorsTable, backfillMissingAvatars } from '../server/services/comment-sync'

async function backfill() {
  console.log('Starting backfill of authors table...')
  const authorsFilled = await backfillAuthorsTable()
  console.log(`Backfilled ${authorsFilled} unique authors.`)
  
  console.log('Healing comments table avatars...')
  const commentsHealed = await backfillMissingAvatars()
  console.log(`Healed ${commentsHealed} comment avatars.`)
  
  console.log('Backfill process completed successfully.')
  process.exit(0)
}

// Set up environment for the script
process.env.DATABASE_URL = './data/youtube.db'
// Mock useRuntimeConfig
global.useRuntimeConfig = () => ({ dbUrl: './data/youtube.db' })

backfill().catch(err => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
