const CSRF_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

// These endpoints are exempt: login uses password auth, callback uses state param
const CSRF_EXEMPT = [
  '/api/auth/login',
  '/api/youtube/callback',
]

export default defineEventHandler((event) => {
  if (!CSRF_METHODS.has(event.method)) return
  if (CSRF_EXEMPT.some(p => event.path.startsWith(p))) return

  const headerToken = getRequestHeader(event, 'x-csrf-token')
  const cookieToken = getCookie(event, 'csrf_token')

  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    throw createError({ statusCode: 403, statusMessage: 'CSRF validation failed' })
  }
})
