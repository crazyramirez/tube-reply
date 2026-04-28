import { eq, and, desc, isNotNull } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { comments, videos, videoSummaries, knowledgeBase } from '../db/schema'

export type CommentIntent =
  | 'video_request'
  | 'question'
  | 'help_needed'
  | 'complaint'
  | 'compliment'
  | 'general'

export interface CommentContext {
  comment: {
    id: string
    text: string
    authorName: string
    authorChannelId: string | null
    likeCount: number
    ageInDays: number
    publishedAt: string
    detectedLang: string
    langConfidence: number
    langOverride: string | null
    intent: CommentIntent
  }
  video: {
    id: string
    title: string
    descriptionExcerpt: string
    tags: string[]
    viewCount: number
    commentCount: number
  }
  videoSummary: string | null
  videoKeyTopics: string[]
  videoFaqs: Array<{ q: string; a: string }>
  existingReplies: Array<{ author: string; text: string }>
  knowledgeBaseEntries: Array<{ type: string; title: string; content: string; tags: string[] }>
  channelStyle: string | null
  recentVideos: Array<{ id: string; title: string; thumbnailUrl: string | null; isShort: boolean }>
  friendlyName: string | null
  additionalContext: string | null
}

export function isYouTubeShort(duration: string | null): boolean {
  if (!duration) return false
  if (duration.includes('H')) return false
  const match = duration.match(/PT(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return false
  const minutes = parseInt(match[1] || '0')
  const seconds = parseInt(match[2] || '0')
  return (minutes * 60) + seconds < 60
}

/**
 * Lightweight multilingual intent classifier.
 * Checks patterns in order of specificity — first match wins.
 */
export function detectIntent(text: string): CommentIntent {
  const t = text.toLowerCase()

  // video_request: explicit video/tutorial lookup in any language
  if (
    /(\?|donde|dónde|where|où|onde|wo|dove|где|اين|أين).{0,40}(video|vídeo|tutorial|link|url)/i.test(t)
    || /(video|vídeo|tutorial|link|url).{0,40}(\?|busco|find|cherch|buscar|where|donde)/i.test(t)
    || /(tienes|tiene|have you|avez|tem|haben).{0,30}(video|vídeo|tutorial)/i.test(t)
    || /\b(link del|link de|link to|url del|dame el|send me|pásame|share the)\b/.test(t)
  ) return 'video_request'

  // help_needed: urgency / assistance signals
  if (
    /\b(ayuda(me)?|help me|please help|por favor ayuda|need help|socorro|emergencia|urgente|urgent|asap)\b/i.test(t)
  ) return 'help_needed'

  // complaint: problem / error signals
  if (
    /\b(no funciona|doesn.t work|not working|error|wrong|incorrect|problema|problem|broken|fix|arregla|falla|crash|bug|issue)\b/i.test(t)
  ) return 'complaint'

  // question: explicit question mark OR starts with interrogative
  if (
    t.includes('?')
    || /^(how|what|when|where|why|can |could |do you|does |is there|have you|did |which |who )/i.test(t)
    || /^(como|cómo|qué|que |cuando|cuándo|dónde|donde|por qué|porqué|cuánto|cuanto|tienes|tienen|hay |puedes|puede|se puede)/i.test(t)
    || /^(comment|où |quand|quel|quelle|avez|est-ce)/i.test(t)
    || /^(onde|quando|como|qual|tem |você|voce|há )/i.test(t)
    || /^(где|как|когда|что|кто|есть ли|можно)/i.test(t)
    || /^(أين|كيف|متى|ماذا|هل )/i.test(t)
  ) return 'question'

  // compliment: positive appreciation without a question
  if (
    /\b(gracias|thank|excelente|amazing|love|encanta|incre[íi]ble|beautiful|wonderful|great|felicitaciones|congrats|bravo|genial|hermosa|hermoso|perfecto|perfect|adorable|bello|bella|chevere|chévere)\b/i.test(t)
    && !t.includes('?')
  ) return 'compliment'

  return 'general'
}

/**
 * Normalize text for scoring: NFD decompose, strip diacritics, lowercase, collapse punctuation.
 */
function normalizeForScoring(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ً-ٟ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extracts a likely first name from a YouTube handle or display name.
 */
function extractFriendlyName(name: string): string {
  if (!name) return ''
  
  // Remove @ handle prefix
  let clean = name.startsWith('@') ? name.substring(1) : name
  
  // Case 1: "John Doe" -> "John"
  if (clean.includes(' ')) {
    return clean.split(' ')[0]
  }
  
  // Case 2: "john_doe" or "john.doe" -> "john"
  const separators = ['_', '.', '-']
  for (const sep of separators) {
    if (clean.includes(sep)) {
      return clean.split(sep)[0]
    }
  }

  // Case 3: "JohnSanchez" (CamelCase) -> "John"
  const camelMatch = clean.match(/^([A-Z][a-z]+)/)
  if (camelMatch) return camelMatch[1]

  // Case 4: "anasanchez4431" -> we keep it as is and let AI decode it
  // or we could try to strip numbers at the end
  const noNumbers = clean.replace(/\d+$/, '')
  
  return noNumbers || clean
}

/**
 * Score a KB entry's relevance to the comment + video context.
 * Title hit = 3pts, tags hit = 2pts, content hit = 1pt (per matching word).
 * Phrase bonus for 2+ consecutive words matching in title/content.
 * Video tags add topical context.
 */
function scoreKbEntry(
  commentText: string,
  videoTags: string[],
  entry: { title: string; content: string; tags: string | null },
): number {
  const commentNorm = normalizeForScoring(commentText)
  const videoTagsNorm = normalizeForScoring(videoTags.join(' '))

  const commentWords = commentNorm.split(/\s+/).filter(w => w.length > 3)
  const videoTagWords = videoTagsNorm.split(/\s+/).filter(w => w.length > 2)

  const titleNorm = normalizeForScoring(entry.title)
  const contentNorm = normalizeForScoring(entry.content)
  const entryTagsRaw = entry.tags ? (JSON.parse(entry.tags) as string[]).join(' ') : ''
  const entryTagsNorm = normalizeForScoring(entryTagsRaw)

  let score = 0

  // Comment words vs KB entry
  for (const word of commentWords) {
    if (titleNorm.includes(word)) score += 3
    if (entryTagsNorm.includes(word)) score += 2
    if (contentNorm.includes(word)) score += 1
  }

  // Video tags vs KB entry (topical alignment)
  for (const word of videoTagWords) {
    if (titleNorm.includes(word)) score += 1
    if (entryTagsNorm.includes(word)) score += 1
  }

  // Phrase bonus: consecutive word pairs/triplets in title → more specific match
  if (commentWords.length >= 2) {
    for (let i = 0; i < commentWords.length - 1; i++) {
      const pair = `${commentWords[i]} ${commentWords[i + 1]}`
      if (titleNorm.includes(pair)) score += 4
      else if (contentNorm.includes(pair)) score += 2
      if (i < commentWords.length - 2) {
        const triple = `${commentWords[i]} ${commentWords[i + 1]} ${commentWords[i + 2]}`
        if (titleNorm.includes(triple)) score += 6
      }
    }
  }

  return score
}

const MAX_DESCRIPTION_CHARS = 2000
const MAX_KB_ENTRIES = 5
const MAX_KB_CONTENT_CHARS = 1000
const MAX_REPLIES = 5
const MAX_REPLY_CHARS = 200
const MAX_RECENT_VIDEOS = 10
const MAX_VIDEO_FAQS = 8

export async function buildContext(commentId: string, langOverride: string | null = null, additionalContext: string | null = null): Promise<CommentContext> {
  const db = useDb()

  const comment = await db.query.comments.findFirst({
    where: eq(comments.id, commentId),
  })
  if (!comment) throw new Error(`Comment not found: ${commentId}`)

  const video = await db.query.videos.findFirst({
    where: eq(videos.id, comment.videoId),
  })
  if (!video) throw new Error(`Video not found: ${comment.videoId}`)

  const summary = await db.query.videoSummaries.findFirst({
    where: eq(videoSummaries.videoId, video.id),
  })

  const existingReplies = await db.query.comments.findMany({
    where: and(
      eq(comments.videoId, video.id),
      isNotNull(comments.parentId),
      eq(comments.parentId, commentId),
    ),
    orderBy: [desc(comments.publishedAt)],
    limit: MAX_REPLIES,
    columns: { authorName: true, text: true },
  })

  const styleEntries = await db.query.knowledgeBase.findMany({
    where: and(
      eq(knowledgeBase.type, 'style'),
      eq(knowledgeBase.isActive, true),
    ),
    orderBy: [desc(knowledgeBase.priority)],
  })
  const mergedStyle = styleEntries.length
    ? styleEntries.map(e => `[${e.title}]\n${e.content}`).join('\n\n')
    : null

  const ruleEntries = await db.query.knowledgeBase.findMany({
    where: and(
      eq(knowledgeBase.type, 'rule'),
      eq(knowledgeBase.isActive, true),
    ),
    orderBy: [desc(knowledgeBase.priority)],
  })

  const allFaqInfo = await db.query.knowledgeBase.findMany({
    where: eq(knowledgeBase.isActive, true),
    orderBy: [desc(knowledgeBase.priority)],
  })

  const videoTags = video.tags ? (JSON.parse(video.tags) as string[]) : []

  // Score FAQ/info entries by relevance to comment + video context
  const scoredKb = allFaqInfo
    .filter(e => e.type === 'faq' || e.type === 'info')
    .map(e => ({ e, score: scoreKbEntry(comment.text ?? '', videoTags, e) }))
    .sort((a, b) => b.score - a.score || (b.e.priority ?? 0) - (a.e.priority ?? 0))
    .slice(0, MAX_KB_ENTRIES)
    .map(({ e }) => e)

  const filteredKb = [
    ...ruleEntries,
    ...scoredKb,
  ]

  const recentVideos = await db.query.videos.findMany({
    columns: { id: true, title: true, thumbnailUrl: true, duration: true },
    orderBy: [desc(videos.publishedAt)],
    limit: MAX_RECENT_VIDEOS,
  })

  // Compute comment age in days
  const commentDate = new Date(comment.publishedAt)
  const ageInDays = Math.floor((Date.now() - commentDate.getTime()) / 86_400_000)

  // Parse video summary extras
  const videoKeyTopics: string[] = summary?.keyTopics
    ? (JSON.parse(summary.keyTopics) as string[])
    : []
  const videoFaqs: Array<{ q: string; a: string }> = summary?.faqs
    ? (JSON.parse(summary.faqs) as Array<{ q: string; a: string }>).slice(0, MAX_VIDEO_FAQS)
    : []

  return {
    comment: {
      id: comment.id,
      text: comment.text,
      authorName: comment.authorName,
      authorChannelId: comment.authorChannelId ?? null,
      likeCount: comment.likeCount ?? 0,
      ageInDays,
      publishedAt: comment.publishedAt,
      detectedLang: comment.detectedLang ?? 'und',
      langConfidence: comment.langConfidence ?? 0,
      langOverride,
      intent: detectIntent(comment.text ?? ''),
    },
    video: {
      id: video.id,
      title: video.title,
      descriptionExcerpt: (video.description ?? '').substring(0, MAX_DESCRIPTION_CHARS),
      tags: videoTags.slice(0, 10),
      viewCount: video.viewCount ?? 0,
      commentCount: video.commentCount ?? 0,
    },
    videoSummary: summary?.summary ?? null,
    videoKeyTopics,
    videoFaqs,
    existingReplies: existingReplies.map(r => ({
      author: r.authorName,
      text: r.text.substring(0, MAX_REPLY_CHARS),
    })),
    knowledgeBaseEntries: filteredKb.map(e => ({
      type: e.type,
      title: e.title,
      content: e.content.substring(0, MAX_KB_CONTENT_CHARS),
      tags: e.tags ? (JSON.parse(e.tags) as string[]) : [],
    })),
    channelStyle: mergedStyle,
    recentVideos: recentVideos.map(v => ({
      id: v.id,
      title: v.title,
      thumbnailUrl: v.thumbnailUrl,
      isShort: isYouTubeShort(v.duration),
    })),
    friendlyName: extractFriendlyName(comment.authorName),
    additionalContext,
  }
}

export function buildPrompt(ctx: CommentContext, userLang: string = "Spanish"): string {
  const kbText = ctx.knowledgeBaseEntries.length > 0
    ? ctx.knowledgeBaseEntries.map((e) => {
        const tagsStr = e.tags.length > 0 ? ` [tags: ${e.tags.join(', ')}]` : ''
        return `[${e.type.toUpperCase()}]${tagsStr} ${e.title}:\n${e.content}`
      }).join('\n\n')
    : 'No knowledge base entries configured yet.'

  const repliesText = ctx.existingReplies.length > 0
    ? ctx.existingReplies.map(r => `- ${r.author}: "${r.text}"`).join('\n')
    : 'No existing replies on this comment.'

  const recentVideosText = ctx.recentVideos.length > 0
    ? ctx.recentVideos.map(v => `- ID: ${v.id} | Title: ${v.title}${v.isShort ? ' (Short)' : ''} | URL: https://youtu.be/${v.id}${v.thumbnailUrl ? ` | Thumbnail URL: ${v.thumbnailUrl}` : ''}`).join('\n')
    : 'No videos in database.'

  const intentGuide: Record<CommentIntent, string> = {
    video_request: 'User is looking for a specific video/tutorial. CALL search_videos immediately with the topic keywords. If found, provide the exact URL. If not found after 2 tries, suggest the closest recent video or acknowledge the content may not exist yet.',
    question: 'User has a specific question. Answer directly and concisely. Check VIDEO FAQs first — if the exact question is answered there, use that answer. Call search_videos if the answer lives in a specific video. Use KB entries if they contain relevant information.',
    help_needed: 'User needs assistance — show empathy first. Provide actionable, step-by-step guidance if possible. If the solution is in a tutorial video, find and share it. Be warm and encouraging.',
    complaint: 'User has a problem or complaint. Acknowledge the issue without being defensive. Offer a concrete solution, alternative, or next step. If it relates to a video, verify the video context before referencing it.',
    compliment: 'User is being appreciative/positive. Respond warmly and authentically. Keep it brief — 1-2 sentences. Optionally mention related content they might enjoy without being pushy.',
    general: 'Engage naturally with the comment. Match the tone and energy. Be friendly and genuine.',
  }

  const systemPrompt = `You are an AI assistant that helps a YouTube channel owner respond to comments.

ABSOLUTE RULES — NEVER VIOLATE:
1. NEVER invent, fabricate or assume YouTube video URLs, IDs, or titles
2. Only reference videos from RECENT VIDEOS below OR results returned by the search_videos tool
3. VIDEO SEARCH — follow this decision tree EVERY TIME (applies to comments in ANY language):
   a. Is the commenter asking about a specific topic, video, tutorial, product, or event? → CALL search_videos
   b. Extract 2–4 core nouns/adjectives. REMOVE filler/stop words — examples by language:
      ES: como, donde, qué, el, la, de, un, una, video, vídeo, puedo, ver, hola
      EN: how, where, the, can, video, please, do, you, have, watch, find
      FR: où, est, le, la, les, un, une, des, du, comment, voir, vidéo, bonjour
      PT/BR: onde, está, o, a, os, as, um, uma, vídeo, ver, assistir, tem, oi
      RU: где, как, есть, ли, это, видео, посмотреть, привет (strip Cyrillic fillers too)
      AR: أين, هل, عندك, الفيديو, كيف, شكرا (strip Arabic prepositions/greetings)
   c. Query examples:
      ES "¿dónde puedo ver el tutorial de blusa?" → query "blusa"
      EN "do you have a summer makeup tutorial?" → query "summer makeup"
      FR "où est la vidéo sur le crochet été?" → query "crochet été"
      PT "onde está o vídeo de crochê bolsa?" → query "crochê bolsa"
      RU "где видео про вязание крючком?" → query "вязание крючком"
      AR "أين فيديو الكروشيه؟" → query "كروشيه"
   d. If search_videos returns 0 results, try ONE more call with a shorter/synonym query before giving up
   e. Maximum 2 search_videos calls per response
4. If uncertain: set needs_confirmation=true and explain why in confirmation_reason
5. Respond in the SAME LANGUAGE as the comment (use detected_language) — UNLESS langOverride is specified
6. Always include verification_translation (a full translation of your reply into ${userLang.toUpperCase()} language)
7. RESPONSE LENGTH — calibrate by intent and importance:
   - video_request / question / help_needed: 2–4 sentences, be complete
   - complaint: 2–3 sentences, acknowledge then solve
   - compliment: 1–2 sentences, warm and genuine
   - general: 1–3 sentences, match the energy
   - HIGH IMPORTANCE (≥10 likes): lean toward the longer end of the range
8. If an existing reply already covers this topic, acknowledge it or build on it — never repeat verbatim
9. NEVER use Markdown links (e.g., [Title](URL)) as they don't render in YouTube. Use plain URLs.
10. SEARCH PREFERENCE: When a user asks for a tutorial/explanation, PREFER long-form videos over Shorts. Shorts are usually too brief for full answers.
11. TEMPORAL AWARENESS: If the comment is old (≥180 days), acknowledge that context may have changed if relevant (prices, availability, links, etc.)
12. VIDEO FAQs are pre-analyzed Q&A pairs extracted from the video. Use them to answer questions directly when they match — this is the most accurate source for video-specific answers.
13. FORCED LANGUAGE: The "verification_translation" MUST BE IN ${userLang.toUpperCase()}. This is for the channel owner who speaks ${userLang.toUpperCase()}. NEVER return this field in English unless ${userLang.toUpperCase()} is English.
14. ANTI-HALLUCINATION: NEVER assume or mention the existence of subtitles, translations, or technical features (like "Czech subtitles" or "translated description") unless they are explicitly mentioned in the VIDEO SUMMARY or DESCRIPTION above. If a user writes in another language, just respond in that language without explaining why or mentioning subtitles.
15. PERSONALIZATION (FIRST REPLY): If this is the FIRST response in the thread (existing_replies_count is 0), you SHOULD start your response by greeting the user by their first name to create a warm, personalized feel.
    - Use the "Author Name" and "Likely First Name" provided below.
    - Decode the first name if it's a composite handle (e.g., "@anasanchez4431" -> "Ana", "Juan_Perez" -> "Juan").
    - Only use the FIRST NAME (no surnames).
    - Example: "Hola Ana, ..." instead of "Hola @anasanchez4431, ...".
    - If you cannot decode a clear name, just use a general greeting.

INTENT-BASED GUIDANCE (comment intent: ${ctx.comment.intent}):
${intentGuide[ctx.comment.intent]}

CHANNEL STYLE & PERSONA:
${ctx.channelStyle ?? 'No channel style configured. Use a friendly and professional tone.'}

KNOWLEDGE BASE:
${kbText}

Return ONLY valid JSON matching this exact schema. No markdown, no explanation outside JSON:
{
  "response_text": "reply in commenter's language",
  "verification_translation": "full translation of the reply in ${userLang.toUpperCase()} language",
  "context_used": {
    "kb_entries": ["array of KB entry titles actually used"],
    "video_title": "exact video title or null",
    "video_summary_used": boolean,
    "existing_replies_checked": boolean,
    "existing_replies_count": number
  },
  "friendly_name_used": "the name you decoded and used, or null",
  "confidence": 0.0,
  "needs_confirmation": false,
  "confirmation_reason": null,
  "video_links_used": [
    { "video_id": "exact ID", "video_title": "exact title", "url": "https://youtu.be/ID", "thumbnail_url": "thumbnail URL from RECENT VIDEOS or search results" }
  ],
  "tone_applied": "description of tone",
  "detected_language": "BCP-47 code"
}`

  // Build video engagement context string
  const videoEngagement = ctx.video.viewCount > 0
    ? `Views: ${ctx.video.viewCount.toLocaleString()} | Comments: ${ctx.video.commentCount.toLocaleString()}`
    : 'Engagement data not available'

  // Build comment importance label
  const importanceLabel = ctx.comment.likeCount >= 20
    ? `HIGH (${ctx.comment.likeCount} likes — this is an important comment from the community)`
    : ctx.comment.likeCount >= 5
      ? `MEDIUM (${ctx.comment.likeCount} likes)`
      : ctx.comment.likeCount > 0
        ? `${ctx.comment.likeCount} likes`
        : 'no likes'

  // Build comment age label
  const ageLabel = ctx.comment.ageInDays === 0
    ? 'today'
    : ctx.comment.ageInDays === 1
      ? 'yesterday'
      : ctx.comment.ageInDays < 7
        ? `${ctx.comment.ageInDays} days ago`
        : ctx.comment.ageInDays < 30
          ? `${Math.round(ctx.comment.ageInDays / 7)} weeks ago`
          : ctx.comment.ageInDays < 365
            ? `${Math.round(ctx.comment.ageInDays / 30)} months ago`
            : `${Math.round(ctx.comment.ageInDays / 365)} year(s) ago`

  // Build video FAQs section
  const faqsText = ctx.videoFaqs.length > 0
    ? ctx.videoFaqs.map((f, i) => `  ${i + 1}. Q: ${f.q}\n     A: ${f.a}`).join('\n')
    : null

  // Build key topics section
  const topicsText = ctx.videoKeyTopics.length > 0
    ? ctx.videoKeyTopics.join(', ')
    : null

  const userPrompt = `CONVERSATION CONTEXT:
The following is a thread. You must respond to the LATEST message (either the original comment if there are no replies, or the most recent reply listed below).
Existing Replies Count: ${ctx.existingReplies.length}

Author of Original Comment: ${ctx.comment.authorName}
Likely First Name: ${ctx.friendlyName || 'unknown'}
Intent of Original Comment: ${ctx.comment.intent}
Language detected: ${ctx.comment.detectedLang} (confidence: ${ctx.comment.langConfidence.toFixed(2)})
Importance: ${importanceLabel}
Age of Original Comment: ${ageLabel}
Original Comment Text: "${ctx.comment.text}"

VIDEO THIS COMMENT IS ON:
ID: ${ctx.video.id}
Title: ${ctx.video.title}
${videoEngagement}
Description (excerpt): ${ctx.video.descriptionExcerpt}
Tags: ${ctx.video.tags.join(', ') || 'none'}
${topicsText ? `Key topics: ${topicsText}` : ''}

VIDEO SUMMARY:
${ctx.videoSummary ?? 'No summary available. Use video title and description only.'}
${faqsText ? `\nVIDEO FAQs (pre-analyzed viewer questions — use these to answer directly):\n${faqsText}` : ''}

EXISTING REPLIES IN THIS THREAD (MOST RECENT FIRST):
${repliesText}

RECENT VIDEOS (most recent ${ctx.recentVideos.length} — use search_videos tool to find specific older videos):
${recentVideosText}

YOUR TASK:
Generate a reply to the LATEST activity in this thread. ${ctx.comment.langOverride
    ? `IMPORTANT: The user has manually selected the reply language. You MUST respond in "${ctx.comment.langOverride}" regardless of the detected language.`
    : `Respond in ${ctx.comment.detectedLang} language (auto-detected).`
  }
${ctx.additionalContext ? `\nUSER PROVIDED ADDITIONAL CONTEXT (FOLLOW THESE INSTRUCTIONS STRICTLY):\n"${ctx.additionalContext}"\n` : ''}
Return ONLY the JSON object.`

  return `${systemPrompt}\n\n---\n\n${userPrompt}`
}
