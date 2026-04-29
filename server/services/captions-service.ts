import { google } from 'googleapis'
import { eq, desc } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { videoTranscripts, videos } from '../db/schema'
import { getAuthenticatedOAuth2 } from '../utils/youtube'
import { getUserLanguageCode } from '../utils/settings'
import { logger } from '../utils/logger'

const MAX_TRANSCRIPT_CHARS = 200_000
const CHUNK_SIZE = 800
const MAX_INJECTED_CHARS = 1_600

// Normalize "es-ES" → "es", "pt-PT" → "pt" for loose matching
const normLang = (lang: string) => lang.split('-')[0].toLowerCase()

// Sentinel transcript text stored when a video has no downloadable captions.
// Prevents repeated YouTube API calls for known-unavailable videos.
const SENTINEL = '__no_captions__'

function parseSrt(srt: string): string {
  const lines = srt.split('\n')
  const textLines: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (/^\d+$/.test(trimmed)) continue
    if (/^\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*/.test(trimmed)) continue
    const clean = trimmed.replace(/<[^>]+>/g, '').trim()
    if (clean) textLines.push(clean)
  }
  return textLines.join(' ').replace(/\s+/g, ' ').trim()
}

async function writeSentinel(videoId: string, status: 'no_captions' | 'forbidden' | 'error', lang = 'und') {
  const db = useDb()
  await db.insert(videoTranscripts).values({
    videoId,
    language: lang,
    transcript: SENTINEL,
    fetchStatus: status,
  }).onConflictDoUpdate({
    target: [videoTranscripts.videoId, videoTranscripts.language],
    set: { fetchStatus: status, fetchedAt: new Date().toISOString() },
  })
}

/**
 * Returns the cached transcript for a video, or fetches it from YouTube.
 * Prefers the user's configured language. Falls back to any cached track.
 * Won't retry videos already known to be unavailable (sentinel row).
 * @param onlyIfCached If true, will NOT trigger a new YouTube API call if missing.
 */
export async function getVideoTranscript(videoId: string, onlyIfCached = false): Promise<string | null> {
  const db = useDb()
  const userLang = await getUserLanguageCode()

  // 1. Prefer cached row matching user's language
  const preferred = await db.query.videoTranscripts.findFirst({
    where: eq(videoTranscripts.videoId, videoId),
    orderBy: [desc(videoTranscripts.fetchedAt)],
  })

  if (preferred) {
    if (preferred.transcript === SENTINEL) return null
    // If it's in user's language or there's no user-lang row, return it
    if (normLang(preferred.language) === normLang(userLang) || preferred.language === 'und') return preferred.transcript
    return preferred.transcript
  }

  // 2. No cached row at all → fetch now with language preference (unless onlyIfCached is true)
  if (onlyIfCached) return null
  return fetchAndCacheTranscript(videoId, userLang)
}

// In-memory lock to prevent multiple concurrent fetches for the same videoId.
const activeFetches = new Map<string, Promise<{ transcript: string | null; quotaUsed: number }>>()

/**
 * Internal fetch that returns both the transcript and the quota units consumed.
 */
export async function fetchAndCacheTranscriptWithQuota(videoId: string, preferredLang?: string): Promise<{ transcript: string | null; quotaUsed: number }> {
  // 1. Check if we are already fetching this video right now
  const active = activeFetches.get(videoId)
  if (active) return active

  const fetchPromise = (async () => {
    const db = useDb()
    const userLang = preferredLang ?? await getUserLanguageCode()

    // 2. Double-check DB (to be safe in concurrent environments)
    const existing = await db.query.videoTranscripts.findFirst({
      where: eq(videoTranscripts.videoId, videoId),
    })
    if (existing) {
      if (existing.transcript === SENTINEL) return { transcript: null, quotaUsed: 0 }
      return { transcript: existing.transcript, quotaUsed: 0 }
    }

    try {
      const oauth2 = await getAuthenticatedOAuth2()
      const youtube = google.youtube({ version: 'v3', auth: oauth2 })

      let tracksRes: Awaited<ReturnType<typeof youtube.captions.list>>
      try {
        tracksRes = await youtube.captions.list({ videoId, part: ['snippet'] })
      }
      catch (err: any) {
        const status = err?.response?.status ?? err?.code
        if (status === 403 || status === 401) {
          await writeSentinel(videoId, 'forbidden', userLang)
          return { transcript: null, quotaUsed: 0 }
        }
        throw err
      }

      const tracks = tracksRes.data.items ?? []
      if (tracks.length === 0) {
        await writeSentinel(videoId, 'no_captions', userLang)
        return { transcript: null, quotaUsed: 50 } // Spent 50 on captions.list
      }

      // Priority: manual+userLang > manual+any > ASR+userLang > ASR+any
      const sorted = [...tracks].sort((a, b) => {
        const aAsr = a.snippet?.trackKind === 'asr' ? 2 : 0
        const bAsr = b.snippet?.trackKind === 'asr' ? 2 : 0
        const aLang = normLang(a.snippet?.language ?? '') === normLang(userLang) ? 0 : 1
        const bLang = normLang(b.snippet?.language ?? '') === normLang(userLang) ? 0 : 1
        return (aAsr + aLang) - (bAsr + bLang)
      })

      const track = sorted[0]
      const trackLang = track.snippet?.language ?? userLang

      if (!track.id) {
        await writeSentinel(videoId, 'no_captions', userLang)
        return { transcript: null, quotaUsed: 50 }
      }

      let raw: string
      try {
        const tokenInfo = await oauth2.getAccessToken()
        const dlRes = await fetch(
          `https://www.googleapis.com/youtube/v3/captions/${track.id}?tfmt=srt`,
          { headers: { Authorization: `Bearer ${tokenInfo.token}` } },
        )
        if (dlRes.status === 403 || dlRes.status === 401) {
          await writeSentinel(videoId, 'forbidden', trackLang)
          await logger.warn('captions-service', `Caption download forbidden for ${videoId} (track: ${track.snippet?.trackKind}, lang: ${trackLang})`)
          return { transcript: null, quotaUsed: 50 }
        }
        if (!dlRes.ok) throw new Error(`Caption download HTTP ${dlRes.status}`)
        raw = await dlRes.text()
      }
      catch (err: any) {
        if (err?.message?.startsWith('Caption download HTTP 40')) {
          await writeSentinel(videoId, 'forbidden', trackLang)
          return { transcript: null, quotaUsed: 50 }
        }
        throw err
      }
      if (!raw?.trim()) {
        await writeSentinel(videoId, 'no_captions', trackLang)
        return { transcript: null, quotaUsed: 50 }
      }

      const transcript = parseSrt(raw).substring(0, MAX_TRANSCRIPT_CHARS)
      if (!transcript) {
        await writeSentinel(videoId, 'no_captions', trackLang)
        return { transcript: null, quotaUsed: 50 }
      }

      await db.insert(videoTranscripts).values({
        videoId,
        language: trackLang,
        trackName: track.snippet?.name ?? null,
        captionId: track.id,
        transcript,
        wordCount: transcript.split(/\s+/).length,
        isAutoGenerated: track.snippet?.trackKind === 'asr',
        fetchStatus: 'ok',
      }).onConflictDoUpdate({
        target: [videoTranscripts.videoId, videoTranscripts.language],
        set: {
          transcript,
          wordCount: transcript.split(/\s+/).length,
          captionId: track.id,
          isAutoGenerated: track.snippet?.trackKind === 'asr',
          fetchStatus: 'ok',
          fetchedAt: new Date().toISOString(),
        },
      })

      return { transcript, quotaUsed: 50 + 200 } // captions.list(50) + captions.download(200)
    }
    catch (err: any) {
      await logger.warn('captions-service', `Transcript fetch failed for ${videoId}: ${err.message}`)
      await writeSentinel(videoId, 'error', userLang)
      return { transcript: null, quotaUsed: 50 } // Still spent on captions.list
    }
  })()

  activeFetches.set(videoId, fetchPromise)
  try {
    return await fetchPromise
  } finally {
    activeFetches.delete(videoId)
  }
}

/**
 * Batch-fetches transcripts for all videos that don't yet have a cached result.
 * Processes up to `limit` videos with a `delayMs` gap between requests to
 * avoid hammering the YouTube quota.
 * Returns a summary: { ok, no_captions, forbidden, error, skipped }
 */
export async function batchFetchTranscripts(
  limit = 50,
  delayMs = 1500,
): Promise<{ ok: number; no_captions: number; forbidden: number; error: number; skipped: number; quotaUsed: number }> {
  const userLang = await getUserLanguageCode()
  const db = useDb()

  // IDs of videos that already have ANY transcript row (including sentinels)
  const alreadyProcessed = await db
    .selectDistinct({ videoId: videoTranscripts.videoId })
    .from(videoTranscripts)

  const processedIds = new Set(alreadyProcessed.map(r => r.videoId))

  const allVideos = await db.query.videos.findMany({
    columns: { id: true },
    orderBy: [desc(videos.publishedAt)],
    limit: limit + processedIds.size, // fetch extra to account for already-processed
  })

  const pending = allVideos
    .map(v => v.id)
    .filter(id => !processedIds.has(id))
    .slice(0, limit)

  const counts = { 
    ok: 0, 
    no_captions: 0, 
    forbidden: 0, 
    error: 0, 
    skipped: processedIds.size,
    quotaUsed: 0 
  }

  for (const videoId of pending) {
    const { transcript: result, quotaUsed } = await fetchAndCacheTranscriptWithQuota(videoId, userLang)
    counts.quotaUsed += quotaUsed

    // Check what status was written
    const row = await db.query.videoTranscripts.findFirst({
      where: eq(videoTranscripts.videoId, videoId),
      columns: { fetchStatus: true },
    })
    const status = (row?.fetchStatus ?? (result ? 'ok' : 'error')) as string
    if (status === 'ok') counts.ok++
    else if (status === 'no_captions') counts.no_captions++
    else if (status === 'forbidden') counts.forbidden++
    else counts.error++

    if (delayMs > 0 && pending.indexOf(videoId) < pending.length - 1) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }

  return counts
}

// Keep original signature for compatibility if used elsewhere
export async function fetchAndCacheTranscript(videoId: string, preferredLang?: string): Promise<string | null> {
  const { transcript } = await fetchAndCacheTranscriptWithQuota(videoId, preferredLang)
  return transcript
}

/**
 * Keyword-based RAG: extract only the transcript segment most relevant to a comment.
 * Returns null for intents that don't benefit from transcript context.
 */
export function findRelevantTranscriptExcerpt(
  transcript: string | null,
  commentText: string,
  intent: string,
): string | null {
  if (!transcript || transcript === SENTINEL) return null
  if (!['question', 'help_needed', 'video_request', 'complaint'].includes(intent)) return null

  const STOPWORDS = new Set([
    'como', 'donde', 'cuando', 'what', 'where', 'when', 'how', 'that', 'this', 'with',
    'from', 'have', 'para', 'que', 'del', 'una', 'los', 'las', 'the', 'and', 'for', 'you', 'your',
  ])
  const keywords = commentText
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOPWORDS.has(w))
    .slice(0, 8)

  const chunks: string[] = []
  for (let i = 0; i < transcript.length; i += CHUNK_SIZE) {
    chunks.push(transcript.substring(i, i + CHUNK_SIZE))
  }
  if (chunks.length === 0) return null

  const scored = chunks.map((chunk, idx) => {
    const lower = chunk.toLowerCase()
    let score = 0
    for (const kw of keywords) {
      if (lower.includes(kw)) score += 3
    }
    return { idx, score }
  })

  const best = scored.sort((a, b) => b.score - a.score)[0]

  if (best.score === 0) return transcript.substring(0, CHUNK_SIZE)

  const start = Math.max(0, (best.idx - 1) * CHUNK_SIZE)
  const end = Math.min(transcript.length, (best.idx + 2) * CHUNK_SIZE)
  const excerpt = transcript.substring(start, end)
  return excerpt.length > MAX_INJECTED_CHARS ? excerpt.substring(0, MAX_INJECTED_CHARS) : excerpt
}

export async function getTranscriptMeta(videoId: string) {
  const db = useDb()
  const row = await db.query.videoTranscripts.findFirst({
    where: eq(videoTranscripts.videoId, videoId),
    columns: { id: true, language: true, wordCount: true, isAutoGenerated: true, fetchedAt: true, fetchStatus: true },
  })
  return row ?? null
}
