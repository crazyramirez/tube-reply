import { getAiProvider, getSetting } from '../../utils/settings'

export default defineEventHandler(async () => {
  const provider = await getAiProvider()
  const model = await getSetting('ai_model', '') || (provider === 'openai' ? 'gpt-4o-mini' : 'gemini-3-flash-preview')
  const config = useRuntimeConfig()
  
  // Check if keys are configured
  const hasGemini = !!(process.env.GEMINI_API_KEY || config.geminiApiKey)
  const hasOpenAI = !!(process.env.OPENAI_API_KEY || config.openaiApiKey)
  const configured = provider === 'openai' ? hasOpenAI : hasGemini

  return { 
    configured, 
    provider,
    model: model
  }
})
