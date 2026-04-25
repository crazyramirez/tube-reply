import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  FunctionCallingMode,
  SchemaType,
  type Tool,
  type Part,
} from '@google/generative-ai'

let _client: GoogleGenerativeAI | null = null

export function getGeminiClient() {
  if (_client) return _client
  const config = useRuntimeConfig()
  if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY not configured')
  _client = new GoogleGenerativeAI(config.geminiApiKey)
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
  return client.getGenerativeModel({
    model,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.4,
      maxOutputTokens: 1024,
      topP: 0.8,
    },
    safetySettings: SAFETY_SETTINGS,
  })
}

// Tool-capable model — responseMimeType is incompatible with function calling
function getToolModel(modelName?: string) {
  const config = useRuntimeConfig()
  const model = modelName ?? (config.geminiModel as string) ?? 'gemini-3-flash-preview'
  const client = getGeminiClient()
  return client.getGenerativeModel({
    model,
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 4096, // higher budget: tool rounds + JSON response
      topP: 0.8,
    },
    safetySettings: SAFETY_SETTINGS,
  })
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
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          query: {
            type: SchemaType.STRING,
            description: 'Focused topic keywords (2–4 words max, any language). No filler/stop words — only subject matter nouns/adjectives. The search engine handles accents, diacritics, emojis and spelling variants automatically.',
          },
        },
        required: ['query'],
      },
    },
  ],
}

// Extract JSON object from model output — handles code fences, preamble text, trailing text
function extractJSON(text: string): string {
  // 1. Markdown code block: ```json ... ```
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) return codeBlock[1].trim()

  // 2. Find first { and last } — handles "Here is the JSON: { ... }"
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
      const model = getToolModel()
      let promptTokens = 0
      let completionTokens = 0

      // Use startChat for proper multi-turn function calling state management
      const chat = model.startChat({
        tools: [searchVideosTool],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
      })

      const result1 = await chat.sendMessage(prompt)
      const response1 = result1.response
      promptTokens += response1.usageMetadata?.promptTokenCount ?? 0
      completionTokens += response1.usageMetadata?.candidatesTokenCount ?? 0

      const functionCalls = response1.functionCalls()
      console.log(`[gemini] first call finishReason: ${response1.candidates?.[0]?.finishReason}, functionCalls: ${functionCalls?.length ?? 0}`)

      // No tool needed — return direct response
      if (!functionCalls?.length) {
        const directText = extractJSON(response1.text())
        console.log(`[gemini] direct response, text length: ${directText.length}`)
        return { text: directText, promptTokens, completionTokens }
      }

      // Tool-calling loop — model may call search_videos multiple times
      const MAX_TOOL_ROUNDS = 3
      const queryCache = new Map<string, Array<{ id: string; title: string }>>()
      let currentResponse = response1

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const calls = currentResponse.functionCalls()
        if (!calls?.length) break

        const toolParts: Part[] = await Promise.all(
          calls.map(async (call) => {
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

        const nextResult = await chat.sendMessage(toolParts)
        currentResponse = nextResult.response
        promptTokens += currentResponse.usageMetadata?.promptTokenCount ?? 0
        completionTokens += currentResponse.usageMetadata?.candidatesTokenCount ?? 0
      }

      const finalText = extractJSON(currentResponse.text())
      console.log(`[gemini] final finishReason: ${currentResponse.candidates?.[0]?.finishReason}, text length: ${finalText.length}`)
      return { text: finalText, promptTokens, completionTokens }
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

export async function generateWithRetry(prompt: string, retries = 2): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const model = getModel()
      const result = await model.generateContent(prompt)
      const response = result.response

      return {
        text: response.text(),
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

  throw lastError
}
