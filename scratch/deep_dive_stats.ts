
import Database from 'better-sqlite3'
import { resolve } from 'node:path'

const dbPath = resolve(process.cwd(), './data/youtube.db')
const sqlite = new Database(dbPath)

try {
  console.log('Top Level Comments count:', sqlite.prepare("SELECT count(*) FROM comments WHERE parent_id IS NULL").get())
  console.log('Replies count:', sqlite.prepare("SELECT count(*) FROM comments WHERE parent_id IS NOT NULL").get())
  
  console.log('Language distribution for top level comments:')
  const langs = sqlite.prepare("SELECT detected_lang, count(*) as count FROM comments WHERE parent_id IS NULL GROUP BY detected_lang").all()
  console.table(langs)
  
  console.log('Intent distribution for top level comments:')
  const intents = sqlite.prepare("SELECT detected_intent, count(*) as count FROM comments WHERE parent_id IS NULL GROUP BY detected_intent").all()
  console.table(intents)
  
  console.log('Sample top level comments:')
  const samples = sqlite.prepare("SELECT id, text, detected_lang, detected_intent FROM comments WHERE parent_id IS NULL LIMIT 5").all()
  console.table(samples)
} catch (err) {
  console.error('Error reading stats:', err)
}
