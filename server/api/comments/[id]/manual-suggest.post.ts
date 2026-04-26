import { eq } from 'drizzle-orm'
import { useDb } from '../../../utils/db'
import { comments, suggestedReplies } from '../../../db/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing ID' })

  const db = useDb()
  const comment = await db.query.comments.findFirst({
    where: eq(comments.id, id),
  })

  if (!comment) throw createError({ statusCode: 404, statusMessage: 'Comment not found' })

  // Create a placeholder manual suggestion
  const [inserted] = await db.insert(suggestedReplies).values({
    commentId: id,
    responseText: '',
    verificationTranslation: '',
    originalGenerated: 'MANUAL_ENTRY',
    status: 'pending_review',
    confidenceScore: 1.0,
    modelUsed: 'manual',
  }).returning({ id: suggestedReplies.id })

  // Update comment status to pending so it can be edited
  await db.update(comments)
    .set({ status: 'pending' })
    .where(eq(comments.id, id))

  return { suggestionId: inserted.id }
})
