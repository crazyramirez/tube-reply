import { getAiProvider } from './settings'
import * as gemini from './gemini'
import * as openai from './openai'

export async function translateText(text: string, targetLang: string = 'Spanish'): Promise<string> {
  if (!text || !text.trim()) return ''
  
  try {
    const provider = await getAiProvider()
    const prompt = `Translate the following YouTube comment to ${targetLang}. 
Maintain the tone, style, and any technical terms. 
Return ONLY the translation, no preamble, no explanations.

COMMENT TO TRANSLATE:
"${text}"`

    const aiRes = provider === 'openai'
      ? await openai.openaiGenerate(prompt)
      : await gemini.generateWithRetry(prompt)
    
    return aiRes.text.trim().replace(/^"|"$/g, '')
  } catch (err) {
    console.error('[translate-util] Translation failed:', err)
    return ''
  }
}
