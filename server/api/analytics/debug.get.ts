
import { useDb } from '../../utils/db'
import { comments } from '../../db/schema'
import { count, isNull, gte, and } from 'drizzle-orm'

export default defineEventHandler(async () => {
  const db = useDb()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  
  const stats = await db.select({
    total: count(),
    topLevel: count(comments.parentId), // This is wrong, should be count() with where
  }).from(comments)
  
  const topLevelCount = await db.select({ total: count() }).from(comments).where(isNull(comments.parentId))
  
  const recentIntents = await db.select({ 
    intent: comments.detectedIntent,
    count: count()
  })
  .from(comments)
  .where(and(isNull(comments.parentId), gte(comments.publishedAt, thirtyDaysAgo)))
  .groupBy(comments.detectedIntent)
  
  return {
    thirtyDaysAgo,
    total: stats[0].total,
    topLevel: topLevelCount[0].total,
    recentIntents
  }
})
