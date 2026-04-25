import { eq } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { knowledgeBase } from '../../db/schema'

export default defineEventHandler(async (event) => {
  const db = useDb()
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)

  const existing = await db.query.knowledgeBase.findFirst({
    where: eq(knowledgeBase.id, id),
    columns: { id: true },
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Entry not found' })

  const VALID_TYPES = ['faq', 'style', 'info', 'rule'] as const

  const updates: Partial<typeof knowledgeBase.$inferInsert> = {}
  if (body.type !== undefined) {
    if (!VALID_TYPES.includes(body.type)) {
      throw createError({ statusCode: 400, statusMessage: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` })
    }
    updates.type = body.type
  }
  if (body.title !== undefined) updates.title = body.title.trim()
  if (body.content !== undefined) updates.content = body.content.trim()
  if (body.tags !== undefined) updates.tags = JSON.stringify(body.tags)
  if (body.priority !== undefined) updates.priority = Number(body.priority)
  if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive)
  updates.updatedAt = new Date().toISOString()

  await db.update(knowledgeBase).set(updates).where(eq(knowledgeBase.id, id))
  return { ok: true }
})
