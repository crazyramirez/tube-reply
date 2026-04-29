import { eq, desc, and, isNull, sql } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { videos, comments, videoSummaries, knowledgeBase } from '../db/schema'
import { generateUnified } from '../utils/ai'
import { getAuthenticatedYouTube } from '../utils/youtube'
import { logger } from '../utils/logger'
import { getUserLanguage } from '../utils/settings'

export interface PinnedCommentSuggestion {
  videoId: string
  videoTitle: string
  suggestedText: string
  strategy: string
  cta: string
  estimatedEngagementBoost: string
}

const PINNED_COMMENT_STRATEGIES = [
  'question' as const,    // ask viewers a question to spark discussion
  'cta' as const,         // drive to next video or playlist
  'resource' as const,    // share a key resource/link mentioned in video
  'community' as const,   // build community around a shared theme
]

export async function generatePinnedComment(
  videoId: string,
  strategy: typeof PINNED_COMMENT_STRATEGIES[number] = 'question',
): Promise<PinnedCommentSuggestion | null> {
  try {
    const db = useDb()
    const video = await db.query.videos.findFirst({ where: eq(videos.id, videoId) })
    if (!video) return null

    const [summary, styleEntries, topComments] = await Promise.all([
      db.query.videoSummaries.findFirst({ where: eq(videoSummaries.videoId, videoId) }),
      db.query.knowledgeBase.findMany({
        where: and(eq(knowledgeBase.type, 'style'), eq(knowledgeBase.isActive, true)),
        orderBy: [desc(knowledgeBase.priority)],
        limit: 2,
      }),
      db.query.comments.findMany({
        where: and(eq(comments.videoId, videoId), isNull(comments.parentId)),
        orderBy: [desc(comments.likeCount)],
        limit: 15,
        columns: { text: true, likeCount: true, authorName: true },
      }),
    ])

    const userLang = await getUserLanguage()
    const styleText = styleEntries.map(e => e.content).join('\n')
    const topCommentsText = topComments
      .map(c => `- [${c.likeCount} likes] ${c.authorName}: "${c.text.substring(0, 150)}"`)
      .join('\n')

    const strategyGuide: Record<typeof PINNED_COMMENT_STRATEGIES[number], string> = {
      question: 'Ask an open-ended question that makes viewers want to answer in the comments. The question should be directly related to the video topic and have no single "right" answer. Example: "What was YOUR biggest takeaway from this video? Let me know below!"',
      cta: 'Drive viewers to watch the next most relevant video in the channel, or subscribe if they are new. Include a specific reason why they would enjoy it.',
      resource: 'Share the most valuable resource, link, or tool mentioned in the video that viewers frequently ask about. Format: [Resource Name]: [URL or description]',
      community: 'Create a sense of belonging and shared identity among viewers around the video topic. Invite them to share their own experience or perspective.',
    }

    const prompt = `You are helping a YouTube creator write the perfect PINNED COMMENT for one of their videos.

ABOUT THE CHANNEL:
${styleText || 'No style guide available.'}

VIDEO DETAILS:
Title: ${video.title}
Description: ${(video.description ?? '').substring(0, 800)}
Views: ${video.viewCount?.toLocaleString() ?? 'unknown'}
Comments: ${video.commentCount?.toLocaleString() ?? 'unknown'}

VIDEO SUMMARY:
${summary?.summary ?? 'No summary available.'}

TOP COMMENTS FROM VIEWERS (for context on what's resonating):
${topCommentsText || 'No comments yet.'}

STRATEGY FOR THIS PINNED COMMENT: "${strategy}"
${strategyGuide[strategy]}

RULES:
1. Maximum 500 characters (YouTube pinned comment best practice)
2. No markdown, no links unless they're the resource strategy
3. Write in ${userLang} language
4. Sound authentic, not corporate — use the channel's tone
5. Create urgency or curiosity to maximize engagement
6. The pinned comment will appear at TOP of all comments — it's the first thing viewers read

Return valid JSON only:
{
  "suggested_text": "the pinned comment text",
  "strategy": "brief explanation of what makes this effective",
  "cta": "what action viewers will be motivated to take",
  "estimated_engagement_boost": "e.g. +30-50% more comments expected"
}`

    const result = await generateUnified(prompt)
    const parsed = JSON.parse(result.text)

    return {
      videoId,
      videoTitle: video.title,
      suggestedText: parsed.suggested_text ?? '',
      strategy: parsed.strategy ?? '',
      cta: parsed.cta ?? '',
      estimatedEngagementBoost: parsed.estimated_engagement_boost ?? '',
    }
  }
  catch (err: any) {
    await logger.error('pinned-comment-engine', `Failed to generate pinned comment for ${videoId}: ${err.message}`)
    return null
  }
}

export async function postPinnedComment(videoId: string, text: string): Promise<{ youtubeCommentId: string } | null> {
  try {
    const yt = await getAuthenticatedYouTube()

    // Post as a new top-level comment on the video
    const res = await yt.commentThreads.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          videoId,
          topLevelComment: {
            snippet: {
              textOriginal: text,
            },
          },
        },
      },
    })

    const commentId = res.data.snippet?.topLevelComment?.id
    if (!commentId) throw new Error('No comment ID returned from YouTube')

    // Pin the comment via video.update moderationStatus (requires special permission)
    // Note: YouTube API doesn't expose a direct "pin" endpoint for regular creators.
    // The creator must manually pin from YouTube Studio after posting.
    // We return the comment ID so the UI can guide them.

    return { youtubeCommentId: commentId }
  }
  catch (err: any) {
    await logger.error('pinned-comment-engine', `Failed to post pinned comment for ${videoId}: ${err.message}`)
    return null
  }
}

export async function detectExistingPinnedComment(videoId: string): Promise<string | null> {
  try {
    const yt = await getAuthenticatedYouTube()

    // Fetch top comments — YouTube API returns pinned first when order=relevance
    const res = await yt.commentThreads.list({
      part: ['snippet'],
      videoId,
      order: 'relevance',
      maxResults: 3,
    })

    const items = res.data.items ?? []
    // Check if first result is from the channel owner (pinned comments are always from owner)
    const channelRes = await yt.channels.list({ part: ['id'], mine: true })
    const ownChannelId = channelRes.data.items?.[0]?.id

    for (const item of items) {
      const authorId = item.snippet?.topLevelComment?.snippet?.authorChannelId?.value
      if (ownChannelId && authorId === ownChannelId) {
        return item.snippet?.topLevelComment?.snippet?.textDisplay ?? null
      }
    }

    return null
  }
  catch {
    return null
  }
}
