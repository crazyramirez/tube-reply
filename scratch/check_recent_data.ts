
import Database from 'better-sqlite3'
import { resolve } from 'node:path'

const dbPath = resolve(process.cwd(), './data/youtube.db')
const sqlite = new Database(dbPath)

try {
  const thirtyDaysAgo = '2026-03-28T09:34:29.085Z'
  
  console.log('Intents for recent comments:')
  const intents = sqlite.prepare("SELECT detected_intent, count(*) as count FROM comments WHERE parent_id IS NULL AND published_at >= ? GROUP BY detected_intent").all(thirtyDaysAgo)
  console.table(intents)
  
  console.log('Languages for recent comments:')
  const langs = sqlite.prepare("SELECT detected_lang, count(*) as count FROM comments WHERE parent_id IS NULL AND published_at >= ? GROUP BY detected_lang").all(thirtyDaysAgo)
  console.table(langs)

} catch (err) {
  console.error('Error reading stats:', err)
}
