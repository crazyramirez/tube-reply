import { eq } from 'drizzle-orm'
import { useDb } from '../../../../utils/db'
import { agentChats, agentMessages } from '../../../../db/schema'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid chat ID' })

  const db = useDb()
  const [chat] = await db.select().from(agentChats).where(eq(agentChats.id, id)).limit(1)
  if (!chat) throw createError({ statusCode: 404, statusMessage: 'Chat not found' })

  const messages = await db.select().from(agentMessages)
    .where(eq(agentMessages.chatId, id))
    .orderBy(agentMessages.createdAt)

  return { chat, messages }
})
