import { eq, lt, or, sql } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { sessions, loginAttempts, syncLog, errorLogs } from '../db/schema'
import { logger } from '../utils/logger'

export async function runDbCleanup(): Promise<void> {
  const db = useDb()
  
  const { logRetentionDays } = useRuntimeConfig()
  const retentionDays = parseInt(logRetentionDays as string, 10) || 30
  
  const retentionDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
  const retentionIso = retentionDate.toISOString()

  console.log(`[cleanup] Starting DB maintenance (Retention: ${retentionDays} days)`)
  
  try {
    // 1. Clean up sessions (expired or invalid)
    const sessionRes = await db.delete(sessions).where(
      or(
        eq(sessions.isValid, false),
        lt(sessions.expiresAt, new Date().toISOString())
      )
    )
    
    // 2. Clean up login attempts
    const loginRes = await db.delete(loginAttempts).where(
      lt(loginAttempts.attemptedAt, retentionIso)
    )
    
    // 3. Clean up sync logs
    const syncRes = await db.delete(syncLog).where(
      lt(syncLog.startedAt, retentionIso)
    )
    
    // 4. Clean up error logs
    const errorRes = await db.delete(errorLogs).where(
      lt(errorLogs.occurredAt, retentionIso)
    )

    console.log(`[cleanup] Maintenance completed.`)
  } catch (err: any) {
    console.error(`[cleanup] Maintenance failed:`, err)
    await logger.error('cleanup', 'Database maintenance failed', err)
  }
}
