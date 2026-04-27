import { useDb } from '../../utils/db'
import { automationRules } from '../../db/schema'
import { readBody } from 'h3'
import type { AutomationCondition, AutomationAction } from '../../../shared/types'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const { name, conditions, action, actionParams } = body as {
    name: string
    conditions: AutomationCondition[]
    action: AutomationAction
    actionParams?: Record<string, string | number> | null
  }

  if (!name || !Array.isArray(conditions) || conditions.length === 0 || !action) {
    throw createError({ statusCode: 400, statusMessage: 'name, conditions, and action are required' })
  }

  const db = useDb()
  const [rule] = await db.insert(automationRules).values({
    name,
    conditions: JSON.stringify(conditions),
    action,
    actionParams: actionParams ? JSON.stringify(actionParams) : null,
  }).returning()

  return rule
})
