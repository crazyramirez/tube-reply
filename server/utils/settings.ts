import { eq, sql } from 'drizzle-orm'
import { useDb } from './db'
import { appSettings } from '../db/schema'

export async function getSetting(key: string, defaultValue: string): Promise<string> {
  try {
    const db = useDb()
    const result = await db.query.appSettings.findFirst({
      where: eq(appSettings.key, key),
    })
    return result?.value ?? defaultValue
  } catch (err) {
    console.warn(`[settings] Could not read setting "${key}", table might be missing. Using default.`)
    return defaultValue
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = useDb()
  try {
    await db.insert(appSettings)
      .values({ key, value, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedAt: new Date().toISOString() },
      })
  } catch (err: any) {
    // Self-healing: if the table is missing, try to create it once
    if (err.message?.includes('no such table') || err.message?.includes('does not exist')) {
      console.log(`[settings] Table "app_settings" missing. Attempting auto-creation...`)
      try {
        // Raw SQL for SQLite to create the table
        // key is primary key, value is not null, updated_at is default now
        db.run(sql`CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT DEFAULT (datetime('now'))
        )`)
        
        // Retry the original operation
        await db.insert(appSettings)
          .values({ key, value, updatedAt: new Date().toISOString() })
          .onConflictDoUpdate({
            target: appSettings.key,
            set: { value, updatedAt: new Date().toISOString() },
          })
        return
      } catch (createErr) {
        console.error('[settings] Auto-creation failed:', createErr)
      }
    }

    console.error(`[settings] Failed to save setting "${key}":`, err)
    throw createError({
      statusCode: 500,
      message: 'Failed to update setting in database. Please ensure migrations have run.',
    })
  }
}

export async function getAiProvider(): Promise<'gemini' | 'openai'> {
  const config = useRuntimeConfig()
  const defaultProvider = (config.aiProvider as string) || 'gemini'
  const provider = await getSetting('ai_provider', defaultProvider)
  return provider as 'gemini' | 'openai'
}
