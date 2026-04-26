import type { H3Event } from 'h3'

/**
 * Returns the client IP address.
 * Trusts X-Forwarded-For / X-Real-IP only when TRUST_PROXY=true,
 * otherwise falls back to the actual socket address to prevent IP spoofing.
 */
export function getClientIp(event: H3Event): string {
  const trustProxy = process.env.TRUST_PROXY === 'true'

  if (trustProxy) {
    const xff = getRequestHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim()
    if (xff) return xff
    const xri = getRequestHeader(event, 'x-real-ip')
    if (xri) return xri
  }

  return event.node.req.socket?.remoteAddress ?? 'unknown'
}
