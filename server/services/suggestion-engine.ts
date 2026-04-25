import { eq, or, and, sql, desc } from 'drizzle-orm'
import { useDb } from '../utils/db'
import * as gemini from '../utils/gemini'
import * as openai from '../utils/openai'
import { getAiProvider } from '../utils/settings'
import { generateVideoSummary } from './video-summary'
import { buildContext, buildPrompt, isYouTubeShort } from './context-builder'
import { logger } from '../utils/logger'
import { comments, suggestedReplies, videos, publishedReplies } from '../db/schema'

interface AIOutput {
  response_text: string
  response_es: string
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

export async function generateSuggestion(commentId: string, langOverride: string | null = null, additionalContext: string | null = null): Promise<{ suggestionId: number }> {
  const db = useDb()

  const existing = await db.query.publishedReplies.findFirst({
    where: eq(publishedReplies.commentId, commentId),
  })
  if (existing) throw new Error('Comment already has a published reply')

  const comment = await db.query.comments.findFirst({
    where: eq(comments.id, commentId),
    columns: { videoId: true },
  })
  if (!comment) throw new Error('Comment not found')

  await generateVideoSummary(comment.videoId)

  const ctx = await buildContext(commentId, langOverride, additionalContext)
  const prompt = buildPrompt(ctx)

  // ─── Multilingual Stopword List ───────────────────────────────────────────────
  // Covers: ES, EN, FR, PT/BR, IT, RO, RU (Cyrillic), AR
  const STOPWORDS = new Set([
    // ── Spanish ──
    'como','donde','cuando','cual','que','quien','cuanto','cuantos','cuanta','cuantas',
    'puedo','puede','quiero','quieres','tiene','tengo','hay','esta','esto','este','eso',
    'para','por','con','sin','del','los','las','una','uno','unos','unas','sus','nuestro',
    'me','te','le','nos','les','se','mi','tu','su','al','el','la','de','en','un',
    'ver','veo','busco','buscar','encontrar','saber','decir','hacer',
    'lo','lo','les','del','al',
    'hola','gracias','favor','porfavor',
    // ── English ──
    'the','and','for','that','this','with','from','have','are','was','were',
    'where','when','how','what','who','which','can','could','would','should',
    'find','look','watch','see','want','need','know','tell','show','get','your',
    'please','thanks','hello','hey','hi',
    // ── French ──
    'le','la','les','un','une','des','du','de','et','est','en','que','qui',
    'sur','pour','par','dans','avec','pas','mais','ou','si','je','tu','il',
    'elle','nous','vous','ils','elles','mon','ton','son','mes','tes','ses',
    'bonjour','merci','salut','ou','comment','quand','quel','quelle','quels',
    'voir','trouver','chercher','savoir','pouvoir','vouloir',
    'avez','avons','avaient','etes','suis','tuto','tutoriel','votre','notre',
    // ── Portuguese / Brazilian ──
    'o','a','os','as','um','uma','uns','umas','de','do','da','dos','das',
    'em','no','na','nos','nas','por','para','com','sem','que','quem','qual',
    'quando','onde','como','este','esta','isso','aqui','ali','eu','tu','ele',
    'ela','nos','vos','eles','elas','meu','minha','seu','sua',
    'ola','oi','obrigado','obrigada','por','favor','ve','ver','onde','assistir',
    'procuro','encontrar','quero','preciso',
    'cade','cado','tem','vai','vou','faz','fica',
    // ── Italian ──
    'il','lo','la','le','gli','un','uno','una','di','da','in','con','su',
    'per','tra','fra','del','della','dello','dei','degli','delle','al','allo',
    'alla','ai','agli','alle','nel','nello','nella','nei','negli','nelle',
    'questo','questa','questi','queste','quello','quella','quelli','quelle',
    'io','tu','lui','lei','noi','voi','loro','mi','ti','si','ci','vi','ne',
    'ho','hai','ha','abbiamo','avete','hanno','sono','sei','siamo','siete',
    'dove','come','quando','cosa','chi','quale','quanto',
    'voglio','posso','puoi','cerco','cercare','trovare','vedere','guardare',
    'ciao','grazie','prego','salve','buongiorno','buonasera',
    'video','video','tutorial','guarda',
    // ── Romanian ──
    'un','o','lui','ei','lor','al','ai','ale','cel','cea','cei','cele',
    'acest','aceasta','acesti','aceste','acel','aceea','acei','acele',
    'si','sau','dar','ci','ori','nici','fie','ca','sa','se','ma','te','va',
    'in','la','pe','de','din','prin','cu','fara','sub','peste','langa',
    'eu','tu','el','ea','noi','voi','ei','ele',
    'am','ai','are','avem','aveti','au','este','esti','suntem','sunteti','sunt',
    'unde','cum','cand','ce','cine','care','cat','cata','cati','cate',
    'vreau','pot','caut','caut','gasesc','gasesti','vedea','viziona',
    'buna','multumesc','salut','hello',
    'video','tutorial',
    // ── Russian (Cyrillic) ──
    'где','как','когда','что','кто','зачем','почему','этот','эта','это','эти',
    'тот','та','те','мой','моя','моё','мои','твой','твоя','его','её','их',
    'и','в','на','по','за','от','до','из','к','с','о','а','но','не','да',
    'я','ты','он','она','оно','мы','вы','они','хочу','могу','есть','видео',
    'смотреть','найти','посмотреть','привет','спасибо','пожалуйста',
    'про','ли','уже','там','тут','вот','раз','два','три','ещё','вам','нам',
    'если','или','того','этого','тебе','мне','вас','нас','себя','кто',
    'урок','уроки','урока',
    // ── Arabic (normalized forms without hamza/alef marks) ──
    'في','من','على','إلى','عن','مع','هذا','هذه','هؤلاء','ذلك','تلك',
    'أنا','أنت','هو','هي','نحن','أنتم','هم','هن','لا','نعم','كيف','أين',
    'متى','ماذا','ما','الذي','التي','الذين','اللاتي','شكرا','مرحبا',
    'أريد','أبحث','أجد','أشاهد','الفيديو',
    'اين','فيديو','هل','عندك','كيف','اريد','ابحث','اجد','اشاهد',
    // ── Universal noise ──
    'video','videos','vídeo','vídeos','clip','reel','short','shorts','tutorial',
  ])

  /**
   * Normalizes text for keyword extraction and DB matching:
   * NFD decompose → strip Latin diacritics → strip Arabic tashkeel →
   * strip emojis → collapse non-letter/non-digit chars → lowercase → collapse spaces.
   * Works correctly for ES, EN, FR, PT/BR, RU (Cyrillic), AR.
   */
  function normalizeQuery(text: string): string {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')        // Latin/Greek diacritics
      .replace(/[\u064b-\u065f]/g, '')        // Arabic tashkeel
      .replace(/\p{Extended_Pictographic}/gu, ' ') // emojis → space
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')       // punctuation/symbols → space
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Extracts meaningful keywords from a user query:
   * 1. Normalizes text
   * 2. Removes stopwords
   * 3. Filters tokens by minimum length (≥ 2 chars)
   * Returns the unique keyword set, preserving query order.
   */
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

  /**
   * Builds a normalized LIKE pattern for a single keyword.
   */
  function kwLike(kw: string) {
    const pattern = '%' + kw + '%'
    return or(
      sql`normalize_text(${videos.title}) LIKE ${pattern}`,
      sql`normalize_text(${videos.tags})  LIKE ${pattern}`,
      sql`normalize_text(${videos.description}) LIKE ${pattern}`,
    )
  }

  type VideoRow = { id: string; title: string; thumbnailUrl: string | null; duration: string | null }

  /**
   * Scores a video row against a list of keywords.
   * Title hit = 10 pts, tags hit = 5 pts, description hit = 1 pt.
   * Bonus +5 per keyword that is consecutive in the title (phrase match).
   */
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
    // Phrase-match bonus: reward titles where ALL keywords appear together
    if (keywords.length >= 2) {
      const phrase = keywords.join(' ')
      if (nt.includes(phrase)) score += keywords.length * 5
    }
    return score
  }

  /**
   * Advanced multi-strategy video search:
   *   Strategy 1 — AND-strict:  all keywords must match (any field each)
   *   Strategy 2 — OR-any:      any keyword matches in title/tags/description
   *   Strategy 3 — Fallback:    each keyword individually, union of results
   * Results are scored by relevance (title > tags > desc) and deduplicated.
   */
  async function searchVideos(query: string): Promise<Array<{ id: string; title: string; thumbnailUrl: string | null; isShort: boolean }>> {
    const keywords = extractKeywords(query)
    console.log(`[search] query="${query}" → keywords: [${keywords.join(', ')}]`)
    if (!keywords.length) return []

    const SELECT_COLS = {
      id: videos.id,
      title: videos.title,
      thumbnailUrl: videos.thumbnailUrl,
      duration: videos.duration,
    }
    const LIMIT = 15

    let rows: VideoRow[] = []

    // ── Strategy 1: AND-strict (every keyword must appear somewhere) ──────────
    if (keywords.length >= 2) {
      const andConditions = keywords.map(kw => kwLike(kw))
      const andRows = await db
        .select(SELECT_COLS)
        .from(videos)
        .where(and(...andConditions))
        .orderBy(desc(videos.publishedAt))
        .limit(LIMIT)
      if (andRows.length > 0) {
        console.log(`[search] AND-strict → ${andRows.length} results`)
        rows = andRows
      }
    }

    // ── Strategy 2: OR-any (at least one keyword matches) ────────────────────
    if (rows.length === 0) {
      const orCondition = or(...keywords.map(kw => kwLike(kw)))!
      const orRows = await db
        .select(SELECT_COLS)
        .from(videos)
        .where(orCondition)
        .orderBy(desc(videos.publishedAt))
        .limit(LIMIT)
      console.log(`[search] OR-any → ${orRows.length} results`)
      rows = orRows
    }

    // ── Strategy 3: Individual keyword fallback (union, deduplicated) ─────────
    if (rows.length === 0) {
      const seen = new Set<string>()
      const fallbackRows: VideoRow[] = []
      for (const kw of keywords) {
        if (kw.length < 3) continue
        const kwRows = await db
          .select(SELECT_COLS)
          .from(videos)
          .where(kwLike(kw))
          .orderBy(desc(videos.publishedAt))
          .limit(8)
        for (const r of kwRows) {
          if (!seen.has(r.id)) {
            seen.add(r.id)
            fallbackRows.push(r)
          }
        }
      }
      console.log(`[search] Fallback-individual → ${fallbackRows.length} results`)
      rows = fallbackRows
    }

    if (rows.length === 0) return []

    // ── Score & rank by relevance ─────────────────────────────────────────────
    const scored = rows.map(r => ({ row: r, score: scoreRow(r, keywords) }))
    scored.sort((a, b) => b.score - a.score)

    return scored.slice(0, 10).map(({ row: v }) => ({
      id: v.id,
      title: v.title,
      thumbnailUrl: v.thumbnailUrl,
      isShort: isYouTubeShort(v.duration),
    }))
  }

  const provider = await getAiProvider()
  console.log(`[suggestion-engine] Using provider: ${provider}`)

  const { text: rawText, promptTokens, completionTokens } = provider === 'openai'
    ? await openai.openaiGenerateWithTools(prompt, searchVideos)
    : await gemini.geminiGenerateWithTools(prompt, searchVideos)

  let parsed: AIOutput
  try {
    parsed = JSON.parse(rawText) as AIOutput
    console.log(`[suggestion-engine] Parsed links:`, JSON.stringify(parsed.video_links_used, null, 2))
  }
  catch {
    console.error(`[suggestion-engine] Raw ${provider} output:`, rawText.substring(0, 1000))
    await logger.error('suggestion-engine', `Failed to parse ${provider} JSON`, undefined, { rawText: rawText.substring(0, 1000) })
    throw new Error('AI returned invalid JSON. Please try again.')
  }

  // Validate against full DB — tool may have returned videos not in ctx.recentVideos
  const allVideoRows = await db.select({ id: videos.id, thumbnailUrl: videos.thumbnailUrl }).from(videos)
  const videoMap = new Map(allVideoRows.map(v => [v.id, v.thumbnailUrl]))
  const validated = validateOutput(parsed, new Set(videoMap.keys()))

  // Enrich with thumbnails from DB to ensure accuracy
  validated.video_links_used = validated.video_links_used.map(link => ({
    ...link,
    thumbnail_url: (videoMap.get(link.video_id) ?? link.thumbnail_url ?? null)?.replace('mqdefault.jpg', 'hqdefault.jpg') || null,
  }))

  const config = useRuntimeConfig()
  const modelName = provider === 'openai'
    ? (config.openaiModel as string ?? 'gpt-4o-mini')
    : (config.geminiModel as string ?? 'gemini-3-flash-preview')

  // Mark previous pending suggestions as rejected
  await db.update(suggestedReplies)
    .set({ status: 'rejected' })
    .where(and(
      eq(suggestedReplies.commentId, commentId),
      eq(suggestedReplies.status, 'pending_review')
    ))

  const [inserted] = await db.insert(suggestedReplies).values({
    commentId,
    responseText: validated.response_text,
    responseEs: validated.response_es,
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
    if (!isValid) {
      console.warn(`[suggestion-engine] Hallucinated video ID removed: ${link.video_id}`)
    }
    return isValid
  })

  const hadHallucination = validatedLinks.length < (raw.video_links_used?.length ?? 0)

  return {
    response_text: raw.response_text ?? '',
    response_es: raw.response_es ?? raw.response_text ?? '',
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
