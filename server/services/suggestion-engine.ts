import { eq, or, and, sql, desc, ne } from 'drizzle-orm'
import { useDb } from '../utils/db'
import * as gemini from '../utils/gemini'
import * as openai from '../utils/openai'
import { getAiProvider, getUserLanguage, getUserLanguageCode } from '../utils/settings'
import { generateVideoSummary } from './video-summary'
import { buildContext, buildPrompt, isYouTubeShort } from './context-builder'
import { logger } from '../utils/logger'
import { comments, suggestedReplies, videos, publishedReplies } from '../db/schema'

interface AIOutput {
  response_text: string
  verification_translation: string
  context_used: {
    kb_entries: string[]
    video_title: string | null
    video_summary_used: boolean
    existing_replies_checked: boolean
    existing_replies_count: number
  }
  confidence: number
  needs_confirmation: boolean
  confirmation_reason: string | null
  video_links_used: Array<{ video_id: string; video_title: string; url: string; thumbnail_url?: string }>
  tone_applied: string
  detected_language: string
}

// ─── Multilingual Stopword List ───────────────────────────────────────────────
const STOPWORDS = new Set([
  'como','donde','cuando','cual','que','quien','cuanto','cuantos','cuanta','cuantas',
  'puedo','puede','quiero','quieres','tiene','tengo','hay','esta','esto','este','eso',
  'para','por','con','sin','del','los','las','una','uno','unos','unas','sus','nuestro',
  'me','te','le','nos','les','se','mi','tu','su','al','el','la','de','en','un',
  'ver','veo','busco','buscar','encontrar','saber','decir','hacer',
  'lo','les','del','al','hola','gracias','favor','porfavor',
  'the','and','for','that','this','with','from','have','are','was','were',
  'where','when','how','what','who','which','can','could','would','should',
  'find','look','watch','see','want','need','know','tell','show','get','your',
  'please','thanks','hello','hey','hi',
  'le','la','les','un','une','des','du','de','et','est','en','que','qui',
  'sur','pour','par','dans','avec','pas','mais','ou','si','je','tu','il',
  'elle','nous','vous','ils','elles','mon','ton','son','mes','tes','ses',
  'bonjour','merci','salut','comment','quand','quel','quelle','quels',
  'voir','trouver','chercher','savoir','pouvoir','vouloir',
  'avez','avons','avaient','etes','suis','tuto','tutoriel','votre','notre',
  'o','a','os','as','um','uma','uns','umas','de','do','da','dos','das',
  'em','no','na','nos','nas','por','para','com','sem','que','quem','qual',
  'quando','onde','como','este','esta','isso','aqui','ali','eu','tu','ele',
  'ela','nos','vos','eles','elas','meu','minha','seu','sua',
  'ola','oi','obrigado','obrigada','por','favor','ve','ver','onde','assistir',
  'procuro','encontrar','quero','preciso','cade','cado','tem','vai','vou','faz','fica',
  'il','lo','la','le','gli','un','uno','una','di','da','in','con','su',
  'per','tra','fra','del','della','dello','dei','degli','delle','al','allo',
  'alla','ai','agli','alle','nel','nello','nella','nei','negli','nelle',
  'questo','questa','questi','queste','quello','quella','quelli','quelle',
  'io','tu','lui','lei','noi','voi','loro','mi','ti','si','ci','vi','ne',
  'ho','hai','ha','abbiamo','avete','hanno','sono','sei','siamo','siete',
  'dove','cosa','chi','quale','quanto',
  'voglio','posso','puoi','cerco','cercare','trovare','vedere','guardare',
  'ciao','grazie','prego','salve','buongiorno','buonasera',
  'video','videos','vídeo','vídeos','clip','reel','short','shorts','tutorial',
])

function normalizeQuery(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u064b-\u065f]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function extractKeywords(query: string): string[] {
  const tokens = normalizeQuery(query).split(/\s+/)
  const seen = new Set<string>()
  const keywords: string[] = []
  for (const token of tokens) {
    if (token.length < 2) continue
    if (STOPWORDS.has(token)) continue
    if (!seen.has(token)) {
      seen.add(token)
      keywords.push(token)
    }
  }
  return keywords
}

function kwLike(kw: string) {
  const pattern = '%' + kw + '%'
  return or(
    sql`normalize_text(${videos.title}) LIKE ${pattern}`,
    sql`normalize_text(${videos.tags})  LIKE ${pattern}`,
    sql`normalize_text(${videos.description}) LIKE ${pattern}`,
  )
}

type VideoRow = {
  id: string
  title: string
  thumbnailUrl: string | null
  duration: string | null
  viewCount: number | null
  commentCount: number | null
}

function scoreRow(row: VideoRow, keywords: string[]): number {
  const nt = normalizeQuery(row.title)
  const nd = normalizeQuery((row as any).description ?? '')
  const ntags = normalizeQuery((row as any).tags ?? '')
  let score = 0
  for (const kw of keywords) {
    if (nt.includes(kw)) score += 10
    if (ntags.includes(kw)) score += 5
    if (nd.includes(kw)) score += 1
  }
  if (keywords.length >= 2) {
    const phrase = keywords.join(' ')
    if (nt.includes(phrase)) score += keywords.length * 5
  }
  const viewBonus = Math.max(0, Math.log10((row.viewCount ?? 0) + 10) - 1) * 0.6
  const commentBonus = Math.max(0, Math.log10((row.commentCount ?? 0) + 10) - 1) * 0.4
  score += viewBonus + commentBonus
  return score
}

async function searchVideos(query: string, excludeVideoId: string): Promise<Array<{ id: string; title: string; thumbnailUrl: string | null; isShort: boolean }>> {
  const db = useDb()
  const keywords = extractKeywords(query)
  if (!keywords.length) return []

  const SELECT_COLS = {
    id: videos.id,
    title: videos.title,
    thumbnailUrl: videos.thumbnailUrl,
    duration: videos.duration,
    viewCount: videos.viewCount,
    commentCount: videos.commentCount,
  }
  const LIMIT = 15

  let rows: VideoRow[] = []

  // ── Strategy 1: AND-strict ──
  if (keywords.length >= 2) {
    const andConditions = keywords.map(kw => kwLike(kw))
    const andRows = await db
      .select(SELECT_COLS)
      .from(videos)
      .where(and(...andConditions, ne(videos.id, excludeVideoId)))
      .orderBy(desc(videos.publishedAt))
      .limit(LIMIT)
    if (andRows.length > 0) rows = andRows
  }

  // ── Strategy 2: OR-any ──
  if (rows.length === 0) {
    const orCondition = or(...keywords.map(kw => kwLike(kw)))!
    const orRows = await db
      .select(SELECT_COLS)
      .from(videos)
      .where(and(orCondition, ne(videos.id, excludeVideoId)))
      .orderBy(desc(videos.publishedAt))
      .limit(LIMIT)
    rows = orRows
  }

  // ── Strategy 3: Fallback ──
  if (rows.length === 0) {
    const seen = new Set<string>()
    const fallbackRows: VideoRow[] = []
    for (const kw of keywords) {
      if (kw.length < 3) continue
      const kwRows = await db
        .select(SELECT_COLS)
        .from(videos)
        .where(and(kwLike(kw), ne(videos.id, excludeVideoId)))
        .orderBy(desc(videos.publishedAt))
        .limit(8)
      for (const r of kwRows) {
        if (!seen.has(r.id)) {
          seen.add(r.id)
          fallbackRows.push(r)
        }
      }
    }
    rows = fallbackRows
  }

  if (rows.length === 0) return []

  const scored = rows.map(r => ({ row: r, score: scoreRow(r, keywords) }))
  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, 10).map(({ row: v }) => ({
    id: v.id,
    title: v.title,
    thumbnailUrl: v.thumbnailUrl,
    isShort: isYouTubeShort(v.duration),
  }))
}

export async function getAiSuggestionRaw(
  commentId: string,
  langOverride: string | null = null,
  additionalContext: string | null = null,
  userLang?: string,
): Promise<{ validated: AIOutput; rawText: string; promptTokens: number; completionTokens: number }> {
  const db = useDb()
  const finalUserLang = userLang || await getUserLanguage()

  const comment = await db.query.comments.findFirst({
    where: eq(comments.id, commentId),
    columns: { videoId: true },
  })
  if (!comment) throw new Error('Comment not found')

  await generateVideoSummary(comment.videoId)

  const ctx = await buildContext(commentId, langOverride, additionalContext)
  const prompt = buildPrompt(ctx, finalUserLang)

  const provider = await getAiProvider()
  const { text: rawText, promptTokens, completionTokens } = provider === 'openai'
    ? await openai.openaiGenerateWithTools(prompt, (q) => searchVideos(q, comment.videoId))
    : await gemini.geminiGenerateWithTools(prompt, (q) => searchVideos(q, comment.videoId))

  let parsed: AIOutput
  try {
    parsed = JSON.parse(rawText) as AIOutput
    const userLangCode = await getUserLanguageCode()
    const detectedBase = parsed.detected_language?.split('-')[0].toLowerCase()
    if (detectedBase === userLangCode) {
      parsed.verification_translation = ''
    }
  } catch {
    throw new Error('AI returned invalid JSON. Please try again.')
  }

  const allVideoRows = await db.select({ id: videos.id, thumbnailUrl: videos.thumbnailUrl }).from(videos)
  const videoMap = new Map(allVideoRows.map(v => [v.id, v.thumbnailUrl]))
  const validated = validateOutput(parsed, new Set(videoMap.keys()))

  validated.video_links_used = validated.video_links_used.map(link => ({
    ...link,
    thumbnail_url: (videoMap.get(link.video_id) ?? link.thumbnail_url ?? undefined)?.replace('mqdefault.jpg', 'hqdefault.jpg') || undefined,
  }))

  return { validated, rawText, promptTokens, completionTokens }
}

export async function generateSuggestion(
  commentId: string,
  langOverride: string | null = null,
  additionalContext: string | null = null,
  userLang?: string,
): Promise<{ suggestionId: number }> {
  const { validated, rawText, promptTokens, completionTokens } = await getAiSuggestionRaw(
    commentId,
    langOverride,
    additionalContext,
    userLang
  )

  const db = useDb()
  const provider = await getAiProvider()
  const config = useRuntimeConfig()
  const modelName = provider === 'openai'
    ? (config.openaiModel as string ?? 'gpt-4o-mini')
    : (config.geminiModel as string ?? 'gemini-3-flash-preview')

  await db.update(suggestedReplies)
    .set({ status: 'rejected' })
    .where(and(
      eq(suggestedReplies.commentId, commentId),
      eq(suggestedReplies.status, 'pending_review')
    ))

  const [inserted] = await db.insert(suggestedReplies).values({
    commentId,
    responseText: validated.response_text,
    verificationTranslation: validated.verification_translation,
    originalGenerated: rawText,
    contextUsed: JSON.stringify(validated.context_used),
    confidenceScore: validated.confidence,
    needsConfirmation: validated.needs_confirmation,
    confirmationReason: validated.confirmation_reason,
    videoLinksUsed: JSON.stringify(validated.video_links_used),
    detectedCommentLang: validated.detected_language,
    modelUsed: `${provider}:${modelName}`,
    promptTokens,
    completionTokens,
    status: 'pending_review',
  }).returning({ id: suggestedReplies.id })

  await db.update(comments)
    .set({ status: 'suggested', processedAt: new Date().toISOString() })
    .where(eq(comments.id, commentId))

  return { suggestionId: inserted.id }
}

function validateOutput(raw: AIOutput, allVideoIds: Set<string>): AIOutput {
  const validatedLinks = (raw.video_links_used ?? []).filter((link) => {
    const isValid = allVideoIds.has(link.video_id)
    return isValid
  })
  const hadHallucination = validatedLinks.length < (raw.video_links_used?.length ?? 0)
  return {
    response_text: raw.response_text ?? '',
    verification_translation: raw.verification_translation ?? raw.response_text ?? '',
    context_used: raw.context_used ?? {
      kb_entries: [],
      video_title: null,
      video_summary_used: false,
      existing_replies_checked: false,
      existing_replies_count: 0,
    },
    confidence: Math.max(0, Math.min(1, raw.confidence ?? 0.5)),
    needs_confirmation: raw.needs_confirmation || hadHallucination,
    confirmation_reason: hadHallucination
      ? `Model referenced video IDs not in database — removed for safety. ${raw.confirmation_reason ?? ''}`
      : (raw.confirmation_reason ?? null),
    video_links_used: validatedLinks,
    tone_applied: raw.tone_applied ?? '',
    detected_language: raw.detected_language ?? 'und',
  }
}
