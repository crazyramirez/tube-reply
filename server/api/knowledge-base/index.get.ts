import { eq, and, desc } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { knowledgeBase } from '../../db/schema'

export default defineEventHandler(async (event) => {
  const db = useDb()
  const query = getQuery(event)
  const type = query.type as string | undefined
  const activeOnly = query.active !== 'false'

  const conditions = [
    ...(activeOnly ? [eq(knowledgeBase.isActive, true)] : []),
    ...(type ? [eq(knowledgeBase.type, type as 'faq' | 'style' | 'info' | 'rule')] : []),
  ]

  const entries = await db.query.knowledgeBase.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: [desc(knowledgeBase.createdAt), desc(knowledgeBase.priority)],

  })

  return { items: entries }
})
