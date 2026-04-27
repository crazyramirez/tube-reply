
import Database from 'better-sqlite3'
import { resolve } from 'node:path'

async function fix() {
  const prodPath = resolve(process.cwd(), './data/db_prod.db')
  console.log(`Fixing PRODUCTION DB at: ${prodPath}`)
  
  const db = new Database(prodPath)
  
  // 1. Create authors table if missing (just in case)
  db.exec(`
    CREATE TABLE IF NOT EXISTS authors (
      channel_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      profile_image_url TEXT,
      last_seen_at TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS authors_name_idx ON authors (name);
  `)
  
  // 2. Populate authors table from comments
  console.log('Populating authors table...')
  const result1 = db.prepare(`
    INSERT OR IGNORE INTO authors (channel_id, name, profile_image_url, last_seen_at)
    SELECT 
      author_channel_id, 
      MAX(author_name), 
      MAX(author_profile_image_url),
      MAX(published_at)
    FROM comments
    WHERE author_channel_id IS NOT NULL AND author_channel_id != ''
    GROUP BY author_channel_id
  `).run()
  console.log(`Inserted ${result1.changes} authors.`)

  // 3. Update images in authors table if we find better ones
  console.log('Updating images in authors table...')
  const result2 = db.prepare(`
    UPDATE authors
    SET profile_image_url = (
      SELECT MAX(author_profile_image_url)
      FROM comments
      WHERE comments.author_channel_id = authors.channel_id
        AND author_profile_image_url IS NOT NULL
        AND author_profile_image_url != ''
    )
    WHERE (profile_image_url IS NULL OR profile_image_url = '')
  `).run()
  console.log(`Updated ${result2.changes} images in authors table.`)

  // 4. Propagate back to comments
  console.log('Propagating images back to comments...')
  const result3 = db.prepare(`
    UPDATE comments 
    SET author_profile_image_url = (
      SELECT profile_image_url 
      FROM authors 
      WHERE authors.channel_id = comments.author_channel_id
    )
    WHERE (author_profile_image_url IS NULL OR author_profile_image_url = '')
      AND author_channel_id IN (SELECT channel_id FROM authors WHERE profile_image_url IS NOT NULL)
  `).run()
  console.log(`Healed ${result3.changes} comment rows.`)

  console.log('--- FINAL PROD STATS ---')
  const count = db.prepare('SELECT COUNT(*) as count FROM authors').get().count
  console.log(`Total authors in production table: ${count}`)
  
  db.close()
}

fix().catch(console.error)
