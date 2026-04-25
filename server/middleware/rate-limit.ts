import type { H3Event } from 'h3'

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) store.delete(key)
  }
}, 5 * 60 * 1000)

function checkLimit(key: string, max: number, windowMs: number): { allowed: boolean; retryAfter: number } {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfter: 0 }
  }

  entry.count++
  if (entry.count > max) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }

  return { allowed: true, retryAfter: 0 }
}

function getClientIp(event: H3Event): string {
  return (
    getRequestHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim()
    ?? getRequestHeader(event, 'x-real-ip')
    ?? event.node.req.socket?.remoteAddress
    ?? 'unknown'
  )
}

export default defineEventHandler((event) => {
  const path = event.path
  
  // Skip rate limiting for internal Nitro fetches or non-API routes
  if (!path.startsWith('/api/') || getRequestHeader(event, 'x-nitro-internal')) {
    return
  }

  // Skip or relax rate limit for authenticated users (sessions)
  // sessionId is set by auth.ts which runs before this if named correctly
  // but just in case, we can check for the session cookie or header
  const isAuthed = !!event.context.sessionId || !!getCookie(event, 'app_session')

  const ip = getClientIp(event)
  let max = isAuthed ? 20000 : 1000 // Very high limit for authed users
  let windowMs = 15 * 60 * 1000
  let keyPrefix = 'global'

  if (path.startsWith('/api/auth/login')) {
    max = 20
    windowMs = 15 * 60 * 1000
    keyPrefix = 'login'
  }
  else if (path.includes('/suggest')) {
    max = isAuthed ? 2000 : 100 // Allow massive suggestion refreshes
    windowMs = 60 * 60 * 1000
    keyPrefix = 'suggest'
  }
  else if (path.includes('/publish')) {
    max = isAuthed ? 2000 : 100
    windowMs = 60 * 60 * 1000
    keyPrefix = 'publish'
  }

  const key = isAuthed && event.context.sessionId 
    ? `${keyPrefix}:user:${event.context.sessionId}` 
    : `${keyPrefix}:ip:${ip}`

  const { allowed, retryAfter } = checkLimit(key, max, windowMs)

  if (!allowed) {
    setResponseHeader(event, 'Retry-After', String(retryAfter))
    throw createError({
      statusCode: 429,
      statusMessage: 'Too Many Requests',
      data: { retryAfter },
    })
  }
})
