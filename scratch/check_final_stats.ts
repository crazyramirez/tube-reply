
import Database from 'better-sqlite3'
import { resolve } from 'node:path'

async function check() {
  const prodPath = resolve(process.cwd(), './data/db_prod.db')
  const sqlite = new Database(prodPath)
  
  const total = sqlite.prepare('SELECT COUNT(*) as count FROM authors').get().count
  const withImage = sqlite.prepare('SELECT COUNT(*) as count FROM authors WHERE profile_image_url IS NOT NULL AND profile_image_url != \'\'').get().count
  
  console.log(`Total authors: ${total}`)
  console.log(`Authors with image: ${withImage}`)
  
  if (withImage > 0) {
      const sample = sqlite.prepare('SELECT name, profile_image_url FROM authors WHERE profile_image_url IS NOT NULL LIMIT 3').all()
      console.log('Sample authors with image:', sample)
  }
  
  sqlite.close()
}

check().catch(console.error)
