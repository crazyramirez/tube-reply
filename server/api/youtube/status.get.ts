import { getConnectedChannel } from '../../utils/youtube'
import { useDb } from '../../utils/db'
import { syncLog } from '../../db/schema'
import { desc } from 'drizzle-orm'
import { getDailyQuotaUsed } from '../../utils/quota'

export default defineEventHandler(async (_event) => {
  const db = useDb()

  try {
    const channel = await getConnectedChannel()

    const lastSync = await db.query.syncLog.findFirst({
      orderBy: [desc(syncLog.startedAt)],
    })

    const dailyQuotaUsed = await getDailyQuotaUsed()

    return {
      connected: !!channel,
      channel: channel
        ? {
            id: channel.id,
            title: channel.snippet?.title,
            thumbnailUrl: channel.snippet?.thumbnails?.default?.url,
            subscriberCount: channel.statistics?.subscriberCount,
            videoCount: channel.statistics?.videoCount,
          }
        : null,
      dailyQuotaUsed,
      lastSync: lastSync
        ? {
            syncType: lastSync.syncType,
            status: lastSync.status,
            startedAt: lastSync.startedAt,
            completedAt: lastSync.completedAt,
            videosProcessed: lastSync.videosProcessed,
            commentsFound: lastSync.commentsFound,
            newComments: lastSync.newComments,
            quotaUsed: lastSync.quotaUsed,
            errorMessage: lastSync.errorMessage,
          }
        : null,
    }
  }
  catch {
    return { connected: false, channel: null, lastSync: null }
  }
})
