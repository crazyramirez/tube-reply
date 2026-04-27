
import Database from 'better-sqlite3'
import { resolve } from 'node:path'

async function merge() {
  const localPath = resolve(process.cwd(), './data/youtube.db')
  const prodPath = resolve(process.cwd(), './data/db_prod.db')
  
  console.log(`Merging author images from ${localPath} and ${prodPath}...`)
  
  const db = new Database(localPath)
  
  try {
    // Attach the production database
    db.prepare(`ATTACH DATABASE '${prodPath}' AS prod`).run()
    
    // 1. Update prod.authors from local.authors (Main table)
    console.log('Copying images from Local to Production authors table...')
    const result1 = db.prepare(`
      UPDATE prod.authors
      SET profile_image_url = (
        SELECT profile_image_url FROM authors 
        WHERE authors.channel_id = prod.authors.channel_id
      )
      WHERE (profile_image_url IS NULL OR profile_image_url = '')
        AND channel_id IN (SELECT channel_id FROM authors WHERE profile_image_url IS NOT NULL AND profile_image_url != '')
    `).run()
    console.log(`Updated ${result1.changes} missing images in Production.`)

    // 2. Reverse: Update local.authors from prod.authors (just in case)
    console.log('Copying images from Production to Local authors table...')
    const result2 = db.prepare(`
      UPDATE authors
      SET profile_image_url = (
        SELECT profile_image_url FROM prod.authors 
        WHERE prod.authors.channel_id = authors.channel_id
      )
      WHERE (profile_image_url IS NULL OR profile_image_url = '')
        AND channel_id IN (SELECT channel_id FROM prod.authors WHERE profile_image_url IS NOT NULL AND profile_image_url != '')
    `).run()
    console.log(`Updated ${result2.changes} missing images in Local.`)

    // 3. One final backfill inside prod just to be sure we didn't miss anything from comments
    console.log('Final backfill inside Production...')
    const result3 = db.prepare(`
      UPDATE prod.authors
      SET profile_image_url = (
        SELECT MAX(author_profile_image_url)
        FROM prod.comments
        WHERE prod.comments.author_channel_id = prod.authors.channel_id
          AND author_profile_image_url IS NOT NULL
          AND author_profile_image_url != ''
      )
      WHERE (profile_image_url IS NULL OR profile_image_url = '')
    `).run()
    console.log(`Healed ${result3.changes} authors from production comments.`)

    db.prepare('DETACH DATABASE prod').run()
    console.log('Merge completed successfully.')
  } catch (error: any) {
    console.error('Merge failed:', error.message)
  } finally {
    db.close()
  }
}

merge().catch(console.error)
