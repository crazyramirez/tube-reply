import { sql, count } from 'drizzle-orm'
import { useDb } from './db'
import { syncLog, publishedReplies } from '../db/schema'

// YouTube API quota costs
export const QUOTA_COSTS = {
  'commentThreads.list': 1,
  'comments.insert': 50,
  'channels.list': 1,
  'playlistItems.list': 1,
  'videos.list': 1,
  'captions.list': 50,
  'captions.download': 200,
} as const

export async function getDailyQuotaUsed(): Promise<number> {
  const db = useDb()

  // Sum quota from all sync runs today
  const syncResult = await db.select({
    total: sql<number>`COALESCE(SUM(${syncLog.quotaUsed}), 0)`
  })
    .from(syncLog)
    .where(sql`date(${syncLog.startedAt}, 'localtime') = date('now', 'localtime')`)
  
  const syncQuota = Number(syncResult[0]?.total ?? 0)

  // Count publishes today × 50 units each
  const publishResult = await db.select({
    total: count()
  })
    .from(publishedReplies)
    .where(sql`date(${publishedReplies.publishedAt}, 'localtime') = date('now', 'localtime')`)
  
  const publishQuota = Number(publishResult[0]?.total ?? 0) * QUOTA_COSTS['comments.insert']

  return syncQuota + publishQuota
}

export async function getRemainingQuota(): Promise<number> {
  const config = useRuntimeConfig()
  const used = await getDailyQuotaUsed()
  return Math.max(0, config.maxQuotaPerDay - used)
}

export async function assertQuotaAvailable(needed: number): Promise<void> {
  const remaining = await getRemainingQuota()
  if (remaining < needed) {
    throw new Error(`Daily YouTube quota exhausted (${remaining} units left, need ${needed})`)
  }
}
