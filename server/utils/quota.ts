import { sql } from 'drizzle-orm'
import { useDb } from './db'

// YouTube API quota costs
export const QUOTA_COSTS = {
  'commentThreads.list': 1,
  'comments.insert': 50,
  'channels.list': 1,
  'playlistItems.list': 1,
  'videos.list': 1,
} as const

export async function getDailyQuotaUsed(): Promise<number> {
  const db = useDb()

  // Sum quota from all sync runs today
  const syncResult = await db.run(
    sql`SELECT COALESCE(SUM(quota_used), 0) as total FROM sync_log WHERE date(started_at) = date('now')`
  )
  const syncQuota = Number((syncResult.rows?.[0] as { total: number } | undefined)?.total ?? 0)

  // Count publishes today × 50 units each
  const publishResult = await db.run(
    sql`SELECT COUNT(*) as total FROM published_replies WHERE date(published_at) = date('now')`
  )
  const publishQuota = Number((publishResult.rows?.[0] as { total: number } | undefined)?.total ?? 0) * QUOTA_COSTS['comments.insert']

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
