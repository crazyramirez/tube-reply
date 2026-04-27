
import Database from 'better-sqlite3'
import { resolve } from 'node:path'

async function migrate() {
  const dbPath = resolve(process.cwd(), './data/youtube.db')
  console.log(`Manually migrating SQLite at: ${dbPath}`)
  
  const sqlite = new Database(dbPath)
  
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS authors (
      channel_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      profile_image_url TEXT,
      last_seen_at TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    
    CREATE INDEX IF NOT EXISTS authors_name_idx ON authors (name);
  `)

  console.log('Authors table created successfully.')
  sqlite.close()
}

migrate().catch(console.error)
