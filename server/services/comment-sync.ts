import { eq, and, desc, count, isNull, sql, inArray, ne } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { getAuthenticatedYouTube, refreshChannelMetadata } from '../utils/youtube'
import { logger } from '../utils/logger'
import { detectLanguage } from './language-detect'
import { videos, comments, syncLog, oauthTokens, authors } from '../db/schema'
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

    // Sync video list if needed (on manual or if DB is empty)
    const existingVideos = await db.query.videos.findMany({ columns: { id: true } })
    if (syncType === 'manual' || existingVideos.length === 0) {
      await syncVideoList(yt, db)
      totalQuota += 2
    }

    const ownerChannelId = token.channelId

    // Optimization: for scheduled/recent syncs, use the channel-wide comment threads list
    // This is much more efficient than iterating through 3000+ videos
    if (scope === 'recent' || (syncType === 'scheduled' && scope !== 'all')) {
      await logger.info('comment-sync', 'Starting optimized channel-wide sync')
      const { found, newCount, quotaUsed, videosInvolved } = await syncChannelComments(yt, db, ownerChannelId)
      totalFound = found
      totalNew = newCount
      totalQuota += quotaUsed
      
      // Mark as completed
      if (logId) {
        await db.update(syncLog)
          .set({
            status: 'completed',
            videosProcessed: videosInvolved || 1, // Store the number of videos that had activity
            commentsFound: totalFound,
            newComments: totalNew,
            quotaUsed: totalQuota,
            completedAt: new Date().toISOString(),
          })
          .where(eq(syncLog.id, logId))
      }
      await logger.info('comment-sync', 'Optimized sync completed', { totalNew, totalQuota })

      // Score unscored comments (backfills historical data too)
      try {
        const { scoreAllComments } = await import('./comment-scorer')
        const scored = await scoreAllComments({ onlyUnscored: true })
        if (scored > 0) await logger.info('comment-sync', `Scored ${scored} comments`)

        const { runAutomationOnPending } = await import('./automation-engine')
        const triggered = await runAutomationOnPending()
        if (triggered > 0) await logger.info('comment-sync', `Automation ran on ${triggered} comments`)
      } catch (scoreErr) {
        await logger.warn('comment-sync', 'Scoring/automation failed (non-critical)', { error: (scoreErr as Error).message })
      }

      // AUTO-HEAL: Backfill missing author images from historical data
      try {
        const backfilled = await backfillMissingAvatars()
        if (backfilled > 0) await logger.info('comment-sync', `Auto-healed ${backfilled} missing author avatars`)
      } catch (healErr) {
        await logger.warn('comment-sync', 'Avatar backfill failed (non-critical)', { error: (healErr as Error).message })
      }
      return
    }

    // Fallback: per-video sync (only for 'all' scope or legacy reasons)
    const allVideos = await db.query.videos.findMany()
    const cutoff = new Date(Date.now() - RECENT_VIDEO_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const videosToSync = scope === 'all'
      ? allVideos
      : allVideos.filter(v => v.publishedAt >= cutoff)

    await logger.info('comment-sync', `Syncing ${videosToSync.length} videos (type: ${syncType}, scope: ${scope})`)

    for (const video of videosToSync) {
      if (totalQuota >= remaining - 10) {
        await logger.warn('comment-sync', 'Approaching quota limit, stopping sync', { totalQuota, remaining })
        break
      }

      const { found, newCount, quotaUsed } = await syncVideoComments(yt, video.id, db, ownerChannelId)
      totalFound += found
      totalNew += newCount
      totalQuota += quotaUsed
      videosProcessed++

      if (logId && videosProcessed % 10 === 0) {
        await db.update(syncLog)
          .set({ videosProcessed, commentsFound: totalFound, newComments: totalNew, quotaUsed: totalQuota })
          .where(eq(syncLog.id, logId))
      }
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

    await logger.info('comment-sync', 'Full sync completed', { totalNew, totalQuota, videosProcessed })

    // Score unscored comments (backfills historical data too)
    try {
      const { scoreAllComments } = await import('./comment-scorer')
      const scored = await scoreAllComments({ onlyUnscored: true })
      if (scored > 0) await logger.info('comment-sync', `Scored ${scored} comments`)

      const { runAutomationOnPending } = await import('./automation-engine')
      const triggered = await runAutomationOnPending()
      if (triggered > 0) await logger.info('comment-sync', `Automation ran on ${triggered} comments`)
    } catch (scoreErr) {
      await logger.warn('comment-sync', 'Scoring/automation failed (non-critical)', { error: (scoreErr as Error).message })
    }

    // AUTO-HEAL: Backfill missing author images from historical data
    try {
      // 1. First ensure authors table is populated from comments
      await backfillAuthorsTable()
      // 2. Then heal the comments table using the authors table
      const backfilled = await backfillMissingAvatars()
      if (backfilled > 0) await logger.info('comment-sync', `Auto-healed ${backfilled} missing author avatars`)
    } catch (healErr) {
      await logger.warn('comment-sync', 'Avatar backfill failed (non-critical)', { error: (healErr as Error).message })
    }
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

async function syncChannelComments(
  yt: Awaited<ReturnType<typeof getAuthenticatedYouTube>>,
  db: ReturnType<typeof useDb>,
  ownerChannelId: string,
): Promise<{ found: number; newCount: number; quotaUsed: number }> {
  let found = 0
  let newCount = 0
  let quotaUsed = 0
  let pageToken: string | undefined
  let stopCondition = false
  let consecutiveExisting = 0
  const videosInvolved = new Set<string>()
  const MAX_CONSECUTIVE_EXISTING = 5 // Stop after finding 5 existing comments in a row (time ordered)

  const updatedAuthors = new Set<string>()
  try {
    do {
      const res = await yt.commentThreads.list({
        part: ['snippet', 'replies'],
        allThreadsRelatedToChannelId: ownerChannelId,
        order: 'time',
        maxResults: 100,
        ...(pageToken ? { pageToken } : {}),
      })
      quotaUsed++

      const items = res.data.items ?? []
      if (items.length === 0) break

      for (const thread of items) {
        const top = thread.snippet?.topLevelComment
        const videoId = thread.snippet?.videoId
        if (!top?.id || !top.snippet || !videoId) continue

        // Ensure video exists in our DB (foreign key requirement)
        await ensureVideoExists(yt, db, videoId)
        videosInvolved.add(videoId)

        found++
        const lang = detectLanguage(top.snippet.textDisplay ?? '')

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
          authorProfileImageUrl: top.snippet.authorProfileImageUrl ?? null,
          text: top.snippet.textDisplay ?? '',
          textOriginal: top.snippet.textOriginal ?? null,

          likeCount: top.snippet.likeCount ?? 0,
          detectedLang: lang.lang,
          langConfidence: lang.confidence,
          publishedAt: top.snippet.publishedAt ?? new Date().toISOString(),
          updatedAt: top.snippet.updatedAt ?? new Date().toISOString(),
          ownerAlreadyReplied,
        }, updatedAuthors)

        if (!top.snippet.authorProfileImageUrl) {
           await logger.warn('comment-sync', `Missing avatar for user ${top.snippet.authorDisplayName}`, { channelId: (top.snippet.authorChannelId as any)?.value })
        }

        if (isNew) {
          newCount++
          consecutiveExisting = 0
        } else {
          consecutiveExisting++
        }

        // Process replies
        for (const reply of threadReplies) {
          if (!reply.id || !reply.snippet) continue
          found++
          const replyLang = detectLanguage(reply.snippet.textDisplay ?? '')
          const authorId = (reply.snippet?.authorChannelId as unknown as { value?: string } | null)?.value ?? null
          const isOwnerReply = authorId === ownerChannelId

          const replyIsNew = await upsertComment(db, {
            id: reply.id,
            videoId,
            parentId: top.id,
            authorName: reply.snippet.authorDisplayName ?? 'Unknown',
            authorChannelId: authorId,
            authorProfileImageUrl: reply.snippet.authorProfileImageUrl ?? null,
            text: reply.snippet.textDisplay ?? '',
            textOriginal: reply.snippet.textOriginal ?? null,

            likeCount: reply.snippet.likeCount ?? 0,
            detectedLang: replyLang.lang,
            langConfidence: replyLang.confidence,
            publishedAt: reply.snippet.publishedAt ?? new Date().toISOString(),
            updatedAt: reply.snippet.updatedAt ?? new Date().toISOString(),
            ownerAlreadyReplied: false,
          }, updatedAuthors)

          if (replyIsNew) {
            newCount++
          }

          // ROBUST REOPEN LOGIC: 
          // If this is a reply from a user (not the owner) AND it was published AFTER 
          // we last processed this thread (or if it's a brand new reply to a finished thread),
          // we must reopen the thread.
          if (!isOwnerReply) {
            const parent = await db.query.comments.findFirst({
              where: eq(comments.id, top.id),
              columns: { status: true, processedAt: true }
            })
            
            if (parent && (parent.status === 'published' || parent.status === 'dismissed' || parent.status === 'skipped')) {
              const lastProcessed = parent.processedAt ? new Date(parent.processedAt).getTime() : 0
              const replyTime = new Date(reply.snippet.publishedAt || 0).getTime()
              
              if (replyTime > lastProcessed) {
                await db.update(comments)
                  .set({ 
                    status: 'pending', 
                    updatedAt: new Date().toISOString(),
                    processedAt: null 
                  })
                  .where(eq(comments.id, top.id))
                await logger.info('comment-sync', `Reopened thread ${top.id} due to activity from ${reply.snippet.authorDisplayName} after last processing`)
              }
            }
          }
        }

        if (consecutiveExisting >= MAX_CONSECUTIVE_EXISTING) {
          stopCondition = true
          break
        }
      }

      pageToken = res.data.nextPageToken ?? undefined
      
      // Quota safety: don't loop forever in case of very active channel
      if (quotaUsed > 50) break

    } while (pageToken && !stopCondition)
  } catch (err: any) {
    const message = err?.message ?? ''
    if (message.toLowerCase().includes('quota')) throw err
    await logger.warn('comment-sync', `Global sync error: ${message}`)
  }

  return { found, newCount, quotaUsed, videosInvolved: videosInvolved.size }
}

async function ensureVideoExists(
  yt: Awaited<ReturnType<typeof getAuthenticatedYouTube>>,
  db: ReturnType<typeof useDb>,
  videoId: string
) {
  const existing = await db.query.videos.findFirst({
    where: eq(videos.id, videoId),
    columns: { id: true }
  })
  
  if (existing) return

  try {
    const res = await yt.videos.list({
      part: ['snippet', 'statistics', 'contentDetails'],
      id: [videoId]
    })
    
    const v = res.data.items?.[0]
    if (!v || !v.id || !v.snippet) return

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
      likeCount: Number(v.statistics?.likeCount ?? 0),
      commentCount: Number(v.statistics?.commentCount ?? 0),

      lastSyncedAt: new Date().toISOString(),
    })
  } catch (err) {
    await logger.warn('comment-sync', `Failed to fetch missing video ${videoId}`)
  }
}


async function syncVideoList(
  yt: Awaited<ReturnType<typeof getAuthenticatedYouTube>>,
  db: ReturnType<typeof useDb>,
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
        likeCount: Number(v.statistics?.likeCount ?? 0),
        commentCount: Number(v.statistics?.commentCount ?? 0),

        lastSyncedAt: new Date().toISOString(),
      }).onConflictDoUpdate({
        target: videos.id,
        set: {
          title: v.snippet.title ?? '',
          viewCount: Number(v.statistics?.viewCount ?? 0),
          likeCount: Number(v.statistics?.likeCount ?? 0),
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

  const updatedAuthors = new Set<string>()
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
        authorProfileImageUrl: top.snippet.authorProfileImageUrl ?? null,
        text: top.snippet.textDisplay ?? '',
        textOriginal: top.snippet.textOriginal ?? null,

        likeCount: top.snippet.likeCount ?? 0,
        detectedLang: lang.lang,
        langConfidence: lang.confidence,
        publishedAt: top.snippet.publishedAt ?? new Date().toISOString(),
        updatedAt: top.snippet.updatedAt ?? new Date().toISOString(),
        ownerAlreadyReplied,
      }, updatedAuthors)
      if (isNew) newCount++

      // Sync replies in thread
      for (const reply of threadReplies) {
        if (!reply.id || !reply.snippet) continue
        found++
        const replyLang = detectLanguage(reply.snippet.textDisplay ?? '')
        const authorId = (reply.snippet?.authorChannelId as unknown as { value?: string } | null)?.value ?? null
        const isOwnerReply = authorId === ownerChannelId

        const replyIsNew = await upsertComment(db, {
          id: reply.id,
          videoId,
          parentId: top.id,
          authorName: reply.snippet.authorDisplayName ?? 'Unknown',
          authorChannelId: authorId,
          authorProfileImageUrl: reply.snippet.authorProfileImageUrl ?? null,
          text: reply.snippet.textDisplay ?? '',
          textOriginal: reply.snippet.textOriginal ?? null,

          likeCount: reply.snippet.likeCount ?? 0,
          detectedLang: replyLang.lang,
          langConfidence: replyLang.confidence,
          publishedAt: reply.snippet.publishedAt ?? new Date().toISOString(),
          updatedAt: reply.snippet.updatedAt ?? new Date().toISOString(),
          ownerAlreadyReplied: false,
        }, updatedAuthors)
        
        if (replyIsNew) {
          newCount++
        }

        if (!isOwnerReply) {
          const parent = await db.query.comments.findFirst({
            where: eq(comments.id, top.id),
            columns: { status: true, processedAt: true }
          })
          if (parent && (parent.status === 'published' || parent.status === 'dismissed' || parent.status === 'skipped')) {
            const lastProcessed = parent.processedAt ? new Date(parent.processedAt).getTime() : 0
            const replyTime = new Date(reply.snippet.publishedAt || 0).getTime()
            
            if (replyTime > lastProcessed) {
              await db.update(comments)
                .set({ status: 'pending', updatedAt: new Date().toISOString(), processedAt: null })
                .where(eq(comments.id, top.id))
            }
          }
        }
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
  authorProfileImageUrl: string | null
  text: string

  textOriginal: string | null
  likeCount: number
  detectedLang: string
  langConfidence: number
  publishedAt: string
  updatedAt: string
  ownerAlreadyReplied: boolean
}

async function upsertComment(
  db: ReturnType<typeof useDb>, 
  data: CommentInsert, 
  updatedAuthors?: Set<string>
): Promise<boolean> {
  const existing = await db.query.comments.findFirst({
    where: eq(comments.id, data.id),
    columns: { id: true, updatedAt: true, status: true, authorProfileImageUrl: true, authorChannelId: true },
  })

  // SMART SYNC: Always update/insert the authors table
  if (data.authorChannelId) {
    await db.insert(authors).values({
      channelId: data.authorChannelId,
      name: data.authorName,
      profileImageUrl: data.authorProfileImageUrl,
      lastSeenAt: data.publishedAt,
    }).onConflictDoUpdate({
      target: authors.channelId,
      set: {
        name: data.authorName,
        profileImageUrl: data.authorProfileImageUrl || sql`profile_image_url`, // Don't overwrite with null if we have one
        lastSeenAt: data.publishedAt,
        updatedAt: new Date().toISOString(),
      }
    })
  }

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
      authorProfileImageUrl: data.authorProfileImageUrl,
      text: data.text,

      textOriginal: data.textOriginal,
      likeCount: data.likeCount,
      detectedLang: data.detectedLang,
      langConfidence: data.langConfidence,
      publishedAt: data.publishedAt,
      updatedAt: data.updatedAt,
      status,
      // Default activity to self for new threads
      lastActivityAt: data.parentId ? null : data.publishedAt,
      lastActivityText: data.parentId ? null : data.text,
      lastActivityAuthor: data.parentId ? null : data.authorName,
    })

    // Propagate image to old comments if this is a new author seen in this sync
    if (data.authorChannelId && data.authorProfileImageUrl && updatedAuthors && !updatedAuthors.has(data.authorChannelId)) {
      const updatedCount = await db.update(comments)
        .set({ authorProfileImageUrl: data.authorProfileImageUrl })
        .where(eq(comments.authorChannelId, data.authorChannelId))
      
      updatedAuthors.add(data.authorChannelId)
      if (updatedCount > 1) {
         console.log(`[comment-sync] Propagated image for author ${data.authorName} (${data.authorChannelId}) to ${updatedCount} comments`)
      }
    }

    // If it's a reply, update the parent's activity metadata
    if (data.parentId) {
      await db.update(comments)
        .set({
          lastActivityAt: data.publishedAt,
          lastActivityText: data.text,
          lastActivityAuthor: data.authorName,
          updatedAt: new Date().toISOString()
        })
        .where(eq(comments.id, data.parentId))
    }

    return true
  }

  // Mark as published if owner replied externally and comment isn't already handled
  if (data.ownerAlreadyReplied && existing.status !== 'published') {
    await db.update(comments)
      .set({ 
        status: 'published', 
        processedAt: new Date().toISOString(),
        authorProfileImageUrl: data.authorProfileImageUrl // Backfill
      })
      .where(eq(comments.id, data.id))
  }
  // Update if text changed (comment was edited)
  else if (existing.updatedAt !== data.updatedAt) {
    await db.update(comments)
      .set({ 
        text: data.text, 
        updatedAt: data.updatedAt, 
        likeCount: data.likeCount,
        authorProfileImageUrl: data.authorProfileImageUrl 
      })
      .where(eq(comments.id, data.id))
  }

  // Proactive image update: If we have a channelId and an image, 
  // and we haven't updated this author yet in this sync run, propagate it.
  if (data.authorChannelId && data.authorProfileImageUrl && updatedAuthors && !updatedAuthors.has(data.authorChannelId)) {
     // Check if it's actually different or missing from THIS comment to decide if we bother
     if (existing.authorProfileImageUrl !== data.authorProfileImageUrl) {
        const updatedCount = await db.update(comments)
          .set({ authorProfileImageUrl: data.authorProfileImageUrl })
          .where(eq(comments.authorChannelId, data.authorChannelId))
        
        updatedAuthors.add(data.authorChannelId)
        if (updatedCount > 0) {
           console.log(`[comment-sync] Updated/Propagated image for existing author ${data.authorName} (${data.authorChannelId}) to ${updatedCount} comments`)
        }
     }
  }

  return false
}

/**
 * AUTO-HEAL: Finds authors who are missing a profile image URL in some comments
 * but have it in others, and propagates the valid URL to all their comments.
 */
export async function backfillMissingAvatars(): Promise<number> {
  const db = useDb()
  
  // This SQL query finds authors with at least one comment with a valid image
  // and updates all their other comments that are missing it.
  const result = await db.run(sql`
    UPDATE comments 
    SET author_profile_image_url = (
      SELECT author_profile_image_url 
      FROM comments c2 
      WHERE c2.author_channel_id = comments.author_channel_id 
        AND c2.author_profile_image_url IS NOT NULL 
        AND c2.author_profile_image_url != '' 
      LIMIT 1
    )
    WHERE (author_profile_image_url IS NULL OR author_profile_image_url = '')
      AND author_channel_id IS NOT NULL
      AND author_channel_id != ''
      AND EXISTS (
        SELECT 1 FROM comments c3 
        WHERE c3.author_channel_id = comments.author_channel_id 
          AND c3.author_profile_image_url IS NOT NULL 
          AND c3.author_profile_image_url != ''
      )
  `)

  return result.rowsAffected || 0
}

/**
 * One-time/Continuous backfill to populate the 'authors' table from existing 'comments'.
 */
export async function backfillAuthorsTable(): Promise<number> {
  const db = useDb()
  
  // Find unique authors in comments and insert them into authors table
  const result = await db.run(sql`
    INSERT OR IGNORE INTO authors (channel_id, name, profile_image_url, last_seen_at)
    SELECT 
      author_channel_id, 
      MAX(author_name), 
      MAX(author_profile_image_url),
      MAX(published_at)
    FROM comments
    WHERE author_channel_id IS NOT NULL AND author_channel_id != ''
    GROUP BY author_channel_id
  `)

  // Also update images in authors table if we found better ones in comments
  await db.run(sql`
    UPDATE authors
    SET profile_image_url = (
      SELECT MAX(author_profile_image_url)
      FROM comments
      WHERE comments.author_channel_id = authors.channel_id
        AND author_profile_image_url IS NOT NULL
        AND author_profile_image_url != ''
    )
    WHERE (profile_image_url IS NULL OR profile_image_url = '')
  `)

  return result.rowsAffected || 0
}
