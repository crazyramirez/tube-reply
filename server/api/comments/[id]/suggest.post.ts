import { generateSuggestion } from '../../../services/suggestion-engine'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  const commentId = getRouterParam(event, 'id')!
  const body = await readBody(event).catch(() => ({}))
  const langOverride: string | null = body?.langOverride ?? null
  const additionalContext: string | null = body?.additionalContext ?? null

  try {
    const result = await generateSuggestion(commentId, langOverride, additionalContext)
    return result
  }
  catch (err) {
    await logger.error('api-suggest', 'Suggestion generation failed', err as Error, { commentId })
    throw createError({
      statusCode: 500,
      statusMessage: (err as Error).message ?? 'Failed to generate suggestion',
    })
  }
})
