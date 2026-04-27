export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  const configured = !!(process.env.GEMINI_API_KEY || config.geminiApiKey)
  return { configured, model: config.geminiModel ?? 'gemini-3-flash-preview' }
})
