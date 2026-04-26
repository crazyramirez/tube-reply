import { useDb } from "../../../utils/db"
import { agentChats } from "../../../db/schema"

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const title = body?.title ?? 'New conversation'
  const db = useDb()
  const [chat] = await db.insert(agentChats).values({ title }).returning()
  return { chat }
})
