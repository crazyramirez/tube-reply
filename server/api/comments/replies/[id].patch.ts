import { updateReply } from '../../../services/reply-publisher'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing ID' })

  const body = await readBody(event)
  const { text } = body

  if (!text) {
    throw createError({ statusCode: 400, statusMessage: 'Text is required' })
  }

  try {
    return await updateReply(id, text)
  } catch (err: any) {
    throw createError({
      statusCode: 500,
      statusMessage: err.message || 'Update failed'
    })
  }
})
