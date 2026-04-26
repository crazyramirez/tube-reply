import { desc } from 'drizzle-orm'
import { useDb } from '../../../utils/db'
import { agentChats } from '../../../db/schema'

export default defineEventHandler(async () => {
  const db = useDb()
  const chats = await db.select().from(agentChats).orderBy(desc(agentChats.updatedAt))
  return { chats }
})
