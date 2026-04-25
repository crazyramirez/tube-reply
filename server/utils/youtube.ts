import { google } from 'googleapis'
import { eq } from 'drizzle-orm'
import { useDb } from './db'
import { encrypt, decrypt } from './crypto'
import { logger } from './logger'
import { oauthTokens } from '../db/schema'

const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
]

export function getOAuth2Client() {
  const config = useRuntimeConfig()
  return new google.auth.OAuth2(
    config.youtubeClientId,
    config.youtubeClientSecret,
    config.youtubeRedirectUri,
  )
}

export function getAuthorizationUrl(state: string): string {
  const oauth2 = getOAuth2Client()
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: YOUTUBE_SCOPES,
    state,
    prompt: 'consent', // force refresh_token on every connect
  })
}

export async function exchangeCode(code: string): Promise<{ channelId: string }> {
  const db = useDb()
  const oauth2 = getOAuth2Client()

  const { tokens } = await oauth2.getToken(code)
  oauth2.setCredentials(tokens)

  const youtube = google.youtube({ version: 'v3', auth: oauth2 })
  const channelRes = await youtube.channels.list({
    part: ['id', 'snippet', 'statistics'],
    mine: true,
  })

  const channel = channelRes.data.items?.[0]
  if (!channel?.id) throw new Error('Could not retrieve channel info')

  const channelId = channel.id
  const expiresAt = tokens.expiry_date
    ? new Date(tokens.expiry_date).toISOString()
    : new Date(Date.now() + 3600 * 1000).toISOString()

  await db.insert(oauthTokens).values({
    channelId,
    accessToken: encrypt(tokens.access_token!),
    refreshToken: encrypt(tokens.refresh_token!),
    tokenType: tokens.token_type ?? 'Bearer',
    expiresAt,
    scope: tokens.scope ?? YOUTUBE_SCOPES.join(' '),
    channelTitle: channel.snippet?.title ?? null,
    channelThumbnailUrl: (channel.snippet?.thumbnails?.high?.url || channel.snippet?.thumbnails?.medium?.url || channel.snippet?.thumbnails?.default?.url || null)?.replace('mqdefault.jpg', 'hqdefault.jpg') || null,
    channelSubscriberCount: channel.statistics?.subscriberCount ?? null,
    channelVideoCount: channel.statistics?.videoCount ?? null,
  }).onConflictDoUpdate({
    target: oauthTokens.channelId,
    set: {
      accessToken: encrypt(tokens.access_token!),
      refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
      expiresAt,
      scope: tokens.scope ?? YOUTUBE_SCOPES.join(' '),
      channelTitle: channel.snippet?.title ?? null,
      channelThumbnailUrl: (channel.snippet?.thumbnails?.high?.url || channel.snippet?.thumbnails?.medium?.url || channel.snippet?.thumbnails?.default?.url || null)?.replace('mqdefault.jpg', 'hqdefault.jpg') || null,
      channelSubscriberCount: channel.statistics?.subscriberCount ?? null,
      channelVideoCount: channel.statistics?.videoCount ?? null,
      updatedAt: new Date().toISOString(),
    },
  })

  return { channelId }
}

export async function getAuthenticatedYouTube() {
  const db = useDb()
  const token = await db.query.oauthTokens.findFirst()
  if (!token) throw new Error('YouTube not connected. Please connect your channel first.')

  const oauth2 = getOAuth2Client()
  const expiresAt = new Date(token.expiresAt)

  // Refresh 5 minutes before expiry
  if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    try {
      oauth2.setCredentials({ refresh_token: decrypt(token.refreshToken) })
      const { credentials } = await oauth2.refreshAccessToken()

      const newExpiresAt = credentials.expiry_date
        ? new Date(credentials.expiry_date).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString()

      await db.update(oauthTokens)
        .set({
          accessToken: encrypt(credentials.access_token!),
          expiresAt: newExpiresAt,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(oauthTokens.id, token.id))

      oauth2.setCredentials(credentials)
    }
    catch (err: any) {
      const errorMsg = err?.message || 'Unknown error'
      await logger.error('youtube-auth', `Token refresh failed: ${errorMsg}`, err as Error)
      throw new Error(`YouTube token refresh failed: ${errorMsg}. Please reconnect your channel.`)
    }
  }
  else {
    oauth2.setCredentials({ access_token: decrypt(token.accessToken) })
  }

  return google.youtube({ version: 'v3', auth: oauth2 })
}

export async function getConnectedChannel() {
  const db = useDb()
  const token = await db.query.oauthTokens.findFirst()
  if (!token) return null

  // Return cached metadata — no YouTube API call, zero quota cost
  return {
    id: token.channelId,
    snippet: {
      title: token.channelTitle ?? undefined,
      thumbnails: { default: { url: token.channelThumbnailUrl ?? undefined } },
    },
    statistics: {
      subscriberCount: token.channelSubscriberCount ?? undefined,
      videoCount: token.channelVideoCount ?? undefined,
    },
  }
}

export async function refreshChannelMetadata(): Promise<void> {
  const yt = await getAuthenticatedYouTube()
  const res = await yt.channels.list({ part: ['snippet', 'statistics'], mine: true })
  const channel = res.data.items?.[0]
  if (!channel?.id) return

  const db = useDb()
  await db.update(oauthTokens)
    .set({
      channelTitle: channel.snippet?.title ?? null,
      channelThumbnailUrl: (channel.snippet?.thumbnails?.high?.url || channel.snippet?.thumbnails?.medium?.url || channel.snippet?.thumbnails?.default?.url || null)?.replace('mqdefault.jpg', 'hqdefault.jpg') || null,
      channelSubscriberCount: channel.statistics?.subscriberCount ?? null,
      channelVideoCount: channel.statistics?.videoCount ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(oauthTokens.channelId, channel.id))
}
