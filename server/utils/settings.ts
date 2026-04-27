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
  try {
    const db = useDb()
    await db.insert(appSettings)
      .values({ key, value, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedAt: new Date().toISOString() },
      })
  } catch (err: any) {
    console.error(`[settings] Failed to save setting "${key}":`, err)
    throw createError({
      statusCode: 500,
      statusMessage: 'Database Error',
      message: 'Failed to update setting. Please check server logs.',
    })
  }
}

export async function getAutoSuggestEnabled(): Promise<boolean> {
  const val = await getSetting('auto_suggest_enabled', 'false')
  return val === 'true'
}

export async function getAiProvider(): Promise<'gemini' | 'openai'> {
  const config = useRuntimeConfig()
  const envProvider = (config.aiProvider as string) || 'gemini'
  
  const dbProvider = await getSetting('ai_provider', '')
  
  if (dbProvider && ['gemini', 'openai'].includes(dbProvider)) {
    console.log(`[settings] Using AI provider from DB: ${dbProvider}`)
    return dbProvider as 'gemini' | 'openai'
  }

  console.log(`[settings] Using AI provider from ENV (fallback): ${envProvider}`)
  return envProvider as 'gemini' | 'openai'
}

const LANGUAGE_MAP: Record<string, string> = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
  fr: "French",
  de: "German",
  it: "Italian",
  nl: "Dutch",
  pl: "Polish",
  ru: "Russian",
  ja: "Japanese",
  zh: "Chinese",
  ar: "Arabic",
  ko: "Korean",
  tr: "Turkish",
  sv: "Swedish",
  no: "Norwegian",
  da: "Danish",
  fi: "Finnish",
  ca: "Catalan",
  cs: "Czech",
};

export async function getUserLanguage(): Promise<string> {
  const code = await getSetting('language', 'es')
  return LANGUAGE_MAP[code] || "Spanish"
}
export async function getUserLanguageCode(): Promise<string> {
  return await getSetting('language', 'es')
}
