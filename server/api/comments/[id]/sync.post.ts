import { defineEventHandler } from 'h3'
import { getRouterParam, createError } from 'h3'
import { syncSingleThread } from '../../../services/comment-sync'
import { logger } from '../../../utils/logger'
import { useDb } from '../../../utils/db'
import { comments } from '../../../db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  await logger.info('api', `Manual sync requested for comment ${id}`)
  
  try {
    await syncSingleThread(id)
    
    // Update fetchedAt to reset the cooldown
    await db.update(comments)
      .set({ fetchedAt: new Date().toISOString() })
      .where(eq(comments.id, id))
      
    return { success: true, message: 'Sync completed' }
  } catch (err) {
    logger.error('api', `Manual sync failed for ${id}`, err)
    throw createError({ statusCode: 500, statusMessage: 'Sync failed' })
  }
})
