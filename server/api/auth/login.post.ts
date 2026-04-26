import bcrypt from 'bcryptjs'
import { eq, and, gt, count, sql } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { createSession } from '../../utils/session'
import { loginAttempts } from '../../db/schema'

function getClientIp(event: Parameters<typeof defineEventHandler>[0] extends (e: infer E) => unknown ? E : never): string {
  return (
    getRequestHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim()
    ?? getRequestHeader(event, 'x-real-ip')
    ?? event.node.req.socket?.remoteAddress
    ?? 'unknown'
  )
}

export default defineEventHandler(async (event) => {
  const db = useDb()
  const config = useRuntimeConfig()
  const ip = getClientIp(event)

  // Check lockout
  const windowMs = config.rateLimitLoginWindowMinutes * 60 * 1000
  const windowStart = new Date(Date.now() - windowMs).toISOString()
  const lockoutUntil = new Date(Date.now() - config.lockoutDurationMinutes * 60 * 1000).toISOString()

  const [{ value: recentFailures }] = await db
    .select({ value: count() })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.ipAddress, ip),
        eq(loginAttempts.success, false),
        sql`datetime(${loginAttempts.attemptedAt}) > datetime(${lockoutUntil})`,
      ),
    )

  if (recentFailures >= config.rateLimitLoginMax) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many failed attempts. Try again later.',
      data: { lockoutMinutes: config.lockoutDurationMinutes },
    })
  }

  const body = await readBody(event)
  const { password } = body ?? {}

  if (!password || typeof password !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Password required' })
  }

  const hash = config.adminPasswordHash
  if (!hash) {
    throw createError({ statusCode: 500, statusMessage: 'Server not configured' })
  }

  const valid = await bcrypt.compare(password, hash)

  // Log attempt
  await db.insert(loginAttempts).values({
    ipAddress: ip,
    success: valid,
    userAgent: getRequestHeader(event, 'user-agent') ?? null,
  })

  if (!valid) {
    // Return generic error — don't leak whether user vs password is wrong
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }

  await createSession(event, ip)
  return { ok: true }
})
