
import { open } from 'sqlite'
import sqlite3 from 'sqlite3'
import { join } from 'path'

async function debug() {
  const db = await open({
    filename: 'd:/DEV/tube-reply/server/db/local.db',
    driver: sqlite3.Database
  })

  const commentId = 'Ugzq2pU4vxkqtizIGyl4AaABAg'
  
  console.log('--- Comment ---')
  const comment = await db.get('SELECT * FROM comments WHERE id = ?', [commentId])
  console.log(JSON.stringify(comment, null, 2))

  console.log('\n--- Suggestions ---')
  const suggestions = await db.all('SELECT * FROM suggested_replies WHERE comment_id = ?', [commentId])
  console.log(JSON.stringify(suggestions, null, 2))

  console.log('\n--- Published Replies ---')
  const published = await db.all('SELECT * FROM published_replies WHERE comment_id = ?', [commentId])
  console.log(JSON.stringify(published, null, 2))

  await db.close()
}

debug().catch(console.error)
