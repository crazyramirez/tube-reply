
import Database from 'better-sqlite3'
import { resolve } from 'node:path'

async function check() {
  const dbPath = resolve(process.cwd(), './data/youtube.db')
  const sqlite = new Database(dbPath)
  
  const authorsCount = sqlite.prepare('SELECT COUNT(*) as count FROM authors').get()
  const samples = sqlite.prepare('SELECT * FROM authors LIMIT 5').all()
  
  console.log('Total authors:', authorsCount)
  console.log('Sample authors:', samples)
  
  sqlite.close()
}

check().catch(console.error)
