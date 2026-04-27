import {
  GoogleGenAI,
  HarmCategory,
  HarmBlockThreshold,
  FunctionCallingConfigMode,
  type Tool,
  type Part,
} from '@google/genai'
import { type VideoSearchFn } from './ai-types'

let _client: GoogleGenAI | null = null

export function getGeminiClient() {
  if (_client) return _client
  const config = useRuntimeConfig()
  if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY not configured')
  _client = new GoogleGenAI({ apiKey: config.geminiApiKey })
  return _client
}

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
]

export function getModel(modelName?: string) {
  const config = useRuntimeConfig()
  const model = modelName ?? (config.geminiModel as string) ?? 'gemini-3-flash-preview'
  const client = getGeminiClient()
  // Note: getModel is a helper to return a configured request object or similar
  // In the new SDK, we call client.models.generateContent directly.
  return {
    generateContent: (prompt: string | Part[]) => client.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.4,
        maxOutputTokens: 2048,
        topP: 0.8,
        safetySettings: SAFETY_SETTINGS,
      }
    })
  }
}

// Tool-capable model helper
function getToolModel(modelName?: string) {
  const config = useRuntimeConfig()
  const model = modelName ?? (config.geminiModel as string) ?? 'gemini-3-flash-preview'
  const client = getGeminiClient()
  return {
    model,
    client,
    config: {
      temperature: 0.4,
      maxOutputTokens: 4096,
      topP: 0.8,
      safetySettings: SAFETY_SETTINGS,
    }
  }
}

export const searchVideosTool: Tool = {
  functionDeclarations: [
    {
      name: 'search_videos',
      description: [
        'Search for videos in the channel database using semantic keywords.',
        'WHEN TO CALL: Call this tool whenever the commenter is asking about a specific video, topic, tutorial, product, technique, date, or event — in ANY language.',
        'WHEN NOT TO CALL: Do NOT call for generic greetings, pure compliments, spam, or questions answerable from the recent-videos list provided.',
        'QUERY STRATEGY: Extract 2–4 core topic nouns/adjectives from the comment. Remove filler/stop words in any language.',
        'ES examples: "¿dónde puedo ver el tutorial de blusa de septiembre?" → query "blusa septiembre"; "¿tienes receta de arroz negro?" → query "arroz negro".',
        'EN examples: "do you have a crochet bag tutorial?" → query "crochet bag"; "where is the summer makeup video?" → query "summer makeup".',
        'FR examples: "où est la vidéo sur le crochet?" → query "crochet"; "tu as un tutoriel maquillage été?" → query "maquillage été".',
        'PT/BR examples: "onde está o vídeo de crochê bolsa?" → query "crochê bolsa"; "tem tutorial de maquiagem?" → query "maquiagem".',
        'RU examples: "где видео про вязание крючком?" → query "вязание крючком"; "есть урок по макияжу?" → query "макияж".',
        'AR examples: "أين فيديو الكروشيه؟" → query "كروشيه"; "هل عندك درس مكياج؟" → query "مكياج".',
        'If the first search returns 0 results, retry with a shorter or synonym query (e.g. drop one keyword, try a synonym).',
      ].join(' '),
      parametersJsonSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Focused topic keywords (2–4 words max, any language). No filler/stop words — only subject matter nouns/adjectives. The search engine handles accents, diacritics, emojis and spelling variants automatically.',
          },
        },
        required: ['query'],
      },
    },
  ],
}

function extractJSON(text: string): string {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) return codeBlock[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) return text.substring(start, end + 1)
  return text.trim()
}

export async function geminiGenerateWithTools(
  prompt: string,
  searchFn: VideoSearchFn,
  retries = 2,
): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { client, model, config } = getToolModel()
      let promptTokens = 0
      let completionTokens = 0

      // In the new SDK, we use generateContent and manage the loop
      let response = await client.models.generateContent({
        model,
        contents: prompt,
        config: {
          ...config,
          tools: [searchVideosTool],
          toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
        }
      })

      promptTokens += response.usageMetadata?.promptTokenCount ?? 0
      completionTokens += response.usageMetadata?.candidatesTokenCount ?? 0

      // Tool-calling loop
      const MAX_TOOL_ROUNDS = 3
      const queryCache = new Map<string, Array<{ id: string; title: string }>>()
      const history: any[] = [{ role: 'user', parts: [{ text: prompt }] }]

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const functionCalls = response.functionCalls
        if (!functionCalls?.length) break

        // Add the model's function calls to history
        history.push({ role: 'model', parts: functionCalls.map(fc => ({ functionCall: fc })) })

        const toolParts: Part[] = await Promise.all(
          functionCalls.map(async (call) => {
            const { query } = call.args as { query: string }
            const cacheKey = query.toLowerCase().trim()
            let results = queryCache.get(cacheKey)
            if (!results) {
              console.log(`[gemini] search_videos round ${round + 1}, query: "${query}"`)
              results = await searchFn(query)
              console.log(`[gemini] search_videos returned ${results.length} results`)
              queryCache.set(cacheKey, results)
            }
            else {
              console.log(`[gemini] search_videos round ${round + 1} — cached, skipping DB call`)
            }
            return {
              functionResponse: {
                name: call.name,
                response: {
                  found: results.length,
                  videos: results.map(v => ({
                    id: v.id,
                    title: v.title,
                    url: `https://youtu.be/${v.id}`,
                    thumbnail_url: v.thumbnailUrl,
                  })),
                },
              },
            } as Part
          }),
        )

        // Add tool responses to history
        history.push({ role: 'user', parts: toolParts })

        response = await client.models.generateContent({
          model,
          contents: history,
          config: {
            ...config,
            tools: [searchVideosTool],
            toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
          }
        })

        promptTokens += response.usageMetadata?.promptTokenCount ?? 0
        completionTokens += response.usageMetadata?.candidatesTokenCount ?? 0
      }

      const finalText = extractJSON(response.text || '')
      console.log(`[gemini] final response text length: ${finalText.length}`)
      return { text: finalText, promptTokens, completionTokens }
    }
    catch (err) {
      lastError = err as Error
      console.error(`[gemini] Error in geminiGenerateWithTools (attempt ${attempt}):`, err)
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
  }

  throw lastError!
}

export async function generateWithRetry(prompt: string, retries = 2): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const modelHelper = getModel()
      const result = await modelHelper.generateContent(prompt)
      const response = result

      return {
        text: response.text || '',
        promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      }
    }
    catch (err) {
      lastError = err as Error
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
  }

  throw lastError!
}
