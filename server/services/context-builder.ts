import { eq, and, desc, isNotNull } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { comments, videos, videoSummaries, knowledgeBase } from '../db/schema'

export interface CommentContext {
  comment: {
    id: string
    text: string
    authorName: string
    publishedAt: string
    detectedLang: string
    langConfidence: number
    langOverride: string | null
  }
  video: {
    id: string
    title: string
    descriptionExcerpt: string
    tags: string[]
  }
  videoSummary: string | null
  existingReplies: Array<{ author: string; text: string }>
  knowledgeBaseEntries: Array<{ type: string; title: string; content: string }>
  channelStyle: string | null
  recentVideos: Array<{ id: string; title: string; thumbnailUrl: string | null; isShort: boolean }>
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

const MAX_DESCRIPTION_CHARS = 2000
const MAX_KB_ENTRIES = 5
const MAX_KB_CONTENT_CHARS = 1000
const MAX_REPLIES = 5
const MAX_REPLY_CHARS = 200
const MAX_RECENT_VIDEOS = 10

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

  const channelStyleEntry = await db.query.knowledgeBase.findFirst({
    where: and(
      eq(knowledgeBase.type, 'channel_style'),
      eq(knowledgeBase.isActive, true),
    ),
    orderBy: [desc(knowledgeBase.priority)],
  })

  const kbEntries = await db.query.knowledgeBase.findMany({
    where: eq(knowledgeBase.isActive, true),
    orderBy: [desc(knowledgeBase.priority)],
    limit: MAX_KB_ENTRIES + 1,
  })

  const filteredKb = kbEntries
    .filter(e => e.type !== 'channel_style')
    .slice(0, MAX_KB_ENTRIES)

  // Only most-recent videos as baseline — search_videos tool handles specific lookups
  const recentVideos = await db.query.videos.findMany({
    columns: { id: true, title: true, thumbnailUrl: true, duration: true },
    orderBy: [desc(videos.publishedAt)],
    limit: MAX_RECENT_VIDEOS,
  })

  return {
    comment: {
      id: comment.id,
      text: comment.text,
      authorName: comment.authorName,
      publishedAt: comment.publishedAt,
      detectedLang: comment.detectedLang ?? 'und',
      langConfidence: comment.langConfidence ?? 0,
      langOverride,
    },
    video: {
      id: video.id,
      title: video.title,
      descriptionExcerpt: (video.description ?? '').substring(0, MAX_DESCRIPTION_CHARS),
      tags: video.tags ? (JSON.parse(video.tags) as string[]).slice(0, 10) : [],
    },
    videoSummary: summary?.summary ?? null,
    existingReplies: existingReplies.map(r => ({
      author: r.authorName,
      text: r.text.substring(0, MAX_REPLY_CHARS),
    })),
    knowledgeBaseEntries: filteredKb.map(e => ({
      type: e.type,
      title: e.title,
      content: e.content.substring(0, MAX_KB_CONTENT_CHARS),
    })),
    channelStyle: channelStyleEntry?.content ?? null,
    recentVideos: recentVideos.map(v => ({
      id: v.id,
      title: v.title,
      thumbnailUrl: v.thumbnailUrl,
      isShort: isYouTubeShort(v.duration),
    })),
    additionalContext,
  }
}

export function buildPrompt(ctx: CommentContext): string {
  const kbText = ctx.knowledgeBaseEntries.length > 0
    ? ctx.knowledgeBaseEntries.map(e => `[${e.type.toUpperCase()}] ${e.title}:\n${e.content}`).join('\n\n')
    : 'No knowledge base entries configured yet.'

  const repliesText = ctx.existingReplies.length > 0
    ? ctx.existingReplies.map(r => `- ${r.author}: "${r.text}"`).join('\n')
    : 'No existing replies on this comment.'

  const recentVideosText = ctx.recentVideos.length > 0
    ? ctx.recentVideos.map(v => `- ID: ${v.id} | Title: ${v.title}${v.isShort ? ' (Short)' : ''} | URL: https://youtu.be/${v.id}${v.thumbnailUrl ? ` | Thumbnail URL: ${v.thumbnailUrl}` : ''}`).join('\n')
    : 'No videos in database.'

  const systemPrompt = `You are Mona, an AI assistant that helps a YouTube channel owner respond to comments.

ABSOLUTE RULES — NEVER VIOLATE:
1. NEVER invent, fabricate or assume YouTube video URLs, IDs, or titles
2. Only reference videos from RECENT VIDEOS below OR results returned by the search_videos tool
3. If the commenter asks about a specific video or topic, call search_videos ONCE — then generate the reply immediately using those results. Do not call search_videos more than once.
4. If uncertain: set needs_confirmation=true and explain why in confirmation_reason
5. Respond in the SAME LANGUAGE as the comment (use detected_language) — UNLESS langOverride is specified, use that language
6. Always include response_es (Spanish translation of the reply)
7. Keep responses concise — 2-4 sentences unless the question requires more
8. If an existing reply already covers this topic, acknowledge it
9. NEVER use Markdown links (e.g., [Title](URL)) as they don't render in YouTube. Use plain URLs.
10. SEARCH PREFERENCE: When a user asks "where is the video" or for a tutorial/explanation, PREFER long-form videos over "Shorts". Shorts are usually too brief for full answers.

CHANNEL STYLE & PERSONA:
${ctx.channelStyle ?? 'No channel style configured. Use a friendly and professional tone.'}

KNOWLEDGE BASE:
${kbText}

Return ONLY valid JSON matching this exact schema. No markdown, no explanation outside JSON:
{
  "response_text": "reply in commenter's language",
  "response_es": "Spanish translation",
  "context_used": {
    "kb_entries": ["array of KB entry titles actually used"],
    "video_title": "exact video title or null",
    "video_summary_used": boolean,
    "existing_replies_checked": boolean,
    "existing_replies_count": number
  },
  "confidence": 0.0,
  "needs_confirmation": false,
  "confirmation_reason": null,
  "video_links_used": [
    { "video_id": "exact ID", "video_title": "exact title", "url": "https://youtu.be/ID", "thumbnail_url": "thumbnail URL from RECENT VIDEOS or search results" }
  ],
  "tone_applied": "description of tone",
  "detected_language": "BCP-47 code"
}`

  const userPrompt = `COMMENT TO REPLY TO:
Author: ${ctx.comment.authorName}
Language detected: ${ctx.comment.detectedLang} (confidence: ${ctx.comment.langConfidence.toFixed(2)})
Published: ${ctx.comment.publishedAt}
Text: "${ctx.comment.text}"

VIDEO THIS COMMENT IS ON:
ID: ${ctx.video.id}
Title: ${ctx.video.title}
Description (excerpt): ${ctx.video.descriptionExcerpt}
Tags: ${ctx.video.tags.join(', ') || 'none'}

VIDEO SUMMARY:
${ctx.videoSummary ?? 'No summary available. Use video title and description only.'}

EXISTING REPLIES ON THIS COMMENT THREAD (check for duplicate topics):
${repliesText}

RECENT VIDEOS (most recent ${ctx.recentVideos.length} — use search_videos tool to find specific older videos):
${recentVideosText}

Generate a reply to this comment. ${ctx.comment.langOverride
    ? `IMPORTANT: The user has manually selected the reply language. You MUST respond in "${ctx.comment.langOverride}" regardless of the detected language.`
    : `Respond in ${ctx.comment.detectedLang} language (auto-detected).`
  }
${ctx.additionalContext ? `\nUSER PROVIDED ADDITIONAL CONTEXT (FOLLOW THESE INSTRUCTIONS STRICTLY):\n"${ctx.additionalContext}"\n` : ''}
Return ONLY the JSON object.`

  return `${systemPrompt}\n\n---\n\n${userPrompt}`
}
