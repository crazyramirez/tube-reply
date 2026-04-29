import { google } from 'googleapis'
import { eq, desc, inArray } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { videoAnalytics, videos } from '../db/schema'
import { getAuthenticatedOAuth2 } from '../utils/youtube'
import { logger } from '../utils/logger'

export interface VideoAnalyticsRow {
  videoId: string
  views: number
  estimatedMinutesWatched: number
  averageViewDuration: number
  averageViewPercentage: number
  impressions: number
  impressionCtr: number
  subscribersGained: number
  subscribersLost: number
  likes: number
  shares: number
  snapshotDate: string
}

export interface ChannelAnalyticsSummary {
  totalViews: number
  totalWatchMinutes: number
  totalImpressions: number
  avgCtr: number
  subscribersGained: number
  subscribersLost: number
  topVideos: Array<VideoAnalyticsRow & { title: string }>
  snapshotDate: string
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

export async function syncYouTubeAnalytics(dayRange = 28): Promise<{ synced: number; error?: string }> {
  try {
    const oauth2 = await getAuthenticatedOAuth2()
    const analyticsClient = google.youtubeAnalytics({ version: 'v2', auth: oauth2 })

    const db = useDb()
    const allVideos = await db.query.videos.findMany({
      columns: { id: true },
      orderBy: [desc(videos.publishedAt)],
      limit: 200,
    })

    if (allVideos.length === 0) return { synced: 0 }

    const startDate = daysAgo(dayRange)
    const endDate = today()
    const snapshotDate = endDate

    // YouTube Analytics API can filter up to 200 videos per request
    const videoIds = allVideos.map(v => v.id)
    const filterStr = `video==${videoIds.join(',')}`

    const res = await analyticsClient.reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: [
        'views',
        'estimatedMinutesWatched',
        'averageViewDuration',
        'averageViewPercentage',
        'impressions',
        'impressionClickThroughRate',
        'subscribersGained',
        'subscribersLost',
        'likes',
        'shares',
      ].join(','),
      dimensions: 'video',
      filters: filterStr,
      sort: '-views',
      maxResults: 200,
    })

    const rows = res.data.rows ?? []
    const columnHeaders = res.data.columnHeaders ?? []

    const colIndex = Object.fromEntries(
      columnHeaders.map((h, i) => [h.name!, i]),
    )

    const records: VideoAnalyticsRow[] = rows.map((row) => ({
      videoId: String(row[colIndex.video] ?? ''),
      views: Number(row[colIndex.views] ?? 0),
      estimatedMinutesWatched: Number(row[colIndex.estimatedMinutesWatched] ?? 0),
      averageViewDuration: Number(row[colIndex.averageViewDuration] ?? 0),
      averageViewPercentage: Number(row[colIndex.averageViewPercentage] ?? 0),
      impressions: Number(row[colIndex.impressions] ?? 0),
      impressionCtr: Number(row[colIndex.impressionClickThroughRate] ?? 0),
      subscribersGained: Number(row[colIndex.subscribersGained] ?? 0),
      subscribersLost: Number(row[colIndex.subscribersLost] ?? 0),
      likes: Number(row[colIndex.likes] ?? 0),
      shares: Number(row[colIndex.shares] ?? 0),
      snapshotDate,
    })).filter(r => r.videoId && videoIds.includes(r.videoId))

    for (const r of records) {
      await db.insert(videoAnalytics).values({
        videoId: r.videoId,
        snapshotDate: r.snapshotDate,
        views: r.views,
        estimatedMinutesWatched: r.estimatedMinutesWatched,
        averageViewDuration: r.averageViewDuration,
        averageViewPercentage: r.averageViewPercentage,
        impressions: r.impressions,
        impressionCtr: r.impressionCtr,
        subscribersGained: r.subscribersGained,
        subscribersLost: r.subscribersLost,
        likes: r.likes,
        shares: r.shares,
      }).onConflictDoUpdate({
        target: [videoAnalytics.videoId, videoAnalytics.snapshotDate],
        set: {
          views: r.views,
          estimatedMinutesWatched: r.estimatedMinutesWatched,
          averageViewDuration: r.averageViewDuration,
          averageViewPercentage: r.averageViewPercentage,
          impressions: r.impressions,
          impressionCtr: r.impressionCtr,
          subscribersGained: r.subscribersGained,
          subscribersLost: r.subscribersLost,
          likes: r.likes,
          shares: r.shares,
          fetchedAt: new Date().toISOString(),
        },
      })
    }

    return { synced: records.length }
  }
  catch (err: any) {
    const message = err?.message ?? 'Unknown error'
    const isScope = message.includes('insufficientPermissions') || message.includes('403')
    await logger.warn('youtube-analytics', `Sync failed: ${message}`)
    return {
      synced: 0,
      error: isScope
        ? 'Missing yt-analytics.readonly scope. Please reconnect your YouTube channel.'
        : message,
    }
  }
}

export async function getChannelAnalyticsSummary(dayRange = 28): Promise<ChannelAnalyticsSummary | null> {
  const db = useDb()
  const snapshotDate = today()

  const rows = await db
    .select({
      videoId: videoAnalytics.videoId,
      title: videos.title,
      views: videoAnalytics.views,
      estimatedMinutesWatched: videoAnalytics.estimatedMinutesWatched,
      averageViewDuration: videoAnalytics.averageViewDuration,
      averageViewPercentage: videoAnalytics.averageViewPercentage,
      impressions: videoAnalytics.impressions,
      impressionCtr: videoAnalytics.impressionCtr,
      subscribersGained: videoAnalytics.subscribersGained,
      subscribersLost: videoAnalytics.subscribersLost,
      likes: videoAnalytics.likes,
      shares: videoAnalytics.shares,
      snapshotDate: videoAnalytics.snapshotDate,
    })
    .from(videoAnalytics)
    .innerJoin(videos, eq(videoAnalytics.videoId, videos.id))
    .where(eq(videoAnalytics.snapshotDate, snapshotDate))
    .orderBy(desc(videoAnalytics.views))
    .limit(50)

  if (rows.length === 0) return null

  const totals = rows.reduce((acc, r) => ({
    views: acc.views + (r.views ?? 0),
    watchMinutes: acc.watchMinutes + (r.estimatedMinutesWatched ?? 0),
    impressions: acc.impressions + (r.impressions ?? 0),
    subscribersGained: acc.subscribersGained + (r.subscribersGained ?? 0),
    subscribersLost: acc.subscribersLost + (r.subscribersLost ?? 0),
  }), { views: 0, watchMinutes: 0, impressions: 0, subscribersGained: 0, subscribersLost: 0 })

  const avgCtr = rows.length > 0
    ? rows.reduce((s, r) => s + (r.impressionCtr ?? 0), 0) / rows.length
    : 0

  return {
    totalViews: totals.views,
    totalWatchMinutes: totals.watchMinutes,
    totalImpressions: totals.impressions,
    avgCtr,
    subscribersGained: totals.subscribersGained,
    subscribersLost: totals.subscribersLost,
    topVideos: rows.slice(0, 10).map(r => ({
      videoId: r.videoId,
      title: r.title,
      views: r.views ?? 0,
      estimatedMinutesWatched: r.estimatedMinutesWatched ?? 0,
      averageViewDuration: r.averageViewDuration ?? 0,
      averageViewPercentage: r.averageViewPercentage ?? 0,
      impressions: r.impressions ?? 0,
      impressionCtr: r.impressionCtr ?? 0,
      subscribersGained: r.subscribersGained ?? 0,
      subscribersLost: r.subscribersLost ?? 0,
      likes: r.likes ?? 0,
      shares: r.shares ?? 0,
      snapshotDate: r.snapshotDate,
    })),
    snapshotDate,
  }
}

export async function getVideoAnalyticsById(videoId: string): Promise<VideoAnalyticsRow | null> {
  const db = useDb()
  const row = await db.query.videoAnalytics.findFirst({
    where: eq(videoAnalytics.videoId, videoId),
    orderBy: [desc(videoAnalytics.snapshotDate)],
  })
  if (!row) return null
  return {
    videoId: row.videoId,
    views: row.views ?? 0,
    estimatedMinutesWatched: row.estimatedMinutesWatched ?? 0,
    averageViewDuration: row.averageViewDuration ?? 0,
    averageViewPercentage: row.averageViewPercentage ?? 0,
    impressions: row.impressions ?? 0,
    impressionCtr: row.impressionCtr ?? 0,
    subscribersGained: row.subscribersGained ?? 0,
    subscribersLost: row.subscribersLost ?? 0,
    likes: row.likes ?? 0,
    shares: row.shares ?? 0,
    snapshotDate: row.snapshotDate,
  }
}
