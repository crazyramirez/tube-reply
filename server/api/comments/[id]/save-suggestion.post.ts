import { useDb } from '../../../utils/db'
import { suggestedReplies, comments } from '../../../db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { getAiProvider } from '../../../utils/settings'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing ID' })

  const body = await readBody(event)
  const { 
    responseText, 
    verificationTranslation, 
    contextUsed, 
    confidenceScore,
    needsConfirmation,
    confirmationReason,
    videoLinksUsed,
    detectedCommentLang,
    modelUsed,
    promptTokens,
    completionTokens,
    originalGenerated,
    editedText
  } = body

  const db = useDb()

  try {
    // Mark previous pending suggestions as rejected
    await db.update(suggestedReplies)
      .set({ status: 'rejected' })
      .where(and(
        eq(suggestedReplies.commentId, id),
        eq(suggestedReplies.status, 'pending_review')
      ))

    // Insert the new suggestion
    const [inserted] = await db.insert(suggestedReplies).values({
      commentId: id,
      responseText,
      verificationTranslation,
      originalGenerated,
      editedText: editedText || null,
      contextUsed: typeof contextUsed === 'string' ? contextUsed : JSON.stringify(contextUsed),
      confidenceScore,
      needsConfirmation: !!needsConfirmation,
      confirmationReason,
      videoLinksUsed: typeof videoLinksUsed === 'string' ? videoLinksUsed : JSON.stringify(videoLinksUsed),
      detectedCommentLang,
      modelUsed,
      promptTokens,
      completionTokens,
      status: 'pending_review',
    }).returning({ id: suggestedReplies.id })

    // Update comment status
    await db.update(comments)
      .set({ status: 'suggested', processedAt: new Date().toISOString() })
      .where(and(
        eq(comments.id, id),
        inArray(comments.status, ['pending', 'suggested'])
      ))

    return { suggestionId: inserted.id }
  } catch (err: any) {
    throw createError({
      statusCode: 500,
      statusMessage: err.message || 'Failed to save suggestion'
    })
  }
})
