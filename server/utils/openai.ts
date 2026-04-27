import OpenAI from 'openai'

let _client: OpenAI | null = null

export function getOpenAIClient() {
  if (_client) return _client
  const config = useRuntimeConfig()
  if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY not configured')
  _client = new OpenAI({
    apiKey: config.openaiApiKey,
  })
  return _client
}


export async function openaiGenerate(
  prompt: string,
  retries = 2,
  responseFormat?: { type: 'json_object' | 'text' }
): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  const config = useRuntimeConfig()
  const model = (config.openaiModel as string) ?? 'gpt-4o-mini'
  const client = getOpenAIClient()

  // Auto-detect JSON if not specified
  const finalResponseFormat = responseFormat ?? (prompt.toLowerCase().includes('json') ? { type: 'json_object' } : undefined)

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: finalResponseFormat,
        max_tokens: 2048,
      })
      return {
        text: response.choices[0].message.content ?? '',
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
      }
    } catch (err) {
      console.error(`[openai] openaiGenerate attempt ${attempt + 1} failed:`, err)
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
      } else {
        throw err
      }
    }
  }
  throw new Error('Failed to generate with OpenAI after retries')
}

export async function openaiGenerateWithTools(
  prompt: string,
  searchFn: VideoSearchFn,
  retries = 2,
): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  const config = useRuntimeConfig()
  const model = (config.openaiModel as string) ?? 'gpt-4o-mini'
  const client = getOpenAIClient()

  let totalPromptTokens = 0
  let totalCompletionTokens = 0

  const messages: any[] = [
    { 
      role: 'system', 
      content: 'You are a YouTube community manager. Return ONLY a JSON object. IMPORTANT: Do NOT use Markdown links or bold/italic markers in the text, as YouTube comments do not support them. Use plain URLs.' 
    },
    { role: 'user', content: prompt }
  ]

  const tools: any[] = [
    {
      type: 'function',
      function: {
        name: 'search_videos',
        description: [
          'Search for videos in the channel database using semantic keywords.',
          'WHEN TO CALL: Call this tool whenever the commenter is asking about a specific video, topic, tutorial, product, technique, date, or event — in ANY language.',
          'WHEN NOT TO CALL: Do NOT call for generic greetings, pure compliments, spam, or questions answerable from the recent-videos list provided.',
          'QUERY STRATEGY: Extract 2–4 core topic nouns/adjectives. Remove filler/stop words in any language.',
          'ES: "¿dónde puedo ver el tutorial de blusa de septiembre?" → query "blusa septiembre".',
          'EN: "do you have a crochet bag tutorial?" → query "crochet bag".',
          'FR: "où est la vidéo sur le crochet?" → query "crochet".',
          'PT/BR: "onde está o vídeo de crochê bolsa?" → query "crochê bolsa".',
          'RU: "где видео про вязание крючком?" → query "вязание крючком".',
          'AR: "أين فيديو الكروشيه؟" → query "كروشيه".',
          'If the first search returns 0 results, retry with a shorter or synonym query.',
        ].join(' '),
        parameters: {
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
    },
  ]

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let response = await client.chat.completions.create({
        model,
        messages,
        tools,
        tool_choice: 'auto',
        response_format: { type: 'json_object' }
      })

      totalPromptTokens += response.usage?.prompt_tokens ?? 0
      totalCompletionTokens += response.usage?.completion_tokens ?? 0

      let responseMessage = response.choices[0].message

      // Handle tool calls
      const MAX_ROUNDS = 3
      for (let round = 0; round < MAX_ROUNDS; round++) {
        if (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) break

        messages.push(responseMessage)

        for (const toolCall of responseMessage.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments)
          console.log(`[openai] search_videos round ${round + 1}, query: "${args.query}"`)
          const results = await searchFn(args.query)
          console.log(`[openai] search_videos returned ${results.length} results`)
          
          messages.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: 'search_videos',
            content: JSON.stringify({
              found: results.length,
              videos: results.map(v => ({
                id: v.id,
                title: v.title,
                url: `https://youtu.be/${v.id}`,
                thumbnail_url: v.thumbnailUrl,
              })),
            }),
          })
        }

        response = await client.chat.completions.create({
          model,
          messages,
          response_format: { type: 'json_object' }
        })

        totalPromptTokens += response.usage?.prompt_tokens ?? 0
        totalCompletionTokens += response.usage?.completion_tokens ?? 0
        responseMessage = response.choices[0].message
      }

      return {
        text: responseMessage.content || '',
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
      }
    } catch (err) {
      console.error(`[openai] Attempt ${attempt + 1} failed:`, err)
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
      } else {
        throw err
      }
    }
  }
  throw new Error('Failed to generate with OpenAI after retries')
}
