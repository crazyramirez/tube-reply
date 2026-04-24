import { eq } from 'drizzle-orm'
import { useDb } from '../../../utils/db'
import { comments } from '../../../db/schema'

export default defineEventHandler(async (event) => {
  const db = useDb()
  const id = getRouterParam(event, 'id')!

  const comment = await db.query.comments.findFirst({
    where: eq(comments.id, id),
    columns: { id: true, status: true },
  })
  if (!comment) throw createError({ statusCode: 404, statusMessage: 'Comment not found' })
  if (comment.status === 'published') {
    throw createError({ statusCode: 409, statusMessage: 'Cannot dismiss a published comment' })
  }

  await db.update(comments)
    .set({ status: 'dismissed', processedAt: new Date().toISOString() })
    .where(eq(comments.id, id))

  return { ok: true }
})
