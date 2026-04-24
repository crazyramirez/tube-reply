import { eq, desc } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { suggestedReplies } from '../../db/schema'
import { publishReply } from '../../services/reply-publisher'
import { generateSuggestion } from '../../services/suggestion-engine'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { ids } = body

  if (!Array.isArray(ids) || !ids.length) {
    throw createError({ statusCode: 400, statusMessage: 'ids array required' })
  }

  const results = {
    success: 0,
    failed: 0,
    errors: [] as { id: string, error: string }[]
  }

  const db = useDb()

  for (const id of ids) {
    try {
      // Find the latest suggestion for this comment
      let suggestion = await db.query.suggestedReplies.findFirst({
        where: eq(suggestedReplies.commentId, id),
        orderBy: [desc(suggestedReplies.generatedAt)]
      })

      if (!suggestion) {
        // Auto-generate if missing
        const result = await generateSuggestion(id)
        suggestion = await db.query.suggestedReplies.findFirst({
          where: eq(suggestedReplies.id, result.suggestionId)
        })
      }

      if (!suggestion) {
        results.failed++
        results.errors.push({ id, error: 'Could not find or generate suggestion' })
        continue
      }

      await publishReply(id, suggestion.id)
      results.success++
    } catch (err) {
      results.failed++
      const message = (err as Error).message ?? 'Unknown error'
      results.errors.push({ id, error: message })
      await logger.error('bulk-publish', `Failed for ${id}`, err as Error)
    }
  }

  return results
})
