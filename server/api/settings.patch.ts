import { setSetting } from '../utils/settings'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  
  if (body.aiProvider) {
    if (!['gemini', 'openai'].includes(body.aiProvider)) {
      throw createError({
        statusCode: 400,
        message: 'Invalid AI provider',
      })
    }
    await setSetting('ai_provider', body.aiProvider)
  }

  return { success: true }
})
