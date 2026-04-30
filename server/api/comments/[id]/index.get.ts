import { eq, and, isNotNull } from 'drizzle-orm'
import { useDb } from '../../../utils/db'
import { comments, videos, suggestedReplies, publishedReplies, bannedAuthors, oauthTokens, authors, videoTranscripts } from '../../../db/schema'
import { getUserLanguage, getUserLanguageCode } from '../../../utils/settings'
import { translateText } from '../../../utils/translate'
import { fetchAndCacheTranscript } from '../../../services/captions-service'
import { syncSingleThread } from '../../../services/comment-sync'

export default defineEventHandler(async (event) => {
  const db = useDb()
  const id = getRouterParam(event, 'id')!

  // On-demand sync with YouTube (Costs ~1-2 units)
  // Ensures consistency and latest state before serving the data
  await logger.info('api', `On-demand sync triggered for comment ${id}`)
  await syncSingleThread(id).catch((err) => {
    logger.error('api', `Sync failed for ${id}`, err)
  })

  const [comment] = await db
    .select({
      id: comments.id,
      videoId: comments.videoId,
      authorName: authors.name,
      authorChannelId: comments.authorChannelId,
      authorProfileImageUrl: authors.profileImageUrl,
      text: comments.text,
      publishedAt: comments.publishedAt,
      status: comments.status,
      detectedIntent: comments.detectedIntent,
      isReturnCommenter: comments.isReturnCommenter,
      detectedLang: comments.detectedLang,
      priorityScore: comments.priorityScore,
      priorityLabel: comments.priorityLabel,
      cachedTranslation: comments.translatedText,
      cachedTranslationLang: comments.translationLang,
      isLive: comments.isLive,
      updatedAt: comments.updatedAt,
    })
    .from(comments)
    .leftJoin(authors, eq(comments.authorChannelId, authors.channelId))
    .where(eq(comments.id, id))
    .limit(1)

  if (!comment) throw createError({ statusCode: 404, statusMessage: 'Comment not found' })

  const userLangCode = await getUserLanguageCode()
  const userLangName = await getUserLanguage()

  // Translate main comment if needed (with caching)
  let translatedText = comment.cachedTranslation
  if (comment.detectedLang && comment.detectedLang !== userLangCode) {
    if (!translatedText || comment.cachedTranslationLang !== userLangCode) {
      translatedText = await translateText(comment.text, userLangName)
      // Cache it
      await db.update(comments)
        .set({ translatedText, translationLang: userLangCode })
        .where(eq(comments.id, id))
    }
  } else {
    // If language is the same, do NOT provide a translation
    translatedText = null
  }

  const video = await db.query.videos.findFirst({
    where: eq(videos.id, comment.videoId),
  })

  // Fire-and-forget transcript pre-fetch: starts downloading in background
  // while the user reads the comment. Zero impact on page load time.
  // Skips if already cached (any row = ok/forbidden/no_captions/error).
  db.query.videoTranscripts.findFirst({ where: eq(videoTranscripts.videoId, comment.videoId), columns: { id: true } })
    .then(existing => { if (!existing) fetchAndCacheTranscript(comment.videoId).catch(() => {}) })
    .catch(() => {})

  // Thread replies
  const token = await db.query.oauthTokens.findFirst({ 
    columns: { 
      channelId: true,
      channelThumbnailUrl: true 
    } 
  })
  const ownerChannelId = token?.channelId
  const ownerThumbnail = token?.channelThumbnailUrl

  const replies = await db
    .select({
      id: comments.id,
      authorName: authors.name,
      authorChannelId: comments.authorChannelId,
      authorProfileImageUrl: authors.profileImageUrl,
      text: comments.text,
      publishedAt: comments.publishedAt,
      detectedLang: comments.detectedLang,
      cachedTranslation: comments.translatedText,
      cachedTranslationLang: comments.translationLang,
      updatedAt: comments.updatedAt,
    })
    .from(comments)
    .leftJoin(authors, eq(comments.authorChannelId, authors.channelId))
    .where(and(eq(comments.videoId, comment.videoId), isNotNull(comments.parentId), eq(comments.parentId, id)))
    .orderBy(comments.publishedAt)

  const enrichedReplies = replies.map(r => ({
    ...r,
    isOwner: ownerChannelId && r.authorChannelId === ownerChannelId
  }))

  const hasOwnerReplied = enrichedReplies.some(r => r.isOwner)

  // Suggestions for this comment
  const suggestions = await db.query.suggestedReplies.findMany({
    where: eq(suggestedReplies.commentId, id),
    orderBy: (s, { desc }) => [desc(s.generatedAt)],
  })

  // Published replies (our own responses)
  const published = await db.query.publishedReplies.findMany({
    where: eq(publishedReplies.commentId, id),
    orderBy: (pr, { asc }) => [asc(pr.publishedAt)],
  })

  // Unified Thread: YouTube replies + Our published replies (Deduplicated by YouTube ID)
  const threadMap = new Map<string, any>()
  
  // 1. Add YouTube replies
  enrichedReplies.forEach(r => threadMap.set(r.id, r))

  // 2. Add local published replies
  published.forEach(p => {
    const id = p.youtubeReplyId || `local-${p.id}`
    if (!threadMap.has(p.youtubeReplyId || '')) {
       threadMap.set(id, {
        id,
        authorName: 'You', 
        text: p.finalText,
        publishedAt: p.publishedAt,
        isOwner: true,
        isLocal: !p.youtubeReplyId,
        updatedAt: p.publishedAt // For local/published replies, we use publishedAt as updatedAt initially
      })
    }
  })

  const threadReplies = Array.from(threadMap.values())
    .sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime())

  // Translate thread replies in parallel (with caching)
  const threadWithTranslations = await Promise.all(threadReplies.map(async (r) => {
    if (r.isOwner) return r // Don't translate our own replies
    
    if (r.detectedLang && r.detectedLang === userLangCode) {
      return { ...r, translatedText: null } // Already in user language
    }
    
    // Check cache
    if (r.cachedTranslation && r.cachedTranslationLang === userLangCode) {
      return { ...r, translatedText: r.cachedTranslation }
    }

    // If not in cache or wrong lang, translate
    const translation = await translateText(r.text, userLangName)
    
    // Cache it
    if (translation) {
      await db.update(comments)
        .set({ translatedText: translation, translationLang: userLangCode })
        .where(eq(comments.id, r.id))
    }

    return { ...r, translatedText: translation }
  }))

  // Check if author is banned
  let isBanned = false
  if (comment.authorChannelId) {
    const ban = await db.query.bannedAuthors.findFirst({
      where: eq(bannedAuthors.channelId, comment.authorChannelId),
    })
    isBanned = !!ban
  }

  return {
    comment: {
      ...comment,
      isBanned,
      translatedText,
      status: (hasOwnerReplied && (comment.status === 'suggested' || comment.status === 'skipped')) ? 'published' : comment.status
    },
    video,
    replies: threadWithTranslations,
    suggestions: suggestions.map(s => ({
      ...s,
      contextUsed: s.contextUsed ? JSON.parse(s.contextUsed) : null,
      videoLinksUsed: s.videoLinksUsed ? JSON.parse(s.videoLinksUsed) : [],
    })),
    publishedReply: published[published.length - 1] ?? null,
    ownerThumbnail,
    ownerChannelId,
  }
})
