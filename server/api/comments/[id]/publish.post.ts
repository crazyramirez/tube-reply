import { publishReply } from '../../../services/reply-publisher'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing ID' })

  const body = await readBody(event)
  const { suggestionId } = body

  if (!suggestionId) {
    throw createError({ statusCode: 400, statusMessage: 'suggestionId is required' })
  }

  try {
    return await publishReply(id, suggestionId)
  } catch (err: any) {
    throw createError({
      statusCode: 500,
      statusMessage: err.message || 'Publishing failed'
    })
  }
})
