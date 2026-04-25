import { getConnectedChannel } from '../../utils/youtube'
import { useDb } from '../../utils/db'
import { syncLog } from '../../db/schema'
import { desc, eq } from 'drizzle-orm'
import { getDailyQuotaUsed } from '../../utils/quota'
import { getAutoSuggestStatus } from '../../services/auto-suggest'

export default defineEventHandler(async (_event) => {
  const db = useDb()

  try {
    const channel = await getConnectedChannel()

    const lastSync = await db.query.syncLog.findFirst({
      orderBy: [desc(syncLog.startedAt)],
    })

    const lastScheduledSync = await db.query.syncLog.findFirst({
      where: eq(syncLog.syncType, 'scheduled'),
      orderBy: [desc(syncLog.startedAt)],
    })

    const dailyQuotaUsed = await getDailyQuotaUsed()
    const config = useRuntimeConfig()
    let nextSyncAt = null
    if (lastScheduledSync?.startedAt) {
      const intervalMs = config.syncIntervalMinutes * 60 * 1000
      nextSyncAt = new Date(new Date(lastScheduledSync.startedAt).getTime() + intervalMs).toISOString()
    }

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
      autoSuggestRunning: getAutoSuggestStatus().isRunning,
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
            nextSyncAt,
          }
        : null,
    }
  }
  catch {
    return { connected: false, channel: null, lastSync: null }
  }
})
