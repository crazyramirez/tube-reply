
import Database from 'better-sqlite3'
import { resolve } from 'node:path'

async function inspect() {
  const files = ['./data/youtube.db', './data/db_prod.db']
  
  for (const file of files) {
    const path = resolve(process.cwd(), file)
    console.log(`\n--- Inspecting: ${file} ---`)
    try {
      const db = new Database(path)
      const commentsCount = db.prepare('SELECT COUNT(*) as count FROM comments').get().count
      const authorsCount = db.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='authors'").get().count > 0 
        ? db.prepare('SELECT COUNT(*) as count FROM authors').get().count 
        : 'N/A'
      
      console.log(`Comments: ${commentsCount}`)
      console.log(`Authors: ${authorsCount}`)
      db.close()
    } catch (e: any) {
      console.log(`Error: ${e.message}`)
    }
  }
}

inspect().catch(console.error)
