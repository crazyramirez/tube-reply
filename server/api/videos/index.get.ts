import { desc } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { videos } from '../../db/schema'

export default defineEventHandler(async (_event) => {
  const db = useDb()

  const rows = await db.query.videos.findMany({
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
    },
  })

  return { items: rows }
})
