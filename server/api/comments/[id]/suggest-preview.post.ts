import { getAiSuggestionRaw } from '../../../services/suggestion-engine'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing ID' })

  const body = await readBody(event)
  const { langOverride, additionalContext } = body

  try {
    const { validated, rawText, promptTokens, completionTokens } = await getAiSuggestionRaw(
      id,
      langOverride,
      additionalContext
    )

    // Return the suggestion data directly
    return {
      responseText: validated.response_text,
      verificationTranslation: validated.verification_translation,
      contextUsed: validated.context_used,
      confidenceScore: validated.confidence,
      needsConfirmation: validated.needs_confirmation,
      confirmationReason: validated.confirmation_reason,
      videoLinksUsed: validated.video_links_used,
      detectedCommentLang: validated.detected_language,
      originalGenerated: rawText,
      promptTokens,
      completionTokens,
      // Metadata to help the frontend identify this as unsaved
      isEphemeral: true
    }
  } catch (err: any) {
    throw createError({
      statusCode: 500,
      statusMessage: err.message || 'Generation failed'
    })
  }
})
