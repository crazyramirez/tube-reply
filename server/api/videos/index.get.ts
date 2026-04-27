import { desc, like, and, or, exists, eq } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { videos, comments } from '../../db/schema'

export default defineEventHandler(async (event) => {
  const db = useDb()
  const query = getQuery(event)
  const search = query.search as string
  const type = query.type as string // 'all', 'video', 'short'

  const page = Math.max(1, parseInt(query.page as string || '1'))
  const limit = Math.max(1, parseInt(query.limit as string || '20'))
  const offset = (page - 1) * limit

  const whereClauses = []
  if (search) {
    const searchPattern = `%${search}%`
    whereClauses.push(
      or(
        like(videos.title, searchPattern),
        exists(
          db.select({ id: comments.id })
            .from(comments)
            .where(
              and(
                eq(comments.videoId, videos.id),
                or(
                  like(comments.text, searchPattern),
                  like(comments.authorName, searchPattern)
                )
              )
            )
        )
      )
    )
  }

  const where = whereClauses.length > 0 ? and(...whereClauses) : undefined

  let allRows = await db.query.videos.findMany({
    where,
    orderBy: [desc(videos.publishedAt)],
    columns: {
      id: true,
      title: true,
      thumbnailUrl: true,
      publishedAt: true,
      viewCount: true,
      commentCount: true,
      lastSyncedAt: true,
      defaultLanguage: true,
      duration: true,
    },
  })

  // Simple duration-based filter for Shorts
  if (type === 'short') {
    allRows = allRows.filter(v => isShort(v.duration))
  } else if (type === 'video') {
    allRows = allRows.filter(v => !isShort(v.duration))
  }

  const total = allRows.length
  const items = allRows.slice(offset, offset + limit)

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  }
})

function isShort(duration: string | null): boolean {
  if (!duration) return false
  // PT1M, PT59S, PT1H...
  // Shorts are usually under 60 seconds.
  // We can check if 'M' or 'H' is present and if 'M' is >= 1
  if (duration.includes('H')) return false
  const match = duration.match(/PT(\d+)M/)
  if (match) {
    const minutes = parseInt(match[1])
    if (minutes >= 1) return false
  }
  return true
}
