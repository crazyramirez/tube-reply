import { exchangeCode } from '../../utils/youtube'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { code, state, error } = query as Record<string, string>

  if (error) {
    return sendRedirect(event, '/settings?youtube_error=' + encodeURIComponent(error))
  }

  // Validate state against cookie (CSRF for OAuth)
  const storedState = getCookie(event, 'oauth_state')
  deleteCookie(event, 'oauth_state', { path: '/' })

  if (!state || !storedState || state !== storedState) {
    await logger.warn('youtube-oauth', 'Invalid OAuth state parameter')
    return sendRedirect(event, '/settings?youtube_error=invalid_state')
  }

  if (!code) {
    return sendRedirect(event, '/settings?youtube_error=no_code')
  }

  try {
    const { channelId } = await exchangeCode(code)
    await logger.info('youtube-oauth', 'Channel connected', { channelId })
    return sendRedirect(event, '/settings?youtube_connected=1')
  }
  catch (err) {
    const e = err as Error & { response?: { data?: unknown }; code?: string }
    const detail = JSON.stringify(e.response?.data ?? e.message ?? String(err))
    console.error('[youtube-oauth] Token exchange failed:', detail)
    await logger.error('youtube-oauth', 'Token exchange failed: ' + detail, e)
    return sendRedirect(event, '/settings?youtube_error=' + encodeURIComponent(detail))
  }
})
