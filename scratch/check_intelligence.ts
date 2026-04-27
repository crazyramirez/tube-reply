
import Database from 'better-sqlite3'
import { resolve } from 'node:path'

const dbPath = resolve(process.cwd(), './data/youtube.db')
const sqlite = new Database(dbPath)

try {
  const stats = sqlite.prepare(`
    SELECT 
      count(*) as total,
      sum(case when detected_intent IS NOT NULL then 1 else 0 end) as with_intent,
      sum(case when detected_lang IS NOT NULL then 1 else 0 end) as with_lang
    FROM comments
  `).get()
  console.log('Comment Intelligence Stats:')
  console.table(stats)
} catch (err) {
  console.error('Error reading stats:', err)
}
