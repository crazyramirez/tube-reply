import { eq } from 'drizzle-orm'
import { useDb } from '../../../utils/db'
import { agentChats } from '../../../db/schema'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid chat ID' })

  const db = useDb()
  await db.delete(agentChats).where(eq(agentChats.id, id))
  return { success: true }
})
