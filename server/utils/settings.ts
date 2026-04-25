import { eq } from 'drizzle-orm'
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
  try {
    const db = useDb()
    await db.insert(appSettings)
      .values({ key, value, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedAt: new Date().toISOString() },
      })
  } catch (err) {
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
