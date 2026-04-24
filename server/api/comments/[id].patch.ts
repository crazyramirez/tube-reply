import { eq } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { comments } from '../../db/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = useDb()

  const update: Record<string, unknown> = {}
  if ('detectedLang' in body) update.detectedLang = body.detectedLang || null
  if ('status' in body) update.status = body.status

  if (Object.keys(update).length === 0)
    throw createError({ statusCode: 400, statusMessage: 'Nothing to update' })

  await db.update(comments).set(update).where(eq(comments.id, id))
  return { ok: true }
})
