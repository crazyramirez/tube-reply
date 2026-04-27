import { eq } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { automationRules } from '../../db/schema'
import { readBody, getRouterParam } from 'h3'
import type { AutomationCondition, AutomationAction } from '../../../shared/types'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const body = await readBody(event) as Partial<{
    name: string
    isActive: boolean
    conditions: AutomationCondition[]
    action: AutomationAction
    actionParams: Record<string, string | number> | null
  }>

  const patch: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  }

  if (body.name !== undefined) patch.name = body.name
  if (body.isActive !== undefined) patch.isActive = body.isActive
  if (body.conditions !== undefined) patch.conditions = JSON.stringify(body.conditions)
  if (body.action !== undefined) patch.action = body.action
  if ('actionParams' in body) patch.actionParams = body.actionParams ? JSON.stringify(body.actionParams) : null

  const db = useDb()
  const [updated] = await db
    .update(automationRules)
    .set(patch)
    .where(eq(automationRules.id, id))
    .returning()

  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Rule not found' })
  return {
    ...updated,
    conditions: (() => { try { return JSON.parse(updated.conditions) } catch { return [] } })(),
    actionParams: updated.actionParams ? (() => { try { return JSON.parse(updated.actionParams!) } catch { return null } })() : null,
  }
})
