
import Database from 'better-sqlite3'
import { resolve } from 'node:path'

async function check() {
  const localPath = resolve(process.cwd(), './data/youtube.db')
  const sqlite = new Database(localPath)
  
  console.log('Checking comments table in LOCAL...')
  const uniqueAuthorsWithImage = sqlite.prepare("SELECT COUNT(DISTINCT author_channel_id) as count FROM comments WHERE author_profile_image_url IS NOT NULL AND author_profile_image_url != ''").get().count
  console.log(`Unique authors with at least one image in LOCAL comments: ${uniqueAuthorsWithImage}`)
  
  sqlite.close()
}

check().catch(console.error)
