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

  for (const id of ids) {
    try {
      await generateSuggestion(id)
      results.success++
    } catch (err) {
      results.failed++
      results.errors.push({ id, error: (err as Error).message })
      await logger.error('bulk-suggest', `Failed for ${id}`, err as Error)
    }
  }

  return results
})
