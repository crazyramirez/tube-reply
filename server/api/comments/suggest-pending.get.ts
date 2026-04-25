import { and, count, eq, isNull } from 'drizzle-orm'
import { comments, suggestedReplies } from '../../db/schema'
import { useDb } from '../../utils/db'

export default defineEventHandler(async () => {
  const db = useDb()

  const [{ value }] = await db
    .select({ value: count() })
    .from(comments)
    .leftJoin(suggestedReplies, eq(comments.id, suggestedReplies.commentId))
    .where(
      and(
        eq(comments.status, 'pending'),
        isNull(comments.parentId),
        isNull(suggestedReplies.id),
      ),
    )

  return { count: value }
})
