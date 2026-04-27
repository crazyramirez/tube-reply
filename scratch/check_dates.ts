
import Database from 'better-sqlite3'
import { resolve } from 'node:path'

const dbPath = resolve(process.cwd(), './data/youtube.db')
const sqlite = new Database(dbPath)

try {
  const dates = sqlite.prepare("SELECT min(published_at) as min_date, max(published_at) as max_date FROM comments WHERE parent_id IS NULL").get()
  console.log('Date range for top level comments:', dates)
  
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  console.log('Thirty days ago threshold:', thirtyDaysAgo)
  
  const recentCount = sqlite.prepare("SELECT count(*) as count FROM comments WHERE parent_id IS NULL AND published_at >= ?").get(thirtyDaysAgo)
  console.log('Comments in last 30 days:', recentCount)

} catch (err) {
  console.error('Error reading stats:', err)
}
