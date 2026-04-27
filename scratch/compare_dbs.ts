
import Database from 'better-sqlite3'
import { resolve } from 'node:path'

async function compare() {
  const localPath = resolve(process.cwd(), './data/youtube.db')
  const prodPath = resolve(process.cwd(), './data/db_prod.db')
  
  console.log('--- LOCAL DB ---')
  const local = new Database(localPath)
  printStats(local)
  local.close()
  
  console.log('\n--- PROD DB ---')
  const prod = new Database(prodPath)
  printStats(prod)
  prod.close()
}

function printStats(db: any) {
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM comments').get().count
    const withChannel = db.prepare('SELECT COUNT(*) as count FROM comments WHERE author_channel_id IS NOT NULL AND author_channel_id != \'\'').get().count
    const withImage = db.prepare('SELECT COUNT(*) as count FROM comments WHERE author_profile_image_url IS NOT NULL AND author_profile_image_url != \'\'').get().count
    const uniqueAuthors = db.prepare('SELECT COUNT(DISTINCT author_channel_id) as count FROM comments WHERE author_channel_id IS NOT NULL AND author_channel_id != \'\'').get().count
    
    // Check if authors table exists
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='authors'").get()
    let authorsCount = 0
    if (tableExists) {
      authorsCount = db.prepare('SELECT COUNT(*) as count FROM authors').get().count
    }

    console.log(`Total comments: ${total}`)
    console.log(`Comments with author ID: ${withChannel}`)
    console.log(`Comments with image: ${withImage}`)
    console.log(`Unique authors in comments: ${uniqueAuthors}`)
    console.log(`Authors table exists: ${!!tableExists}`)
    console.log(`Authors table count: ${authorsCount}`)
    
    if (uniqueAuthors > 0) {
        const sample = db.prepare('SELECT author_channel_id, author_name, author_profile_image_url FROM comments WHERE author_channel_id IS NOT NULL LIMIT 3').all()
        console.log('Sample comments author data:', JSON.stringify(sample, null, 2))
    }
  } catch (e: any) {
    console.error('Error reading stats:', e.message)
  }
}

compare().catch(console.error)
