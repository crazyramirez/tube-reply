import { eq } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { knowledgeBase } from '../../db/schema'

export default defineEventHandler(async (event) => {
  const db = useDb()
  const id = Number(getRouterParam(event, 'id'))

  const existing = await db.query.knowledgeBase.findFirst({
    where: eq(knowledgeBase.id, id),
    columns: { id: true },
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Entry not found' })

  // Soft delete — keep data for audit
  await db.update(knowledgeBase)
    .set({ isActive: false, updatedAt: new Date().toISOString() })
    .where(eq(knowledgeBase.id, id))

  return { ok: true }
})
