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
  let currentPrompt = prompt

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const currentLocalizedPrompt = `User Language: ${userLang}\nIMPORTANT: Respond in ${userLang === 'es' ? 'Spanish' : userLang === 'pt' ? 'Portuguese' : 'the user language'}.\n\n${currentPrompt}`
      
      let result: { text: string; promptTokens: number; completionTokens: number }
      if (provider === 'openai') {
        result = await openaiGenerate(currentLocalizedPrompt, 1)
      } else {
        result = await geminiGenerate(currentLocalizedPrompt, 1)
      }

      // Clean and extract
      const cleaned = extractJSON(result.text)
      
      // Validate JSON if the prompt expects it (rough check)
      if (currentPrompt.toLowerCase().includes('json')) {
        try {
          JSON.parse(cleaned)
        } catch (e) {
          // Try to repair if it looks like truncation
          const repaired = repairJSON(cleaned)
          try {
            JSON.parse(repaired)
            result.text = repaired
            return result
          } catch (e2) {
            throw new Error(`Invalid JSON: ${e instanceof Error ? e.message : 'Parse error'}`)
          }
        }
      }

      result.text = cleaned
      return result
    } catch (err) {
      lastError = err
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.warn(`[ai] Attempt ${attempt + 1} failed:`, errorMessage)
      
      // On retry, add a reminder to be strictly valid JSON and maybe fix specific issues
      if (attempt < retries) {
        currentPrompt += "\n\nCRITICAL: Your previous response was invalid. Please ensure your output is strictly valid JSON. Do not truncate strings and escape all double quotes within strings. Ensure the JSON object is fully closed."
      }
    }
  }

  throw lastError || new Error("Failed to generate AI response after retries")
}

/**
 * Extracts and cleans a JSON string from potentially messy model output.
 */
function extractJSON(text: string): string {
  if (!text) return ''

  // 1. Markdown code block: ```json ... ```
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  let extracted = codeBlock ? codeBlock[1].trim() : text.trim()

  if (!codeBlock) {
    // 2. Find first { or [ and last } or ]
    const firstBrace = extracted.indexOf('{')
    const firstBracket = extracted.indexOf('[')
    let start = -1
    let end = -1

    if (firstBrace !== -1 && (firstBracket === -1 || (firstBrace < firstBracket && firstBrace !== -1))) {
      start = firstBrace
      end = extracted.lastIndexOf('}')
    } else if (firstBracket !== -1) {
      start = firstBracket
      end = extracted.lastIndexOf(']')
    }

    if (start !== -1 && (end > start || end === -1)) {
      extracted = extracted.substring(start, end !== -1 ? end + 1 : undefined)
    }
  }

  // 3. Common fixes for AI-generated "JSON"
  // Remove trailing commas before closing braces/brackets
  extracted = extracted
    .replace(/,\s*([\]}])/g, '$1')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
  
  return extracted.trim()
}

/**
 * Basic JSON repair for truncated responses.
 */
function repairJSON(json: string): string {
  let repaired = json.trim()

  // Remove trailing garbage that looks like a broken escape sequence
  repaired = repaired.replace(/\\u[0-9a-fA-F]{0,3}$/, '')
  repaired = repaired.replace(/\\$/, '')

  // Close unterminated string
  const quoteCount = (repaired.match(/"/g) || []).length
  if (quoteCount % 2 !== 0) {
    repaired += '"'
  }

  // Close brackets/braces
  const openBraces = (repaired.match(/{/g) || []).length
  const closeBraces = (repaired.match(/}/g) || []).length
  const openBrackets = (repaired.match(/\[/g) || []).length
  const closeBrackets = (repaired.match(/\]/g) || []).length

  for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += ']'
  for (let i = 0; i < openBraces - closeBraces; i++) repaired += '}'

  return repaired
}


