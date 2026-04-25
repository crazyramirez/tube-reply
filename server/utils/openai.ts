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
        description: 'Search for videos in the channel database by title keywords.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Keywords to search video titles (e.g. "docker tutorial")',
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
