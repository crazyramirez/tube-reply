import { eq, inArray } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { getAuthenticatedYouTube, refreshChannelMetadata } from '../utils/youtube'
import { logger } from '../utils/logger'
import { detectLanguage } from './language-detect'
import { videos, comments, syncLog, oauthTokens } from '../db/schema'
import { getRemainingQuota } from '../utils/quota'

type SyncType = 'videos' | 'comments' | 'manual' | 'scheduled'

// Only fetch comments for videos published within this window on scheduled syncs
const RECENT_VIDEO_DAYS = 180

// Persist nextPageToken per video across runs
const pageTokenCache = new Map<string, string>()

let isRunning = false

export async function syncComments(syncType: SyncType = 'scheduled', scope: 'recent' | 'all' = 'recent'): Promise<void> {
  if (isRunning) {
    await logger.info('comment-sync', 'Sync already running, skipping')
    return
  }

  const db = useDb()

  // Check YouTube is connected
  const token = await db.query.oauthTokens.findFirst()
  if (!token) return

  isRunning = true
  const config = useRuntimeConfig()
  let logId: number | null = null
  let totalQuota = 0

  // Guard: check real daily quota before starting
  const remaining = await getRemainingQuota()
  if (remaining < 10) {
    await logger.warn('comment-sync', 'Daily quota exhausted, skipping sync', { remaining })
    isRunning = false
    return
  }
  let totalNew = 0
  let totalFound = 0
  let videosProcessed = 0

  try {
    const [logEntry] = await db.insert(syncLog).values({
      syncType,
      status: 'running',
    }).returning({ id: syncLog.id })

    logId = logEntry.id
    const yt = await getAuthenticatedYouTube()

    // Refresh cached channel metadata (1 quota unit, done once per sync)
    await refreshChannelMetadata().catch(() => {})

    // Sync video list (always on manual, or if no videos exist)
    // Optimization: check existing videos only once
    const existingVideos = await db.query.videos.findMany({ columns: { id: true } })
    if (syncType === 'manual' || existingVideos.length === 0) {
      await syncVideoList(yt, db, config)
      totalQuota += 2
    }

    // Re-fetch all videos after potential syncVideoList
    const allVideos = await db.query.videos.findMany()
    const ownerChannelId = token.channelId

    const cutoff = new Date(Date.now() - RECENT_VIDEO_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const videosToSync = syncType === 'manual' || scope === 'all'
      ? allVideos
      : allVideos.filter(v => v.publishedAt >= cutoff)

    await logger.info('comment-sync', `Syncing ${videosToSync.length} videos (type: ${syncType}, scope: ${scope})`)

    for (const video of videosToSync) {
      // Abort if this run consumed most of its share (real daily guard is at start)
      if (totalQuota >= remaining - 10) {
        await logger.warn('comment-sync', 'Approaching quota limit, stopping sync', { totalQuota, remaining })
        break
      }

      const { found, newCount, quotaUsed } = await syncVideoComments(yt, video.id, db, ownerChannelId)
      totalFound += found
      totalNew += newCount
      totalQuota += quotaUsed
      videosProcessed++

      // Write incremental progress every 10 videos so UI can poll it
      if (logId && videosProcessed % 10 === 0) {
        await db.update(syncLog)
          .set({ videosProcessed, commentsFound: totalFound, newComments: totalNew, quotaUsed: totalQuota })
          .where(eq(syncLog.id, logId))
      }

      // Small delay between videos to be polite
      await new Promise(r => setTimeout(r, 200))
    }

    if (logId) {
      await db.update(syncLog)
        .set({
          status: 'completed',
          videosProcessed,
          commentsFound: totalFound,
          newComments: totalNew,
          quotaUsed: totalQuota,
          completedAt: new Date().toISOString(),
        })
        .where(eq(syncLog.id, logId))
    }

    await logger.info('comment-sync', 'Sync completed', { totalNew, totalQuota, videosProcessed })
  }
  catch (err) {
    await logger.error('comment-sync', 'Sync failed', err as Error)
    if (logId) {
      await db.update(syncLog)
        .set({
          status: 'failed',
          errorMessage: (err as Error).message,
          completedAt: new Date().toISOString(),
          quotaUsed: totalQuota,
        })
        .where(eq(syncLog.id, logId))
    }
  }
  finally {
    isRunning = false
  }
}

async function syncVideoList(
  yt: Awaited<ReturnType<typeof getAuthenticatedYouTube>>,
  db: ReturnType<typeof useDb>,
  config: ReturnType<typeof useRuntimeConfig>,
) {
  // Get the uploads playlist ID for the channel
  const channelRes = await yt.channels.list({ part: ['contentDetails'], mine: true })
  const uploadsId = channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!uploadsId) return

  let pageToken: string | undefined
  const videoIds: string[] = []

  do {
    const res = await yt.playlistItems.list({
      part: ['snippet'],
      playlistId: uploadsId,
      maxResults: 50,
      ...(pageToken ? { pageToken } : {}),
    })

    for (const item of res.data.items ?? []) {
      const vid = item.snippet?.resourceId?.videoId
      if (vid) videoIds.push(vid)
    }

    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)

  // Fetch video metadata in batches of 50
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50)
    const detailsRes = await yt.videos.list({
      part: ['snippet', 'statistics', 'contentDetails'],
      id: batch,
    })

    for (const v of detailsRes.data.items ?? []) {
      if (!v.id || !v.snippet) continue

      await db.insert(videos).values({
        id: v.id,
        channelId: v.snippet.channelId ?? '',
        title: v.snippet.title ?? '',
        description: v.snippet.description ?? '',
        publishedAt: v.snippet.publishedAt ?? new Date().toISOString(),
        thumbnailUrl: (v.snippet.thumbnails?.maxres?.url || v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url || null)?.replace('mqdefault.jpg', 'hqdefault.jpg') || null,
        duration: v.contentDetails?.duration ?? null,
        tags: v.snippet.tags ? JSON.stringify(v.snippet.tags) : null,
        categoryId: v.snippet.categoryId ?? null,
        defaultLanguage: v.snippet.defaultLanguage ?? null,
        viewCount: Number(v.statistics?.viewCount ?? 0),
        commentCount: Number(v.statistics?.commentCount ?? 0),
        lastSyncedAt: new Date().toISOString(),
      }).onConflictDoUpdate({
        target: videos.id,
        set: {
          title: v.snippet.title ?? '',
          viewCount: Number(v.statistics?.viewCount ?? 0),
          commentCount: Number(v.statistics?.commentCount ?? 0),
          lastSyncedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      })
    }
  }
}

async function syncVideoComments(
  yt: Awaited<ReturnType<typeof getAuthenticatedYouTube>>,
  videoId: string,
  db: ReturnType<typeof useDb>,
  ownerChannelId: string,
): Promise<{ found: number; newCount: number; quotaUsed: number }> {
  let found = 0
  let newCount = 0
  let quotaUsed = 0
  let pageToken: string | undefined = pageTokenCache.get(videoId)

  try {
    const res = await yt.commentThreads.list({
      part: ['snippet', 'replies'],
      videoId,
      order: 'time',
      maxResults: 100,
      ...(pageToken ? { pageToken } : {}),
    })
    quotaUsed++

    for (const thread of res.data.items ?? []) {
      const top = thread.snippet?.topLevelComment
      if (!top?.id || !top.snippet) continue

      found++
      const lang = detectLanguage(top.snippet.textDisplay ?? '')

      // Check if owner has already replied in this thread
      const threadReplies = thread.replies?.comments ?? []
      const ownerAlreadyReplied = threadReplies.some((r) => {
        const authorId = (r.snippet?.authorChannelId as unknown as { value?: string } | null)?.value
        return authorId === ownerChannelId
      })

      const isNew = await upsertComment(db, {
        id: top.id,
        videoId,
        parentId: null,
        authorName: top.snippet.authorDisplayName ?? 'Unknown',
        authorChannelId: (top.snippet.authorChannelId as unknown as { value?: string } | null)?.value ?? null,
        text: top.snippet.textDisplay ?? '',
        textOriginal: top.snippet.textOriginal ?? null,
        likeCount: top.snippet.likeCount ?? 0,
        detectedLang: lang.lang,
        langConfidence: lang.confidence,
        publishedAt: top.snippet.publishedAt ?? new Date().toISOString(),
        updatedAt: top.snippet.updatedAt ?? new Date().toISOString(),
        ownerAlreadyReplied,
      })
      if (isNew) newCount++

      // Sync replies in thread
      for (const reply of threadReplies) {
        if (!reply.id || !reply.snippet) continue
        found++
        const replyLang = detectLanguage(reply.snippet.textDisplay ?? '')
        const replyIsNew = await upsertComment(db, {
          id: reply.id,
          videoId,
          parentId: top.id,
          authorName: reply.snippet.authorDisplayName ?? 'Unknown',
          authorChannelId: (reply.snippet.authorChannelId as unknown as { value?: string } | null)?.value ?? null,
          text: reply.snippet.textDisplay ?? '',
          textOriginal: reply.snippet.textOriginal ?? null,
          likeCount: reply.snippet.likeCount ?? 0,
          detectedLang: replyLang.lang,
          langConfidence: replyLang.confidence,
          publishedAt: reply.snippet.publishedAt ?? new Date().toISOString(),
          updatedAt: reply.snippet.updatedAt ?? new Date().toISOString(),
          ownerAlreadyReplied: false,
        })
        if (replyIsNew) newCount++
      }
    }

    // Cache nextPageToken for next sync cycle
    if (res.data.nextPageToken) {
      pageTokenCache.set(videoId, res.data.nextPageToken)
    }
    else {
      pageTokenCache.delete(videoId) // All caught up
    }
  }
  catch (err: unknown) {
    const message = (err as { message?: string })?.message ?? ''
    // Quota exceeded — re-throw to abort the entire sync immediately
    if (message.toLowerCase().includes('quota')) {
      throw err
    }
    if (!message.includes('disabled')) {
      await logger.warn('comment-sync', `Failed to sync comments for ${videoId}`, { message })
    }
  }

  return { found, newCount, quotaUsed }
}

type CommentInsert = {
  id: string
  videoId: string
  parentId: string | null
  authorName: string
  authorChannelId: string | null
  text: string
  textOriginal: string | null
  likeCount: number
  detectedLang: string
  langConfidence: number
  publishedAt: string
  updatedAt: string
  ownerAlreadyReplied: boolean
}

async function upsertComment(db: ReturnType<typeof useDb>, data: CommentInsert): Promise<boolean> {
  const existing = await db.query.comments.findFirst({
    where: eq(comments.id, data.id),
    columns: { id: true, updatedAt: true, status: true },
  })

  if (!existing) {
    let status: 'pending' | 'published' | 'skipped' = 'pending'
    if (data.parentId) status = 'skipped'
    else if (data.ownerAlreadyReplied) status = 'published'

    await db.insert(comments).values({
      id: data.id,
      videoId: data.videoId,
      parentId: data.parentId,
      authorName: data.authorName,
      authorChannelId: data.authorChannelId,
      text: data.text,
      textOriginal: data.textOriginal,
      likeCount: data.likeCount,
      detectedLang: data.detectedLang,
      langConfidence: data.langConfidence,
      publishedAt: data.publishedAt,
      updatedAt: data.updatedAt,
      status,
    })
    return true
  }

  // Mark as published if owner replied externally and comment isn't already handled
  if (data.ownerAlreadyReplied && existing.status !== 'published') {
    await db.update(comments)
      .set({ status: 'published', processedAt: new Date().toISOString() })
      .where(eq(comments.id, data.id))
  }
  // Update if text changed (comment was edited)
  else if (existing.updatedAt !== data.updatedAt) {
    await db.update(comments)
      .set({ text: data.text, updatedAt: data.updatedAt, likeCount: data.likeCount })
      .where(eq(comments.id, data.id))
  }

  return false
}
