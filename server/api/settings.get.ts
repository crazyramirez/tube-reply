import { getAiProvider } from '../utils/settings'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const provider = await getAiProvider()
  
  return {
    aiProvider: provider,
    geminiModel: config.geminiModel,
    openaiModel: config.openaiModel,
    syncIntervalMinutes: config.syncIntervalMinutes,
    maxQuotaPerDay: config.maxQuotaPerDay,
    lockoutDurationMinutes: config.lockoutDurationMinutes,
  }
})
