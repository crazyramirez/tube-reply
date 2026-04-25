import { getAiProvider, getSetting } from '../utils/settings'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const provider = await getAiProvider()
  const autoSuggestEnabled = (await getSetting('auto_suggest_enabled', 'false')) === 'true'

  return {
    aiProvider: provider,
    geminiModel: config.geminiModel,
    openaiModel: config.openaiModel,
    syncIntervalMinutes: config.syncIntervalMinutes,
    maxQuotaPerDay: config.maxQuotaPerDay,
    lockoutDurationMinutes: config.lockoutDurationMinutes,
    autoSuggestEnabled,
  }
})
