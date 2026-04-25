import { setSetting } from '../utils/settings'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  
  if (body.aiProvider) {
    const config = useRuntimeConfig()
    if (!['gemini', 'openai'].includes(body.aiProvider)) {
      throw createError({
        statusCode: 400,
        message: 'Invalid AI provider',
      })
    }
    
    if (body.aiProvider === 'gemini' && !(process.env.GEMINI_API_KEY || config.geminiApiKey)) {
      throw createError({
        statusCode: 400,
        message: 'GEMINI_API_KEY is not configured in .env',
      })
    }
    
    if (body.aiProvider === 'openai' && !(process.env.OPENAI_API_KEY || config.openaiApiKey)) {
      throw createError({
        statusCode: 400,
        message: 'OPENAI_API_KEY is not configured in .env',
      })
    }

    await setSetting('ai_provider', body.aiProvider)
  }

  if (typeof body.autoSuggestEnabled === 'boolean') {
    await setSetting('auto_suggest_enabled', body.autoSuggestEnabled ? 'true' : 'false')
  }

  return { success: true }
})
