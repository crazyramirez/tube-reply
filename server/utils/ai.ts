import { getAiProvider } from './settings'
import { getCookie } from 'h3'
import { generateWithRetry as geminiGenerate } from './gemini'

import { openaiGenerate } from './openai'

/**
 * Unified generation interface that respects user settings (Gemini vs OpenAI).
 * Automatically handles retries and returns consistent token usage stats.
 */
export async function generateUnified(prompt: string, retries = 2, event?: any) {
  const provider = await getAiProvider()
  
  // Try to detect user language from cookie (i18n)
  let userLang = 'en'
  if (event) {
    userLang = getCookie(event, 'tube_reply_locale') || 'en'
  }

  const localizedPrompt = `User Language: ${userLang}\nIMPORTANT: Respond in ${userLang === 'es' ? 'Spanish' : userLang === 'pt' ? 'Portuguese' : 'the user language'}.\n\n${prompt}`

  let lastError: any = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let result: { text: string; promptTokens: number; completionTokens: number }
      if (provider === 'openai') {
        result = await openaiGenerate(localizedPrompt, 1) // use 1 retry inside openaiGenerate
      } else {
        result = await geminiGenerate(localizedPrompt, 1)
      }

      // Clean and extract
      const cleaned = extractJSON(result.text)
      
      // Validate JSON if the prompt expects it (rough check)
      if (prompt.toLowerCase().includes('json')) {
        JSON.parse(cleaned)
      }

      result.text = cleaned
      return result
    } catch (err) {
      lastError = err
      console.warn(`[ai] Attempt ${attempt + 1} failed:`, err instanceof Error ? err.message : err)
      // On second attempt, add a reminder to be strictly valid JSON
      if (attempt === 0) {
        prompt += "\n\nCRITICAL: Your previous response was invalid JSON. Please ensure your output is strictly valid JSON."
      }
    }
  }

  throw lastError || new Error("Failed to generate AI response after retries")
}

/**
 * Extracts and cleans a JSON string from potentially messy model output.
 */
function extractJSON(text: string): string {
  // 1. Markdown code block: ```json ... ```
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  let extracted = codeBlock ? codeBlock[1].trim() : text.trim()

  if (!codeBlock) {
    // 2. Find first { or [ and last } or ]
    const firstBrace = extracted.indexOf('{')
    const firstBracket = extracted.indexOf('[')
    let start = -1
    let end = -1

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      start = firstBrace
      end = extracted.lastIndexOf('}')
    } else if (firstBracket !== -1) {
      start = firstBracket
      end = extracted.lastIndexOf(']')
    }

    if (start !== -1 && end > start) {
      extracted = extracted.substring(start, end + 1)
    }
  }

  // 3. Common fixes for AI-generated "JSON"
  return extracted
    .replace(/,\s*([\]}])/g, '$1') // Remove trailing commas: [1, 2,] -> [1, 2]
    .replace(/\n/g, ' ')           // Remove newlines inside strings (simplified)
    .replace(/\r/g, '')
    .trim()
}


