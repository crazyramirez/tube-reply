import { getAiProvider, getSetting } from '../utils/settings'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const provider = await getAiProvider()
  const autoSuggestEnabled = (await getSetting('auto_suggest_enabled', 'false')) === 'true'
  const logRetentionDays = parseInt(await getSetting('log_retention_days', '30'), 10)

  return {
    aiProvider: provider,
    geminiModel: config.geminiModel,
    openaiModel: config.openaiModel,
    geminiKeyConfigured: !!(process.env.GEMINI_API_KEY || config.geminiApiKey),
    openaiKeyConfigured: !!(process.env.OPENAI_API_KEY || config.openaiApiKey),
    syncIntervalMinutes: config.syncIntervalMinutes,
    maxQuotaPerDay: config.maxQuotaPerDay,
    lockoutDurationMinutes: config.lockoutDurationMinutes,
    autoSuggestEnabled,
  }
})
