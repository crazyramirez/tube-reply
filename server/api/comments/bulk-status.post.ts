import { eq, inArray, and, ne } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { comments } from '../../db/schema'

export default defineEventHandler(async (event) => {
  const db = useDb()
  const body = await readBody(event)
  const { ids, status } = body

  if (!Array.isArray(ids) || !ids.length) {
    throw createError({ statusCode: 400, statusMessage: 'ids array required' })
  }

  const validStatuses = ['pending', 'suggested', 'dismissed', 'skipped', 'published']
  if (!validStatuses.includes(status)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid status for bulk update' })
  }

  // Bulk update status
  await db.update(comments)
    .set({ 
      status, 
      processedAt: (status !== 'pending' && status !== 'skipped') ? new Date().toISOString() : null 
    })
    .where(inArray(comments.id, ids))

  return { ok: true, modifiedCount: ids.length }
})
