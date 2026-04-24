import { getAppSession } from '../utils/session'

const PROTECTED_PREFIXES = [
  '/api/comments',
  '/api/suggestions',
  '/api/knowledge-base',
  '/api/videos',
  '/api/dashboard',
  '/api/youtube/sync',
  '/api/youtube/status',
  '/api/youtube/disconnect',
  '/api/youtube/connect',
]

export default defineEventHandler(async (event) => {
  const path = event.path

  if (!PROTECTED_PREFIXES.some(p => path.startsWith(p))) return

  const session = await getAppSession(event)
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  event.context.sessionId = session.id
})
