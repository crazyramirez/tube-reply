import { publishReply } from '../../../services/reply-publisher'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  const commentId = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const { suggestionId } = body ?? {}

  if (!suggestionId || typeof suggestionId !== 'number') {
    throw createError({ statusCode: 400, statusMessage: 'suggestionId (number) required' })
  }

  try {
    const result = await publishReply(commentId, suggestionId)
    return result
  }
  catch (err) {
    await logger.error('api-publish', 'Publish failed', err as Error, { commentId, suggestionId })
    throw createError({
      statusCode: 500,
      statusMessage: (err as Error).message ?? 'Failed to publish reply',
    })
  }
})
