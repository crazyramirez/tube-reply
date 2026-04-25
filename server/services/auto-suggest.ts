import { and, eq, isNull } from 'drizzle-orm'
import { comments, suggestedReplies } from '../db/schema'
import { useDb } from '../utils/db'
import { logger } from '../utils/logger'
import { generateSuggestion } from './suggestion-engine'

// In-memory guard — mirrors isRunning in comment-sync.ts (single Nitro process)
let isAutoSuggesting = false

export function getAutoSuggestStatus() {
  return { isRunning: isAutoSuggesting }
}

export async function autoSuggestPendingComments(): Promise<void> {
  if (isAutoSuggesting) {
    await logger.info('auto-suggest', 'Auto-suggest already running, skipping')
    return
  }

  isAutoSuggesting = true
  try {
    const db = useDb()

    // Find top-level pending comments with no suggestion row yet
    const rows = await db
      .select({ id: comments.id })
      .from(comments)
      .leftJoin(suggestedReplies, eq(comments.id, suggestedReplies.commentId))
      .where(
        and(
          eq(comments.status, 'pending'),
          isNull(comments.parentId),
          isNull(suggestedReplies.id),
        ),
      )

    if (!rows.length) {
      await logger.info('auto-suggest', 'No pending comments without suggestions')
      return
    }

    // Process in smaller batches to avoid long-running background tasks
    const BATCH_SIZE = 50
    const toProcess = rows.slice(0, BATCH_SIZE)
    await logger.info('auto-suggest', `Processing ${toProcess.length} of ${rows.length} pending comments`)

    let succeeded = 0
    let failed = 0

    for (const row of toProcess) {
      try {
        await generateSuggestion(row.id)
        succeeded++
        // Respect AI provider rate limits between calls
        await new Promise<void>((r) => setTimeout(r, 500))
      } catch (err) {
        failed++
        await logger.error('auto-suggest', `Failed for comment ${row.id}`, err as Error)
      }
    }

    await logger.info('auto-suggest', 'Done', { succeeded, failed, total: rows.length })
  } finally {
    isAutoSuggesting = false
  }
}
