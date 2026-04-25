/**
 * SEARCH ENGINE TEST SCRIPT
 *
 * Tests the multilingual keyword extraction + video search engine
 * directly against the database — no AI calls, instant results.
 *
 * USAGE:
 *   npx tsx scripts/test-search.ts [query]
 *   npx tsx scripts/test-search.ts            ← runs all built-in multilingual tests
 *   npx tsx scripts/test-search.ts "blusa"    ← runs a single custom query
 *
 * EXAMPLES:
 *   npx tsx scripts/test-search.ts
 *   npx tsx scripts/test-search.ts "где видео про вязание крючком?"
 *   npx tsx scripts/test-search.ts "où est la vidéo du crochet?"
 */

import dotenv from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { and, or, desc, sql } from 'drizzle-orm'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env') })

global.useRuntimeConfig = () => ({
  dbUrl: process.env.DATABASE_URL ?? './data/youtube.db',
  geminiApiKey: process.env.GEMINI_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  aiProvider: process.env.AI_PROVIDER || 'gemini',
})

import { useDb } from '../server/utils/db'
import { videos } from '../server/db/schema'

// ─── Stopwords (mirror of suggestion-engine.ts) ───────────────────────────────
const STOPWORDS = new Set([
  // Spanish
  'como','donde','cuando','cual','que','quien','cuanto','cuantos','cuanta','cuantas',
  'puedo','puede','quiero','quieres','tiene','tengo','hay','esta','esto','este','eso',
  'para','por','con','sin','del','los','las','una','uno','unos','unas','sus','nuestro',
  'me','te','le','nos','les','se','mi','tu','su','al','el','la','de','en','un',
  'ver','veo','busco','buscar','encontrar','saber','decir','hacer',
  'hola','gracias','favor','porfavor',
  // English
  'the','and','for','that','this','with','from','have','are','was','were',
  'where','when','how','what','who','which','can','could','would','should',
  'find','look','watch','see','want','need','know','tell','show','get','your',
  'please','thanks','hello','hey','hi',
  // French
  'le','la','les','un','une','des','du','de','et','est','en','que','qui',
  'sur','pour','par','dans','avec','pas','mais','ou','si','je','tu','il',
  'elle','nous','vous','ils','elles','mon','ton','son','mes','tes','ses',
  'bonjour','merci','salut','comment','quand','quel','quelle','quels',
  'voir','trouver','chercher','savoir','pouvoir','vouloir',
  // Portuguese / Brazilian
  'o','a','os','as','um','uma','uns','umas','do','da','dos','das',
  'em','no','na','nos','nas','com','sem','quem','qual',
  'quando','onde','este','esta','isso','aqui','ali','eu','ele',
  'ela','vos','eles','elas','meu','minha','seu','sua',
  'ola','oi','obrigado','obrigada','ve','assistir',
  'procuro','quero','preciso',
  'cade','cado','tem','vai','vou','faz','fica',
  // Italian
  'il','lo','la','le','gli','un','uno','una','di','da','in','con','su',
  'per','tra','fra','del','della','dello','dei','degli','delle','al','allo',
  'alla','ai','agli','alle','nel','nello','nella','nei','negli','nelle',
  'questo','questa','questi','queste','quello','quella','quelli','quelle',
  'io','tu','lui','lei','noi','voi','loro','mi','ti','si','ci','vi','ne',
  'ho','hai','ha','abbiamo','avete','hanno','sono','sei','siamo','siete',
  'dove','come','quando','cosa','chi','quale','quanto',
  'voglio','posso','puoi','cerco','cercare','trovare','vedere','guardare',
  'ciao','grazie','prego','salve','buongiorno','buonasera','guarda',
  // Romanian
  'un','o','lui','ei','lor','al','ai','ale','cel','cea','cei','cele',
  'acest','aceasta','acesti','aceste','acel','aceea','acei','acele',
  'si','sau','dar','ci','ori','nici','fie','ca','sa','se','ma','te','va',
  'in','la','pe','de','din','prin','cu','fara','sub','peste','langa',
  'eu','tu','el','ea','noi','voi','ei','ele',
  'am','ai','are','avem','aveti','au','este','esti','suntem','sunteti','sunt',
  'unde','cum','cand','ce','cine','care','cat','cata','cati','cate',
  'vreau','pot','caut','gasesc','gasesti','vedea','viziona',
  'buna','multumesc','salut',
  // Russian (Cyrillic)
  'где','как','когда','что','кто','зачем','почему','этот','эта','это','эти',
  'тот','та','те','мой','моя','моё','мои','твой','твоя','его','её','их',
  'и','в','на','по','за','от','до','из','к','с','о','а','но','не','да',
  'я','ты','он','она','оно','мы','вы','они','хочу','могу','есть','видео',
  'смотреть','найти','посмотреть','привет','спасибо','пожалуйста',
  'про','ли','уже','там','тут','вот','раз','два','три','ещё','вам','нам',
  'если','или','того','этого','тебе','мне','вас','нас','себя','урок','уроки','урока',
  // Arabic (normalized forms, post-NFD)
  'في','من','على','إلى','عن','مع','هذا','هذه','هؤلاء','ذلك','تلك',
  'أنا','أنت','هو','هي','نحن','أنتم','هم','هن','لا','نعم','كيف','أين',
  'متى','ماذا','ما','الذي','التي','الذين','اللاتي','شكرا','مرحبا',
  'أريد','أبحث','أجد','أشاهد','الفيديو',
  'اين','فيديو','هل','عندك','اريد','ابحث','اجد','اشاهد',
  // French extras
  'avez','avons','etes','suis','tuto','tutoriel','votre','notre',
  // Universal noise
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
    if (!seen.has(token)) { seen.add(token); keywords.push(token) }
  }
  return keywords
}

type VideoRow = { id: string; title: string; thumbnailUrl: string | null; duration: string | null }

function scoreRow(row: VideoRow, keywords: string[]): number {
  const nt = normalizeQuery(row.title)
  let score = 0
  for (const kw of keywords) {
    if (nt.includes(kw)) score += 10
  }
  // Phrase-match bonus
  if (keywords.length >= 2) {
    const phrase = keywords.join(' ')
    if (nt.includes(phrase)) score += keywords.length * 5
  }
  return score
}

async function searchVideos(query: string): Promise<{ strategy: string; rows: VideoRow[] }> {
  const db = useDb()
  const keywords = extractKeywords(query)
  if (!keywords.length) return { strategy: 'no-keywords', rows: [] }

  const kwLike = (kw: string) => {
    const pattern = '%' + kw + '%'
    return or(
      sql`normalize_text(${videos.title}) LIKE ${pattern}`,
      sql`normalize_text(${videos.tags})  LIKE ${pattern}`,
      sql`normalize_text(${videos.description}) LIKE ${pattern}`,
    )
  }

  const SELECT_COLS = { id: videos.id, title: videos.title, thumbnailUrl: videos.thumbnailUrl, duration: videos.duration }
  const LIMIT = 15

  // Strategy 1: AND-strict
  if (keywords.length >= 2) {
    const rows = await db.select(SELECT_COLS).from(videos)
      .where(and(...keywords.map(kw => kwLike(kw))))
      .orderBy(desc(videos.publishedAt)).limit(LIMIT)
    if (rows.length > 0) return { strategy: 'AND-strict', rows }
  }

  // Strategy 2: OR-any
  const orRows = await db.select(SELECT_COLS).from(videos)
    .where(or(...keywords.map(kw => kwLike(kw))))
    .orderBy(desc(videos.publishedAt)).limit(LIMIT)
  if (orRows.length > 0) return { strategy: 'OR-any', rows: orRows }

  // Strategy 3: Fallback individual
  const seen = new Set<string>()
  const fallback: VideoRow[] = []
  for (const kw of keywords) {
    if (kw.length < 3) continue
    const kwRows = await db.select(SELECT_COLS).from(videos)
      .where(kwLike(kw)).orderBy(desc(videos.publishedAt)).limit(8)
    for (const r of kwRows) {
      if (!seen.has(r.id)) { seen.add(r.id); fallback.push(r) }
    }
  }
  return { strategy: 'fallback-individual', rows: fallback }
}

// ─── Display helpers ──────────────────────────────────────────────────────────

const RESET  = '\x1b[0m'
const BOLD   = '\x1b[1m'
const DIM    = '\x1b[2m'
const GREEN  = '\x1b[32m'
const YELLOW = '\x1b[33m'
const CYAN   = '\x1b[36m'
const RED    = '\x1b[31m'
const MAGENTA = '\x1b[35m'

function strategyColor(s: string) {
  if (s === 'AND-strict') return GREEN
  if (s === 'OR-any') return YELLOW
  if (s === 'fallback-individual') return MAGENTA
  return RED
}

async function runTest(label: string, comment: string) {
  const keywords = extractKeywords(comment)
  const { strategy, rows } = await searchVideos(comment)

  // Score and sort
  const scored = rows.map(r => ({ r, score: scoreRow(r, keywords) }))
  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, 5)

  const sc = strategyColor(strategy)
  console.log(`\n${BOLD}${CYAN}[${label}]${RESET} ${DIM}${comment}${RESET}`)
  console.log(`  Keywords: ${BOLD}[${keywords.join(', ')}]${RESET}`)
  console.log(`  Strategy: ${sc}${BOLD}${strategy}${RESET}   Results: ${rows.length}`)

  if (top.length === 0) {
    console.log(`  ${RED}✗ No results found${RESET}`)
  } else {
    top.forEach(({ r, score }, i) => {
      const star = i === 0 ? '★' : ' '
      console.log(`  ${star} [score:${score.toString().padStart(3)}] ${r.title} ${DIM}(${r.id})${RESET}`)
    })
  }
}

// ─── Built-in multilingual test suite ────────────────────────────────────────

const TESTS: Array<[string, string]> = [
  // Spanish variants — typos, accents, emojis
  ['ES básico',         'Blusa Lulú'],
  ['ES sin acento',     'Blusa Lulu'],
  ['ES pregunta',       '¿Dónde puedo ver el video de la blusa lulú?'],
  ['ES typo',           'blsa lulu'],
  ['ES emoji',          '😍 blusa lulu por favor'],
  ['ES informal',       'hola! busco lo de la blusa lulú gracias'],
  // English
  ['EN basic',          'Lulu blouse'],
  ['EN question',       'where can I find the lulu blouse video?'],
  ['EN typo',           'lulu bluse tutorial'],
  // French
  ['FR question',       'où est la vidéo du chemisier Lulu ?'],
  ['FR casual',         'vous avez un tuto sur la blouse lulu ?'],
  // Portuguese / Brazilian
  ['PT pergunta',       'onde está o vídeo da blusa lulú?'],
  ['BR gíria',          'oi, cadê o vídeo da blusa lulu?'],
  // Italian
  ['IT domanda',        'dove posso vedere il tutorial della blusa Lulú?'],
  ['IT casual',         'ciao! ho cercato la blusa lulu, dove è?'],
  // Romanian
  ['RO întrebare',       'unde pot vedea tutorialul bluzei Lulu?'],
  ['RO casual',         'buna, caut videoul cu bluza lulu'],
  // Russian
  ['RU вопрос',         'где видео про блузу Лулу?'],
  ['RU casual',         'есть урок по блузке лулу?'],
  // Arabic
  ['AR سؤال',           'أين فيديو البلوزة لولو؟'],
  // Edge cases
  ['Edge: solo emoji',  '🤔❤️😭'],
  ['Edge: solo stops',  'donde como que'],
  ['Edge: número',      'blusa septiembre 2024'],
]

async function main() {
  const customQuery = process.argv.slice(2).find(a => !a.startsWith('-'))

  console.log(`${BOLD}═══════════════════════════════════════════════${RESET}`)
  console.log(`${BOLD}   SEARCH ENGINE TEST — tube-reply${RESET}`)
  console.log(`${BOLD}═══════════════════════════════════════════════${RESET}`)
  console.log(`${DIM}Strategy legend:  ${GREEN}AND-strict${RESET} ${DIM}> ${YELLOW}OR-any${RESET} ${DIM}> ${MAGENTA}fallback-individual${RESET}`)

  if (customQuery) {
    await runTest('CUSTOM', customQuery)
  } else {
    for (const [label, comment] of TESTS) {
      await runTest(label, comment)
    }
  }

  console.log(`\n${BOLD}═══════════════════════════════════════════════${RESET}\n`)
}

main().catch(console.error)
