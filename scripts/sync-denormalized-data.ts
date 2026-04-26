import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { eq, isNull, desc, and } from 'drizzle-orm'
import * as schema from '../server/db/schema'
import { resolve } from 'node:path'

async function migrate() {
  const dbPath = resolve(process.cwd(), './data/youtube.db')
  console.log(`[migration] Connecting to ${dbPath}...`)
  
  const sqlite = new Database(dbPath)
  const db = drizzle(sqlite, { schema })

  // 1. Get all top-level comments
  const threads = await db.query.comments.findMany({
    where: isNull(schema.comments.parentId)
  })

  console.log(`[migration] Found ${threads.length} threads to update...`)

  for (const thread of threads) {
    // Find the latest reply for this thread
    const latestReply = await db.query.comments.findFirst({
      where: eq(schema.comments.parentId, thread.id),
      orderBy: [desc(schema.comments.publishedAt)]
    })

    const lastAt = latestReply?.publishedAt || thread.publishedAt
    const lastText = latestReply?.text || thread.text
    const lastAuthor = latestReply?.authorName || thread.authorName

    await db.update(schema.comments)
      .set({
        lastActivityAt: lastAt,
        lastActivityText: lastText,
        lastActivityAuthor: lastAuthor
      })
      .where(eq(schema.comments.id, thread.id))
  }

  console.log('[migration] Successfully updated all threads!')
  sqlite.close()
}

migrate().catch(err => {
  console.error('[migration] Failed:', err)
  process.exit(1)
})
