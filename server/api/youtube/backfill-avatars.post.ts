import { isNull, ne, and, sql } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { comments } from '../../db/schema'
import { getAuthenticatedYouTube } from '../../utils/youtube'

export default defineEventHandler(async () => {
  const db = useDb()

  // Find author channel IDs that have no avatar stored yet
  const rows = await db
    .select({ authorChannelId: comments.authorChannelId })
    .from(comments)
    .where(
      and(
        isNull(comments.authorProfileImageUrl),
        isNull(comments.parentId),
        ne(comments.authorChannelId, ''),
        sql`${comments.authorChannelId} IS NOT NULL`,
      )
    )
    .groupBy(comments.authorChannelId)
    .limit(50)

  if (rows.length === 0) return { updated: 0, message: 'All avatars already populated' }

  const channelIds = rows.map(r => r.authorChannelId as string)

  const yt = await getAuthenticatedYouTube()
  const res = await yt.channels.list({
    part: ['snippet'],
    id: channelIds,
    maxResults: 50,
  })

  let updated = 0
  for (const channel of res.data.items ?? []) {
    const avatarUrl =
      channel.snippet?.thumbnails?.medium?.url ||
      channel.snippet?.thumbnails?.default?.url
    if (!channel.id || !avatarUrl) continue

    await db
      .update(comments)
      .set({ authorProfileImageUrl: avatarUrl })
      .where(
        and(
          sql`${comments.authorChannelId} = ${channel.id}`,
          isNull(comments.authorProfileImageUrl),
        )
      )

    updated++
  }

  return { updated, total: channelIds.length }
})
