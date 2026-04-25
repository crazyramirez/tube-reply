import { generateSuggestion } from '../../../services/suggestion-engine'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing ID' })

  const body = await readBody(event)
  const { langOverride, additionalContext } = body

  try {
    return await generateSuggestion(id, langOverride, additionalContext)
  } catch (err: any) {
    throw createError({
      statusCode: 500,
      statusMessage: err.message || 'Generation failed'
    })
  }
})
