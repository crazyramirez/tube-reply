import { deleteReply } from '../../../services/reply-publisher'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing ID' })

  try {
    return await deleteReply(id)
  } catch (err: any) {
    throw createError({
      statusCode: 500,
      statusMessage: err.message || 'Deletion failed'
    })
  }
})
