import { eq } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { generateWithRetry } from '../utils/gemini'
import { logger } from '../utils/logger'
import { videos, videoSummaries, videoTranscripts } from '../db/schema'
import { getVideoTranscript } from './captions-service'

export async function generateVideoSummary(videoId: string): Promise<void> {
  const db = useDb()

  // Check if summary already exists
  const existing = await db.query.videoSummaries.findFirst({
    where: eq(videoSummaries.videoId, videoId),
  })
  if (existing) return

  const video = await db.query.videos.findFirst({
    where: eq(videos.id, videoId),
  })
  if (!video) return

  // Try to get transcript ONLY if it's already cached.
  // We don't want to trigger a new YouTube API call here to save quota,
  // unless the transcript was already fetched by context-builder or agent.
  const transcript = await getVideoTranscript(videoId, true)

  const prompt = `Summarize this YouTube video for use as context when replying to comments.
Be concise. Max 400 words. Include:
- Main topic in 1 sentence
- 3-5 key points covered
- Common viewer questions this video might generate
- Any specific links, tools, or resources mentioned

Video title: ${video.title}
Video description: ${(video.description ?? '').substring(0, 3000)}
Video tags: ${video.tags ? (JSON.parse(video.tags) as string[]).join(', ') : 'none'}
${transcript ? `\nVIDEO TRANSCRIPT (spoken content):\n${transcript.substring(0, 8000)}` : ''}

Return ONLY a JSON object with this schema:
{
  "summary": "condensed summary text",
  "key_topics": ["topic1", "topic2", "topic3"],
  "faqs": [{"q": "question", "a": "answer"}]
}`

  try {
    const { text, promptTokens, completionTokens } = await generateWithRetry(prompt)
    const parsed = JSON.parse(text) as { summary: string; key_topics: string[]; faqs: Array<{ q: string; a: string }> }

    await db.insert(videoSummaries).values({
      videoId,
      summary: parsed.summary,
      keyTopics: JSON.stringify(parsed.key_topics ?? []),
      faqs: JSON.stringify(parsed.faqs ?? []),
      generatedBy: 'gemini-3-flash-preview',
      tokenCount: (promptTokens ?? 0) + (completionTokens ?? 0),
    })
  }
  catch (err) {
    await logger.warn('video-summary', `Failed to generate summary for ${videoId}`, { error: (err as Error).message })
  }
}
