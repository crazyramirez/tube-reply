
import Database from 'better-sqlite3'
import { resolve } from 'node:path'

async function check() {
  const prodPath = resolve(process.cwd(), './data/db_prod.db')
  const sqlite = new Database(prodPath)
  
  console.log('Checking comments table in PROD...')
  const withImageCount = sqlite.prepare("SELECT COUNT(*) as count FROM comments WHERE author_profile_image_url IS NOT NULL AND author_profile_image_url != ''").get().count
  console.log(`Comments with image in PROD: ${withImageCount}`)
  
  if (withImageCount > 0) {
      const samples = sqlite.prepare("SELECT author_name, author_channel_id, author_profile_image_url FROM comments WHERE author_profile_image_url IS NOT NULL AND author_profile_image_url != '' LIMIT 5").all()
      console.log('Samples with image:', samples)
      
      const uniqueAuthorsWithImage = sqlite.prepare("SELECT COUNT(DISTINCT author_channel_id) as count FROM comments WHERE author_profile_image_url IS NOT NULL AND author_profile_image_url != ''").get().count
      console.log(`Unique authors with at least one image in PROD comments: ${uniqueAuthorsWithImage}`)
  }
  
  sqlite.close()
}

check().catch(console.error)
