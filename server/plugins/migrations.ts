import { runMigrations } from '../utils/migrations'
import { getSetting, setSetting } from '../utils/settings'

export default defineNitroPlugin(async () => {
  try {
    await runMigrations()
  } catch (error: any) {
    console.error('✗ Migration plugin failed:', error.message)
  }

  // Initialize default settings in DB if missing (first run)
  try {
    const existing = await getSetting('language', '')
    if (!existing) {
      const config = useRuntimeConfig()
      const defaultLang = (config.defaultLanguage as string) || 'es'
      await setSetting('language', defaultLang)
      console.log(`[settings] Initialized language: ${defaultLang}`)
    }

    const autoSuggest = await getSetting('auto_suggest_enabled', '')
    if (!autoSuggest) {
      await setSetting('auto_suggest_enabled', 'false')
      console.log('[settings] Initialized auto_suggest_enabled: false')
    }
  } catch (e: any) {
    console.warn('[settings] Could not initialize default settings:', e.message)
  }
})
