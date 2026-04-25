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

  // Permanent delete
  await db.delete(knowledgeBase).where(eq(knowledgeBase.id, id))

  return { ok: true }
})
