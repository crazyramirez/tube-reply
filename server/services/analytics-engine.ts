import { eq, and, desc, count, countDistinct, sum, avg, isNull, gte, sql, ne, inArray } from 'drizzle-orm'

import { useDb } from '../utils/db'
import { comments, publishedReplies, videos, authors } from '../db/schema'
import { generateUnified } from '../utils/ai'


let aiTopicsCache: { data: any; expiresAt: number } | null = null


// ─── Sentiment mapping from intent ───────────────────────────────────────────

function intentToSentiment(intent: string | null): 'positive' | 'neutral' | 'negative' | 'curious' {
  if (intent === 'compliment' || intent === 'video_request') return 'positive'
  if (intent === 'complaint') return 'negative'
  if (intent === 'question' || intent === 'help_needed') return 'curious'
  return 'neutral'
}


// ─── Overview ────────────────────────────────────────────────────────────────

export async function getAnalyticsOverview() {
  const db = useDb()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Get owner channel ID to detect manual replies
  const ownerToken = await db.query.oauthTokens.findFirst()
  const ownerChannelId = ownerToken?.channelId

  const [allTopLevel, repliedTopLevel, recentComments, recentPublished] = await Promise.all([
    // total top-level comments
    db.select({ total: count(comments.id) }).from(comments).where(isNull(comments.parentId)),

    // top-level comments that have at least one reply from the owner
    db.select({ total: countDistinct(comments.parentId) })
      .from(comments)
      .where(
        and(
          ne(comments.parentId, ''),
          ownerChannelId ? eq(comments.authorChannelId, ownerChannelId) : sql`0=1`
        )
      ),

    // recent comments for sentiment
    db.select({ 
      detectedIntent: comments.detectedIntent, 
      detectedLang: comments.detectedLang,
      publishedAt: comments.publishedAt
    })
      .from(comments)
      .where(and(isNull(comments.parentId), sql`${comments.publishedAt} >= ${thirtyDaysAgo}`)),

    // recent published replies for avg response time
    db.select({
      publishedAt: publishedReplies.publishedAt,
      commentId: publishedReplies.commentId,
    })
      .from(publishedReplies)
      .where(sql`${publishedReplies.publishedAt} >= ${thirtyDaysAgo}`)
      .limit(200),
  ])

  console.log(`[analytics] Overview: totalTop=${allTopLevel[0].total}, recentComments=${recentComments.length}`)
  if (recentComments.length > 0) {
    console.log(`[analytics] Sample recent comment:`, JSON.stringify(recentComments[0]))
  }

  const totalTop = allTopLevel[0].total
  const repliedCount = repliedTopLevel[0].total ?? 0
  const replyRate = totalTop > 0
    ? Math.round((repliedCount / totalTop) * 100)
    : 0


  // Sentiment breakdown
  let positive = 0, neutral = 0, negative = 0, curious = 0
  const langCount: Record<string, number> = {}
  for (const c of recentComments) {
    const s = intentToSentiment(c.detectedIntent)
    if (s === 'positive') positive++
    else if (s === 'negative') negative++
    else if (s === 'curious') curious++
    else neutral++
    if (c.detectedLang && c.detectedLang !== 'und' && c.detectedLang !== 'null') langCount[c.detectedLang] = (langCount[c.detectedLang] ?? 0) + 1
  }
  const total = recentComments.length || 1

  // Return commenter rate
  const returnCommenters = await db
    .select({ total: count(comments.id) })
    .from(comments)
    .where(and(isNull(comments.parentId), eq(comments.isReturnCommenter, true)))

  const returnRate = allTopLevel[0].total > 0
    ? Math.round((returnCommenters[0].total / allTopLevel[0].total) * 100)
    : 0

  return {
    replyRate,
    avgResponseTimeHours: null, // requires comment publishedAt + reply publishedAt join
    returnCommenterRate: returnRate,
    totalCommentsLast30Days: recentComments.length,
    sentiment: {
      positive: Math.round((positive / total) * 100),
      curious: Math.round((curious / total) * 100),
      neutral: Math.round((neutral / total) * 100),
      negative: Math.round((negative / total) * 100),
    },
    languageDistribution: langCount,
  }

}

// ─── Sentiment Trend (last 4 weeks, by week) ─────────────────────────────────

export async function getSentimentTrend() {
  const db = useDb()
  const weeks: Array<{ date: string; positive: number; neutral: number; negative: number; curious: number; total: number }> = []

  for (let i = 3; i >= 0; i--) {
    const weekStart = new Date(Date.now() - (i + 1) * 7 * 24 * 60 * 60 * 1000).toISOString()
    const weekEnd   = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000).toISOString()

    const rows = await db
      .select({ detectedIntent: comments.detectedIntent })
      .from(comments)
      .where(
        and(
          isNull(comments.parentId),
          sql`${comments.publishedAt} >= ${weekStart}`,
          sql`${comments.publishedAt} < ${weekEnd}`,
        )
      )

    let pos = 0, neu = 0, neg = 0, cur = 0
    for (const r of rows) {
      const s = intentToSentiment(r.detectedIntent)
      if (s === 'positive') pos++
      else if (s === 'negative') neg++
      else if (s === 'curious') cur++
      else neu++
    }

    weeks.push({
      date: weekStart.slice(0, 10),
      positive: pos,
      neutral: neu,
      negative: neg,
      curious: cur,
      total: rows.length,
    })
  }

  return weeks
}


// ─── Top Topics (frequent keywords in question-intent comments) ───────────────

export async function getTopTopics(limit = 15, event?: any) {

  const db = useDb()
  
  // Return cache if valid
  if (aiTopicsCache && aiTopicsCache.expiresAt > Date.now()) {
    return (aiTopicsCache.data as any[]).slice(0, 4)
  }


  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const questionComments = await db
    .select({ text: comments.text, likeCount: comments.likeCount })
    .from(comments)
    .where(
      and(
        isNull(comments.parentId),
        eq(comments.detectedIntent, 'question'),
        sql`${comments.publishedAt} >= ${ninetyDaysAgo}`,
      )
    )
    .orderBy(desc(comments.publishedAt))
    .limit(50)

  if (questionComments.length < 5) {
    return []
  }

  const prompt = `You are a YouTube growth strategist. I will give you a list of recent questions from my audience.
Your task is to identify exactly 4 recurring themes or "Video Ideas" that I should create to help my community. Focus on the most important ones.

Group similar questions into clusters. For each cluster, provide:

1. A concise "Topic" title (2-4 words, e.g. "Sizing Guide", "Wool Maintenance")
2. A list of exact sample comments that fall into this category.
3. The total number of likes these comments received combined.

Comments:
${questionComments.map((c, i) => {
  // Sanitize comment text to avoid JSON confusion
  const cleanText = c.text
    .replace(/"/g, "'")           // Replace double quotes with single
    .replace(/\\/g, "/")          // Replace backslashes with forward slashes
    .replace(/\n/g, ' ')          // Remove newlines
    .slice(0, 150)                // Limit length
  return `${i + 1}. [Likes: ${c.likeCount}] ${cleanText}`
}).join('\n')}

Return ONLY a valid JSON object. Do not include any markdown formatting, backticks, or extra text.
Schema:
{ "topics": [{ "topic": string, "count": number, "totalLikes": number, "exampleComments": string[] }] }

Rules:
- THE OBJECT MUST CONTAIN A "topics" ARRAY WITH EXACTLY 4 ITEMS.
- Sort by totalLikes descending.
- Limit "exampleComments" to a maximum of 3 representative samples per topic.
- IMPORTANT: Use double quotes for keys and strings. Escape any internal double quotes with a backslash.
- Ensure the final output is a single valid JSON object.`


  try {
    const { text } = await generateUnified(prompt, 2, event)
    const rawData = JSON.parse(text)
    let data = Array.isArray(rawData) ? rawData : (rawData.topics || [])
    
    // Force exactly 4
    if (Array.isArray(data)) {
      data = data.slice(0, 4)
    }

    
    // Cache for 1 hour
    aiTopicsCache = {
      data,
      expiresAt: Date.now() + 60 * 60 * 1000
    }
    
    return data
  } catch (err) {
    console.error('[analytics] Failed to generate AI topics:', err)
    return [] // Fallback to empty
  }
}


// ─── Audience Intelligence ────────────────────────────────────────────────────

export async function getAudienceStats() {
  const db = useDb()

  // 1. First, find the most active author channel IDs
  const activeIds = await db
    .select({ authorChannelId: comments.authorChannelId })
    .from(comments)
    .where(and(
      isNull(comments.parentId), 
      sql`${comments.authorChannelId} IS NOT NULL`, 
      ne(comments.authorChannelId, '')
    ))
    .groupBy(comments.authorChannelId)
    .orderBy(desc(count(comments.id)))
    .limit(10)

  if (activeIds.length === 0) {
    return { superfans: [], languageDistribution: [] }
  }

  const ids = activeIds.map(f => f.authorChannelId!)

  // 2. Fetch full stats for these specific authors, JOINING with the authors table for profile info
  const superfans = await db
    .select({
      authorName: sql<string>`COALESCE(${authors.name}, MAX(${comments.authorName}))`,
      authorChannelId: comments.authorChannelId,
      authorProfileImageUrl: sql<string>`COALESCE(${authors.profileImageUrl}, MAX(${comments.authorProfileImageUrl}))`,
      commentCount: sql<number>`SUM(CASE WHEN ${comments.parentId} IS NULL THEN 1 ELSE 0 END)`,
      totalLikes: sum(comments.likeCount),
      firstSeenAt: sql<string>`MIN(${comments.publishedAt})`,
      lastSeenAt: sql<string>`MAX(${comments.publishedAt})`,
    })
    .from(comments)
    .leftJoin(authors, eq(comments.authorChannelId, authors.channelId))
    .where(inArray(comments.authorChannelId, ids))
    .groupBy(comments.authorChannelId)
    .orderBy(desc(sql`SUM(CASE WHEN ${comments.parentId} IS NULL THEN 1 ELSE 0 END)`))


  // Language distribution
  const langDist = await db
    .select({
      lang: comments.detectedLang,
      total: count(comments.id),
    })
    .from(comments)
    .where(and(isNull(comments.parentId), sql`${comments.detectedLang} IS NOT NULL`, ne(comments.detectedLang, ''), ne(comments.detectedLang, 'und'), ne(comments.detectedLang, 'null')))
    .groupBy(comments.detectedLang)
    .orderBy(desc(count(comments.id)))
    .limit(10)

  console.log(`[analytics] Audience: fans=${superfans.length}, langs=${langDist.length}`)
  const withImage = superfans.filter(s => s.authorProfileImageUrl).length
  console.log(`[analytics] Superfans with image: ${withImage}/${superfans.length}`)
  
  return {
    superfans: superfans.map(s => ({
      authorName: s.authorName,
      authorChannelId: s.authorChannelId,
      authorProfileImageUrl: s.authorProfileImageUrl || null,
      commentCount: Number(s.commentCount || 0),
      totalLikes: Number(s.totalLikes ?? 0),
      firstSeenAt: s.firstSeenAt,
      lastSeenAt: s.lastSeenAt,
    })),

    languageDistribution: langDist
      .filter(l => l.lang)
      .map(l => ({ lang: l.lang!, count: l.total })),
  }
}

// ─── Video Performance from Comments ─────────────────────────────────────────

export async function getVideoCommentStats(limit = 8) {
  const db = useDb()

  const rows = await db
    .select({
      videoId: comments.videoId,
      videoTitle: videos.title,
      thumbnailUrl: videos.thumbnailUrl,
      viewCount: videos.viewCount,
      likeCount: videos.likeCount,
      total: count(comments.id),

      pending: sql<number>`sum(case when ${comments.status} = 'pending' then 1 else 0 end)`,
      published: sql<number>`sum(case when ${comments.status} = 'published' then 1 else 0 end)`,
      negative: sql<number>`sum(case when ${comments.detectedIntent} = 'complaint' then 1 else 0 end)`,
      questions: sql<number>`sum(case when ${comments.detectedIntent} = 'question' then 1 else 0 end)`,

    })
    .from(comments)
    .leftJoin(videos, eq(comments.videoId, videos.id))
    .where(isNull(comments.parentId))
    .groupBy(comments.videoId)
    .orderBy(desc(count(comments.id)))
    .limit(limit)

  return rows.map(r => ({
    videoId: r.videoId,
    videoTitle: r.videoTitle ?? r.videoId,
    thumbnailUrl: r.thumbnailUrl,
    viewCount: r.viewCount ?? 0,
    likeCount: r.likeCount ?? 0,
    totalComments: r.total,
    pendingCount: Number(r.pending ?? 0),
    publishedCount: Number(r.published ?? 0),
    negativeCount: Number(r.negative ?? 0),
    questionCount: Number(r.questions ?? 0),
  }))
}
