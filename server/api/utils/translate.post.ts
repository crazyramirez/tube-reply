import { getUserLanguage } from '../../utils/settings'
import { logger } from '../../utils/logger'
import { translateText } from '../../utils/translate'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { text, targetLang = 'Spanish' } = body
  await logger.info('translate-api', `TargetLang: ${targetLang}`, { textLength: text?.length })

  if (!text || typeof text !== 'string' || !text.trim()) {
    return { translation: '' }
  }

  const translation = await translateText(text, targetLang)
  if (!translation) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Translation failed'
    })
  }
  
  return { translation }
})
