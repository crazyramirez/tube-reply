
import Database from 'better-sqlite3'
import { resolve } from 'node:path'

const dbPath = resolve(process.cwd(), './data/youtube.db')
const sqlite = new Database(dbPath)

try {
  const row = sqlite.prepare("SELECT detected_intent FROM comments WHERE detected_intent IS NOT NULL LIMIT 1").get()
  console.log('Detected Intent (RAW):', JSON.stringify(row.detected_intent))
  
  const results = sqlite.prepare(`
    SELECT 
      detected_intent, 
      count(*) as count 
    FROM comments 
    WHERE parent_id IS NULL 
    GROUP BY detected_intent
  `).all()
  console.log('Grouping Results:')
  console.table(results)

} catch (err) {
  console.error('Error:', err)
}
