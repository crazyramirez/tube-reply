import { readBody, getRouterParam } from 'h3'
import { generatePinnedComment, postPinnedComment } from '../../../services/pinned-comment-engine'

export default defineEventHandler(async (event) => {
  const videoId = getRouterParam(event, 'id')!
  const body = await readBody(event).catch(() => ({}))
  const action: 'generate' | 'post' = body?.action ?? 'generate'

  if (action === 'generate') {
    const strategy = body?.strategy ?? 'question'
    const suggestion = await generatePinnedComment(videoId, strategy)
    if (!suggestion) {
      throw createError({ statusCode: 500, message: 'Failed to generate pinned comment suggestion.' })
    }
    return { suggestion }
  }

  if (action === 'post') {
    const text: string = body?.text
    if (!text?.trim()) {
      throw createError({ statusCode: 400, message: 'text is required.' })
    }
    const result = await postPinnedComment(videoId, text.trim())
    if (!result) {
      throw createError({ statusCode: 500, message: 'Failed to post comment to YouTube.' })
    }
    return {
      ...result,
      note: 'Comment posted. Go to YouTube Studio → Comments to pin it (YouTube API does not expose a direct pin endpoint for creators).',
    }
  }

  throw createError({ statusCode: 400, message: 'action must be "generate" or "post".' })
})
