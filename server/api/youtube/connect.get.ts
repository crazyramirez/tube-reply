import { generateToken } from '../../utils/crypto'
import { getAuthorizationUrl } from '../../utils/youtube'

export default defineEventHandler((event) => {
  const state = generateToken(16)

  // Store state in cookie for validation on callback
  setCookie(event, 'oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60, // 10 minutes
  })

  const url = getAuthorizationUrl(state)
  console.log('[youtube/connect] redirect_uri:', useRuntimeConfig().youtubeRedirectUri)
  return { url }
})
