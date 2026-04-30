import { eq, and } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { automationRules, comments } from '../db/schema'
import { logger } from '../utils/logger'
import type { AutomationCondition, AutomationAction } from '../../shared/types'

interface CommentRow {
  id: string
  text: string
  detectedLang: string | null
  detectedIntent: string | null
  priorityScore: number | null
  priorityLabel: string | null
  isReturnCommenter: boolean | null
  opportunityFlags: string | null
  status: string
}

// ─── Condition evaluation ─────────────────────────────────────────────────────

function evalCondition(cond: AutomationCondition, comment: CommentRow): boolean {
  const val = cond.value
  switch (cond.field) {
    case 'contains_keyword':
      return comment.text.toLowerCase().includes(String(val).toLowerCase())
    case 'intent_is':
      return comment.detectedIntent === String(val)
    case 'score_above':
      return (comment.priorityScore ?? 0) > Number(val)
    case 'score_below':
      return (comment.priorityScore ?? 100) < Number(val)
    case 'language_is':
      return comment.detectedLang === String(val)
    case 'is_return_commenter':
      return !!comment.isReturnCommenter === Boolean(val)
    case 'has_opportunity_flag': {
      const flags = comment.opportunityFlags
        ? JSON.parse(comment.opportunityFlags) as string[]
        : []
      return flags.includes(String(val))
    }
    default:
      return false
  }
}

// ─── Apply action ─────────────────────────────────────────────────────────────

async function applyAction(
  action: AutomationAction,
  params: Record<string, string | number> | null,
  comment: CommentRow,
): Promise<void> {
  const db = useDb()

  switch (action) {
    case 'auto_dismiss':
      await db.update(comments).set({ status: 'dismissed' }).where(eq(comments.id, comment.id))
      break
    case 'set_priority': {
      const label = String(params?.label ?? 'high') as 'urgent' | 'high' | 'normal' | 'low'
      const scoreMap = { urgent: 90, high: 70, normal: 50, low: 20 }
      await db.update(comments).set({
        priorityLabel: label,
        priorityScore: scoreMap[label],
      }).where(eq(comments.id, comment.id))
      break
    }
    case 'add_flag': {
      const flag = String(params?.flag ?? 'flagged')
      const existing = comment.opportunityFlags
        ? JSON.parse(comment.opportunityFlags) as string[]
        : []
      if (!existing.includes(flag)) {
        existing.push(flag)
        await db.update(comments)
          .set({ opportunityFlags: JSON.stringify(existing) })
          .where(eq(comments.id, comment.id))
      }
      break
    }
    case 'auto_suggest':
      // Trigger AI suggestion asynchronously (fire-and-forget)
      import('./suggestion-engine').then(({ generateSuggestion }) => {
        generateSuggestion(comment.id, null, null).catch(() => {})
      })
      break
    case 'notify':
      // Set to urgent so it shows in dashboard widget
      await db.update(comments).set({ priorityLabel: 'urgent', priorityScore: 95 })
        .where(eq(comments.id, comment.id))
      break
  }
}

// ─── Run rules for a single comment ──────────────────────────────────────────

export async function applyRulesToComment(commentId: string): Promise<void> {
  const db = useDb()

  const comment = await db.query.comments.findFirst({
    where: eq(comments.id, commentId),
    columns: {
      id: true, text: true, detectedLang: true, detectedIntent: true,
      priorityScore: true, priorityLabel: true, isReturnCommenter: true,
      opportunityFlags: true, status: true,
    },
  })
  if (!comment) return

  const rules = await db.query.automationRules.findMany({
    where: eq(automationRules.isActive, true),
  })

  let ruleMatched = false
  for (const rule of rules) {
    try {
      const conditions: AutomationCondition[] = JSON.parse(rule.conditions)
      const allMatch = conditions.every(c => evalCondition(c, comment as CommentRow))
      if (!allMatch) continue

      ruleMatched = true
      const params = rule.actionParams ? JSON.parse(rule.actionParams) : null
      await applyAction(rule.action as AutomationAction, params, comment as CommentRow)

      // Increment trigger count
      await db.update(automationRules)
        .set({ triggerCount: (rule.triggerCount ?? 0) + 1 })
        .where(eq(automationRules.id, rule.id))
    } catch (err) {
      await logger.warn('automation-engine', `Rule ${rule.id} failed`, { error: (err as Error).message })
    }
  }

  // Fallback: If no specific rule matched and global auto-suggest is enabled, trigger it
  if (!ruleMatched) {
    const { getAutoSuggestEnabled } = await import('../utils/settings')
    if (await getAutoSuggestEnabled()) {
      const { generateSuggestion } = await import('./suggestion-engine')
      // Only suggest if not already suggested/published
      if (comment.status === 'pending') {
        await generateSuggestion(comment.id, null, null).catch((err) => {
          logger.warn('automation-engine', `Global auto-suggest failed for ${comment.id}`, { error: err.message })
        })
      }
    }
  }
}

// ─── Run rules on all pending comments (batch) ───────────────────────────────

export async function runAutomationOnPending(): Promise<number> {
  const db = useDb()

  const pending = await db.query.comments.findMany({
    where: and(eq(comments.status, 'pending')),
    columns: { id: true },
    limit: 100,
  })

  let count = 0
  for (const c of pending) {
    await applyRulesToComment(c.id)
    count++
  }
  return count
}
