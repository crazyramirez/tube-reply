import { eq, and, desc, isNotNull, ne } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { comments, videos, videoSummaries, knowledgeBase } from '../db/schema'
import { getVideoTranscript, findRelevantTranscriptExcerpt } from './captions-service'

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
  videoTranscript: string | null
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
  return (minutes * 60) + seconds < 120
}

export function detectIntent(text: string): CommentIntent {
  const t = text.toLowerCase()
  if (/(\?|donde|dónde|where|où|onde|wo|dove|где|اين|أين).{0,40}(video|vídeo|tutorial|link|url)/i.test(t)
    || /(video|vídeo|tutorial|link|url).{0,40}(\?|busco|find|cherch|buscar|where|donde)/i.test(t)
    || /(tienes|tiene|have you|avez|tem|haben).{0,30}(video|vídeo|tutorial)/i.test(t)
    || /\b(link del|link de|link to|url del|dame el|send me|pásame|share the)\b/.test(t)
  ) return 'video_request'
  if (/\b(ayuda(me)?|help me|please help|por favor ayuda|need help|socorro|emergencia|urgente|urgent|asap)\b/i.test(t)) return 'help_needed'
  if (/\b(no funciona|doesn.t work|not working|error|wrong|incorrect|problema|problem|broken|fix|arregla|falla|crash|bug|issue)\b/i.test(t)) return 'complaint'
  if (t.includes('?') || /^(how|what|when|where|why|can |could |do you|does |is there|have you|did |which |who )/i.test(t)
    || /^(como|cómo|qué|que |cuando|cuándo|dónde|donde|por qué|porqué|cuánto|cuanto|tienes|tienen|hay |puedes|puede|se puede)/i.test(t)
    || /^(comment|où |quand|quel|quelle|avez|est-ce)/i.test(t)
    || /^(onde|quando|como|qual|tem |você|voce|há )/i.test(t)
    || /^(где|как|когда|что|кто|есть ли|можно)/i.test(t)
    || /^(أين|كيف|متى|ماذا|هل )/i.test(t)
  ) return 'question'
  if (/\b(gracias|thank|excelente|amazing|love|encanta|incre[íi]ble|beautiful|wonderful|great|felicitaciones|congrats|bravo|genial|hermosa|hermoso|perfecto|perfect|adorable|bello|bella|chevere|chévere)\b/i.test(t) && !t.includes('?')) return 'compliment'
  return 'general'
}

function normalizeForScoring(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ً-ٟ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

function extractFriendlyName(name: string): string {
  if (!name) return ''
  let clean = name.startsWith('@') ? name.substring(1) : name
  if (clean.includes(' ')) return clean.split(' ')[0]
  const separators = ['_', '.', '-']
  for (const sep of separators) { if (clean.includes(sep)) return clean.split(sep)[0] }
  const camelMatch = clean.match(/^([A-Z][a-z]+)/)
  if (camelMatch) return camelMatch[1]
  return clean.replace(/\d+$/, '') || clean
}

function scoreKbEntry(commentText: string, videoTags: string[], entry: { title: string; content: string; tags: string | null }): number {
  const commentNorm = normalizeForScoring(commentText)
  const videoTagsNorm = normalizeForScoring(videoTags.join(' '))
  const commentWords = commentNorm.split(/\s+/).filter(w => w.length > 3)
  const videoTagWords = videoTagsNorm.split(/\s+/).filter(w => w.length > 2)
  const titleNorm = normalizeForScoring(entry.title)
  const contentNorm = normalizeForScoring(entry.content)
  const entryTagsRaw = entry.tags ? (JSON.parse(entry.tags) as string[]).join(' ') : ''
  const entryTagsNorm = normalizeForScoring(entryTagsRaw)
  let score = 0
  for (const word of commentWords) {
    if (titleNorm.includes(word)) score += 3
    if (entryTagsNorm.includes(word)) score += 2
    if (contentNorm.includes(word)) score += 1
  }
  for (const word of videoTagWords) {
    if (titleNorm.includes(word)) score += 1
    if (entryTagsNorm.includes(word)) score += 1
  }
  if (commentWords.length >= 2) {
    for (let i = 0; i < commentWords.length - 1; i++) {
      const pair = `${commentWords[i]} ${commentWords[i + 1]}`
      if (titleNorm.includes(pair)) score += 4
      else if (contentNorm.includes(pair)) score += 2
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
  const comment = await db.query.comments.findFirst({ where: eq(comments.id, commentId) })
  if (!comment) throw new Error(`Comment not found: ${commentId}`)
  const video = await db.query.videos.findFirst({ where: eq(videos.id, comment.videoId) })
  if (!video) throw new Error(`Video not found: ${comment.videoId}`)
  const intent = detectIntent(comment.text ?? '')
  const needsTranscript = ['question', 'help_needed', 'video_request', 'complaint'].includes(intent)
  const [summary, rawTranscript] = await Promise.all([
    db.query.videoSummaries.findFirst({ where: eq(videoSummaries.videoId, video.id) }),
    getVideoTranscript(video.id, !needsTranscript),
  ])
  const existingReplies = await db.query.comments.findMany({
    where: and(eq(comments.videoId, video.id), isNotNull(comments.parentId), eq(comments.parentId, commentId)),
    orderBy: [desc(comments.publishedAt)],
    limit: MAX_REPLIES,
    columns: { authorName: true, text: true },
  })
  const styleEntries = await db.query.knowledgeBase.findMany({ where: and(eq(knowledgeBase.type, 'style'), eq(knowledgeBase.isActive, true)), orderBy: [desc(knowledgeBase.priority)] })
  const mergedStyle = styleEntries.length ? styleEntries.map(e => `[${e.title}]\n${e.content}`).join('\n\n') : null
  const ruleEntries = await db.query.knowledgeBase.findMany({ where: and(eq(knowledgeBase.type, 'rule'), eq(knowledgeBase.isActive, true)), orderBy: [desc(knowledgeBase.priority)] })
  const noShortsRule = ruleEntries.some(e => (e.content.toLowerCase().includes('short') || e.content.toLowerCase().includes('corto')) && (e.content.toLowerCase().includes('nunca') || e.content.toLowerCase().includes('no ') || e.content.toLowerCase().includes('never')))
  const allFaqInfo = await db.query.knowledgeBase.findMany({ where: eq(knowledgeBase.isActive, true), orderBy: [desc(knowledgeBase.priority)] })
  const videoTags = video.tags ? (JSON.parse(video.tags) as string[]) : []
  const scoredKb = allFaqInfo.filter(e => e.type === 'faq' || e.type === 'info').map(e => ({ e, score: scoreKbEntry(comment.text ?? '', videoTags, e) })).sort((a, b) => b.score - a.score || (b.e.priority ?? 0) - (a.e.priority ?? 0)).slice(0, MAX_KB_ENTRIES).map(({ e }) => e)
  const filteredKb = [...ruleEntries, ...scoredKb]
  const recentVideosRaw = await db.query.videos.findMany({ columns: { id: true, title: true, thumbnailUrl: true, duration: true }, where: ne(videos.id, video.id), orderBy: [desc(videos.publishedAt)], limit: MAX_RECENT_VIDEOS * 2 })
  const recentVideos = recentVideosRaw.map(v => ({ id: v.id, title: v.title, thumbnailUrl: v.thumbnailUrl, isShort: isYouTubeShort(v.duration) })).filter(v => !noShortsRule || !v.isShort).slice(0, MAX_RECENT_VIDEOS)
  const ageInDays = Math.floor((Date.now() - new Date(comment.publishedAt).getTime()) / 86_400_000)
  const videoKeyTopics: string[] = summary?.keyTopics ? (JSON.parse(summary.keyTopics) as string[]) : []
  const videoFaqs: Array<{ q: string; a: string }> = summary?.faqs ? (JSON.parse(summary.faqs) as Array<{ q: string; a: string }>).slice(0, MAX_VIDEO_FAQS) : []

  return {
    comment: { id: comment.id, text: comment.text, authorName: comment.authorName, authorChannelId: comment.authorChannelId ?? null, likeCount: comment.likeCount ?? 0, ageInDays, publishedAt: comment.publishedAt, detectedLang: comment.detectedLang ?? 'und', langConfidence: comment.langConfidence ?? 0, langOverride, intent },
    video: { id: video.id, title: video.title, descriptionExcerpt: (video.description ?? '').substring(0, MAX_DESCRIPTION_CHARS), tags: videoTags.slice(0, 10), viewCount: video.viewCount ?? 0, commentCount: video.commentCount ?? 0 },
    videoSummary: summary?.summary ?? null,
    videoTranscript: findRelevantTranscriptExcerpt(rawTranscript, comment.text ?? '', intent),
    videoKeyTopics,
    videoFaqs,
    existingReplies: existingReplies.map(r => ({ author: r.authorName, text: r.text.substring(0, MAX_REPLY_CHARS) })),
    knowledgeBaseEntries: filteredKb.map(e => ({ type: e.type, title: e.title, content: e.content.substring(0, MAX_KB_CONTENT_CHARS), tags: e.tags ? (JSON.parse(e.tags) as string[]) : [] })),
    channelStyle: mergedStyle,
    recentVideos: recentVideos.map(v => ({ id: v.id, title: v.title, thumbnailUrl: v.thumbnailUrl, isShort: v.isShort })),
    friendlyName: extractFriendlyName(comment.authorName),
    additionalContext,
  }
}

export function buildPrompt(ctx: CommentContext, userLang: string = "Spanish"): string {
  const kbRules = ctx.knowledgeBaseEntries.filter(e => e.type === 'rule')
  const kbInfo = ctx.knowledgeBaseEntries.filter(e => e.type !== 'rule')
  const kbText = kbInfo.length > 0 ? kbInfo.map((e) => `[${e.type.toUpperCase()}] ${e.title}:\n${e.content}`).join('\n\n') : 'No knowledge base entries.'
  const rulesText = kbRules.length > 0 ? kbRules.map(e => `- ${e.content}`).join('\n') : ''
  const recentVideosText = ctx.recentVideos.length > 0 ? ctx.recentVideos.map(v => `- ID: ${v.id} | Title: ${v.title} | URL: https://youtu.be/${v.id}`).join('\n') : 'No videos in database.'

  const additionalInstructions = ctx.additionalContext 
    ? `\n[!!!] CRITICAL MANUAL INSTRUCTION (PRIORITY #1):\n"${ctx.additionalContext}"\n(This instruction was written by hand and takes ABSOLUTE PRECEDENCE over any other rule or style below.)\n`
    : ''

  const styleText = ctx.channelStyle ? `\nVOICE & STYLE GUIDELINES:\n${ctx.channelStyle}\n` : ''
  const knowledgeBaseText = kbInfo.length > 0 ? `\nKNOWLEDGE BASE / FAQS:\n${kbText}\n` : ''
  const repliesText = ctx.existingReplies.length > 0 ? `\nEXISTING REPLIES IN THIS THREAD:\n${ctx.existingReplies.map(r => `- ${r.author}: "${r.text}"`).join('\n')}\n` : ''
  const transcriptText = ctx.videoTranscript ? `\nRELEVANT VIDEO TRANSCRIPT EXCERPT:\n"${ctx.videoTranscript}"\n` : ''

  const systemPrompt = `You are an AI assistant that helps a YouTube channel owner respond to comments.
${additionalInstructions}
ABSOLUTE RULES — NEVER VIOLATE:
${rulesText}
1. NEVER invent YouTube URLs/IDs. Use only provided videos.
2. Respond in the SAME LANGUAGE as the comment unless langOverride is specified.
3. Include verification_translation in ${userLang.toUpperCase()}.
4. Return ONLY valid JSON matching the exact schema. No markdown.
5. If an existing reply covers this, acknowledge it.
6. NO UNNECESSARY SUGGESTIONS: Do not suggest videos for simple compliments.
${ctx.additionalContext ? `7. MANDATORY USER INSTRUCTION: You MUST strictly follow this: "${ctx.additionalContext}"` : ''}
${styleText}${knowledgeBaseText}
VIDEO SEARCH RULES:
- Use search_videos tool if commenter asks for a specific topic/tutorial.
- Extract 2-4 keywords (nouns).
- Respond in same language as comment.

JSON SCHEMA:
{
  "response_text": "string",
  "verification_translation": "string",
  "context_used": { "kb_entries": [], "video_title": "string", "video_summary_used": boolean, "existing_replies_count": number },
  "friendly_name_used": "string",
  "confidence": number,
  "needs_confirmation": boolean,
  "confirmation_reason": "string",
  "video_links_used": [{ "video_id": "string", "video_title": "string", "url": "string" }],
  "tone_applied": "string",
  "detected_language": "string"
}`

  const videoEngagement = ctx.video.viewCount > 0 ? `Views: ${ctx.video.viewCount} | Comments: ${ctx.video.commentCount}` : ''

  const userPrompt = `COMMENT AUTHOR: ${ctx.comment.authorName} (First Name: ${ctx.friendlyName || 'unknown'})
COMMENT TEXT: "${ctx.comment.text}"
INTENT: ${ctx.comment.intent}
IMPORTANCE: ${ctx.comment.likeCount} likes

VIDEO TITLE: ${ctx.video.title}
${videoEngagement}
SUMMARY: ${ctx.videoSummary ?? 'No summary.'}
${transcriptText}${repliesText}
RECENT VIDEOS:
${recentVideosText}

${ctx.additionalContext ? `USER PROVIDED ADDITIONAL CONTEXT (FOLLOW STRICTLY):\n"${ctx.additionalContext}"\n` : ''}`

  return `${systemPrompt}\n\n---\n\n${userPrompt}`
}
