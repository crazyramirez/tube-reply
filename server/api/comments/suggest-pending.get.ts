import { and, count, eq, isNull } from 'drizzle-orm'
import { comments, suggestedReplies } from '../../db/schema'
import { useDb } from '../../utils/db'

export default defineEventHandler(async () => {
  const db = useDb()

  const [{ value: pendingCount }] = await db
    .select({ value: count(comments.id) })
    .from(comments)
    .where(
      and(
        eq(comments.status, 'pending'),
        isNull(comments.parentId),
        isNull(comments.processedAt),
      ),
    )

  return { count: pendingCount }
})
