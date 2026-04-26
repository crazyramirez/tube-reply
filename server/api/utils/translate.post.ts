import { getAiProvider } from '../../utils/settings'
import * as gemini from '../../utils/gemini'
import * as openai from '../../utils/openai'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { text, targetLang = 'Spanish' } = body

  if (!text || typeof text !== 'string' || !text.trim()) {
    return { translation: '' }
  }

  try {
    const provider = await getAiProvider()
    const prompt = `Translate the following YouTube comment reply to ${targetLang}. 
Maintain the tone and any technical terms. 
Return ONLY the translation, no preamble.

REPLY TO TRANSLATE:
"${text}"`

    const aiRes = provider === 'openai'
      ? await openai.openaiGenerate(prompt)
      : await gemini.generateWithRetry(prompt)
    
    const translation = aiRes.text.trim().replace(/^"|"$/g, '')
    return { translation }
  } catch (err) {
    console.error('[translate-api] Translation failed:', err)
    throw createError({
      statusCode: 500,
      statusMessage: 'Translation failed'
    })
  }
})
