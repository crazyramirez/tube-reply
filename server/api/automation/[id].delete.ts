import { eq } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { automationRules } from '../../db/schema'
import { getRouterParam } from 'h3'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb()
  await db.delete(automationRules).where(eq(automationRules.id, id))

  return { ok: true }
})
