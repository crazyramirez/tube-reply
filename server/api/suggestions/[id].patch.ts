import { eq } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { suggestedReplies } from '../../db/schema'

export default defineEventHandler(async (event) => {
  const db = useDb()
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const { editedText } = body ?? {}

  if (!editedText || typeof editedText !== 'string' || !editedText.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'editedText required' })
  }

  const suggestion = await db.query.suggestedReplies.findFirst({
    where: eq(suggestedReplies.id, id),
    columns: { id: true, status: true },
  })
  if (!suggestion) throw createError({ statusCode: 404, statusMessage: 'Suggestion not found' })
  if (suggestion.status === 'published') {
    throw createError({ statusCode: 409, statusMessage: 'Cannot edit a published suggestion' })
  }

  await db.update(suggestedReplies)
    .set({ editedText: editedText.trim(), reviewedAt: new Date().toISOString() })
    .where(eq(suggestedReplies.id, id))

  return { ok: true }
})
