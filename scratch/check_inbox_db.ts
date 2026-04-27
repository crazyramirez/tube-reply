
import Database from 'better-sqlite3'
import { resolve } from 'node:path'

const dbPath = resolve(process.cwd(), './data/youtube.db')
const db = new Database(dbPath)

const inboxStatuses = ['pending', 'suggested']

const query = `
  SELECT id, author_name, text, status 
  FROM comments 
  WHERE parent_id IS NULL 
    AND status IN (${inboxStatuses.map(s => `'${s}'`).join(',')})
`

const rows = db.prepare(query).all()
console.log('Inbox Rows in DB:', JSON.stringify(rows, null, 2))
