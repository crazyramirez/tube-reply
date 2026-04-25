import { eq, and, gt } from 'drizzle-orm'
import { useDb } from './db'
import { generateToken } from './crypto'
import { sessions } from '../db/schema'
import type { H3Event } from 'h3'

const COOKIE_NAME = 'tubereply_session'

export async function createSession(event: H3Event, ipAddress?: string): Promise<string> {
  const db = useDb()
  const config = useRuntimeConfig()
  const sessionId = generateToken(32)
  const hours = config.sessionDurationHours ?? 24
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()

  await db.insert(sessions).values({
    id: sessionId,
    expiresAt,
    ipAddress: ipAddress ?? null,
    userAgent: getRequestHeader(event, 'user-agent') ?? null,
    isValid: true,
  })

  setCookie(event, COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: hours * 60 * 60,
  })

  return sessionId
}

export async function getAppSession(event: H3Event) {
  const db = useDb()
  const sessionId = getCookie(event, COOKIE_NAME)
  if (!sessionId) return null

  const session = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.id, sessionId),
      eq(sessions.isValid, true),
      gt(sessions.expiresAt, new Date().toISOString()),
    ),
  })

  return session ?? null
}

export async function destroySession(event: H3Event): Promise<void> {
  const db = useDb()
  const sessionId = getCookie(event, COOKIE_NAME)
  if (sessionId) {
    await db.update(sessions)
      .set({ isValid: false })
      .where(eq(sessions.id, sessionId))
  }
  deleteCookie(event, COOKIE_NAME, { path: '/' })
}

export function requireSession(event: H3Event) {
  const sessionId = event.context.sessionId
  if (!sessionId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  return sessionId
}
