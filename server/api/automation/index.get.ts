import { useDb } from '../../utils/db'
import { automationRules } from '../../db/schema'
import { desc } from 'drizzle-orm'

export default defineEventHandler(async () => {
  const db = useDb()
  const rows = await db.select().from(automationRules).orderBy(desc(automationRules.createdAt))
  return rows.map(r => ({
    ...r,
    conditions: (() => { try { return JSON.parse(r.conditions) } catch { return [] } })(),
    actionParams: r.actionParams ? (() => { try { return JSON.parse(r.actionParams!) } catch { return null } })() : null,
  }))
})
