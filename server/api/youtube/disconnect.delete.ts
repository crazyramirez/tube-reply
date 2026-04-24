import { useDb } from '../../utils/db'
import { oauthTokens } from '../../db/schema'

export default defineEventHandler(async (_event) => {
  const db = useDb()
  await db.delete(oauthTokens)
  return { ok: true }
})
