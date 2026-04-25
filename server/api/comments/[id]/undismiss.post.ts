import { eq } from 'drizzle-orm'
import { useDb } from '../../../utils/db'
import { comments } from '../../../db/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing ID' })

  const db = useDb()
  
  try {
    await db.update(comments)
      .set({ status: 'pending', processedAt: new Date().toISOString() })
      .where(eq(comments.id, id))
      
    return { success: true }
  } catch (err: any) {
    throw createError({
      statusCode: 500,
      statusMessage: err.message || 'Undismiss failed'
    })
  }
})
