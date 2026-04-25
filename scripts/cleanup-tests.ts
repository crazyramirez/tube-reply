/**
 * CLEANUP TEST DATA SCRIPT
 * 
 * This script removes all test comments and suggested replies created 
 * by the AI test script (test-ai.ts). It looks for comments with
 * the author "Tester" or IDs starting with "test_".
 * 
 * USAGE:
 *   npx tsx scripts/cleanup-tests.ts
 */

import dotenv from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// 1. Setup environment
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env') })

// 2. Mock useRuntimeConfig
global.useRuntimeConfig = () => ({
  dbUrl: process.env.DATABASE_URL ?? './data/youtube.db',
})

// 3. Import project services
import { useDb } from '../server/utils/db'
import { comments, suggestedReplies, publishedReplies } from '../server/db/schema'
import { like, or, eq, inArray } from 'drizzle-orm'

async function main() {
  console.log('--- CLEANUP TEST DATA ---')
  const db = useDb()

  // Find all test comments
  const testComments = await db.query.comments.findMany({
    where: or(
      like(comments.id, 'test_%'),
      eq(comments.authorName, 'Tester')
    ),
    columns: { id: true }
  })

  if (testComments.length === 0) {
    console.log('No test data found to clean up.')
    return
  }

  const testIds = testComments.map(c => c.id)
  console.log(`Found ${testIds.length} test comments. Cleaning up associated data...`)

  // Delete from published_replies
  const publishedDeleted = await db.delete(publishedReplies)
    .where(inArray(publishedReplies.commentId, testIds))
    .returning({ id: publishedReplies.id })
  
  if (publishedDeleted.length > 0) {
    console.log(`- Deleted ${publishedDeleted.length} published replies.`)
  }

  // Delete from suggested_replies
  const suggestionsDeleted = await db.delete(suggestedReplies)
    .where(inArray(suggestedReplies.commentId, testIds))
    .returning({ id: suggestedReplies.id })
  
  if (suggestionsDeleted.length > 0) {
    console.log(`- Deleted ${suggestionsDeleted.length} suggested replies.`)
  }

  // Finally delete comments
  const commentsDeleted = await db.delete(comments)
    .where(inArray(comments.id, testIds))
    .returning({ id: comments.id })

  console.log(`- Deleted ${commentsDeleted.length} test comments.`)
  console.log('\nCleanup complete!')
}

main().catch(console.error)
