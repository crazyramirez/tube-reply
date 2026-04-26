/**
 * AI TEST SCRIPT
 *
 * Tests the full AI suggestion pipeline from the terminal using the
 * exact same parameters and logic as the web application.
 *
 * USAGE:
 *   npx tsx scripts/test-ai.ts [query] [options]
 *
 * ARGUMENTS:
 *   query              Comment text to simulate (optional — use -L for a language preset)
 *
 * OPTIONS:
 *   -L, --comment-lang Language preset for a pre-built test comment (see table below)
 *   -p, --provider     AI provider: 'gemini' or 'openai' (overrides DB setting)
 *   -m, --model        Model ID (e.g. 'gpt-4o', 'gemini-3-flash-preview')
 *   -v, --video        Specific Video ID to attach the comment to
 *   -l, --lang         Force the REPLY language (e.g. 'en', 'es', 'pt')
 *   -u, --user-lang    User's UI language for verification translation (default: 'Spanish')
 *   -c, --context      Additional AI instructions (e.g. "usa un tono muy alegre")
 *       --list-langs   Show all available language presets and exit
 *
 * LANGUAGE PRESETS (-L flag):
 *   es   ¿Dónde puedo ver el tutorial de la Blusa Lulú?
 *   en   Where can I find the Lulu blouse tutorial?
 *   fr   Où est la vidéo du chemisier Lulu ?
 *   pt   Onde está o vídeo da blusa lulú?
 *   br   Cadê o vídeo da blusa lulu?
 *   it   Dove posso vedere il tutorial della blusa Lulú?
 *   ro   Unde pot vedea tutorialul bluzei Lulu?
 *   ru   где видео про блузу Лулу?
 *   ar   أين فيديو البلوزة لولو؟
 *   de   Wo finde ich das Tutorial zur Lulu Bluse?
 *
 * EXAMPLES:
 *   # Test with a Spanish preset comment
 *   npx tsx scripts/test-ai.ts -L es
 *
 *   # Test with a Russian preset, Gemini provider, reply forced to English
 *   npx tsx scripts/test-ai.ts -L ru -p gemini -l en
 *
 *   # Test Italian preset with OpenAI
 *   npx tsx scripts/test-ai.ts -L it -p openai
 *
 *   # Test a fully custom comment
 *   npx tsx scripts/test-ai.ts "Me encanta el bolso" -v N3oVoGOl89U -p openai
 *
 *   # List all available language presets
 *   npx tsx scripts/test-ai.ts --list-langs
 *
 * NOTE: Use scripts/cleanup-tests.ts to remove test data from the database.
 */

import dotenv from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env') })

// ─── ANSI colors ──────────────────────────────────────────────────────────────
const R  = '\x1b[0m'
const B  = '\x1b[1m'
const DIM = '\x1b[2m'
const CY = '\x1b[36m'
const GR = '\x1b[32m'
const YL = '\x1b[33m'
const MG = '\x1b[35m'
const RD = '\x1b[31m'

// ─── Multilingual comment presets ─────────────────────────────────────────────
const PRESETS: Record<string, { label: string; comment: string; detectedLang: string }> = {
  es: { label: 'Español',    comment: '¿Dónde puedo ver el tutorial de la Blusa Lulú?',         detectedLang: 'es' },
  en: { label: 'English',    comment: 'Where can I find the Lulu blouse tutorial?',             detectedLang: 'en' },
  fr: { label: 'Français',   comment: 'Où est la vidéo du chemisier Lulu ?',                   detectedLang: 'fr' },
  pt: { label: 'Português',  comment: 'Onde está o vídeo da blusa lulú?',                       detectedLang: 'pt' },
  br: { label: 'Brasileiro', comment: 'Cadê o vídeo da blusa lulu?',                            detectedLang: 'pt' },
  it: { label: 'Italiano',   comment: 'Dove posso vedere il tutorial della blusa Lulú?',        detectedLang: 'it' },
  ro: { label: 'Română',     comment: 'Unde pot vedea tutorialul bluzei Lulu?',                 detectedLang: 'ro' },
  ru: { label: 'Русский',    comment: 'где видео про блузу Лулу?',                              detectedLang: 'ru' },
  ar: { label: 'العربية',    comment: 'أين فيديو البلوزة لولو؟',                               detectedLang: 'ar' },
  de: { label: 'Deutsch',    comment: 'Wo finde ich das Tutorial zur Lulu Bluse?',              detectedLang: 'de' },
}

// ─── Argument parsing ─────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const getArg = (name: string) => {
  const idx = args.indexOf(name)
  if (idx !== -1 && args[idx + 1]) return args[idx + 1]
  return null
}

const listLangs  = args.includes('--list-langs')
const langPreset = getArg('--comment-lang') || getArg('-L')
const providerArg = getArg('--provider') || getArg('-p')
const modelArg    = getArg('--model')    || getArg('-m')
const langArg     = getArg('--lang')     || getArg('-l')
const userLangArg = getArg('--user-lang') || getArg('-u') || 'Spanish'
const contextArg  = getArg('--context')  || getArg('-c')
const videoArg    = getArg('--video')    || getArg('-v')
const customQuery = args.find(a => !a.startsWith('-') && a !== (langPreset ?? '') && a !== (providerArg ?? '') && a !== (modelArg ?? '') && a !== (langArg ?? '') && a !== (contextArg ?? '') && a !== (videoArg ?? ''))

// ─── --list-langs early exit ──────────────────────────────────────────────────
if (listLangs) {
  console.log(`\n${B}Available language presets (-L flag):${R}\n`)
  console.log(`  ${'Code'.padEnd(6)} ${'Language'.padEnd(12)} Comment`)
  console.log(`  ${'────'.padEnd(6)} ${'────────'.padEnd(12)} ───────`)
  for (const [code, { label, comment }] of Object.entries(PRESETS)) {
    console.log(`  ${CY}${code.padEnd(6)}${R} ${label.padEnd(12)} ${DIM}${comment}${R}`)
  }
  console.log()
  process.exit(0)
}

// ─── Resolve comment text ─────────────────────────────────────────────────────
let query: string
let presetDetectedLang: string | null = null

if (langPreset) {
  const preset = PRESETS[langPreset.toLowerCase()]
  if (!preset) {
    console.error(`${RD}Unknown language preset: "${langPreset}". Run with --list-langs to see available options.${R}`)
    process.exit(1)
  }
  query = preset.comment
  presetDetectedLang = preset.detectedLang
} else {
  query = customQuery || '¿Dónde puedo ver el tutorial de la Blusa Lulú?'
}

// ─── Mock Nuxt runtime config ─────────────────────────────────────────────────
global.useRuntimeConfig = () => ({
  dbUrl: process.env.DATABASE_URL ?? './data/youtube.db',
  geminiApiKey: process.env.GEMINI_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  geminiModel: modelArg || process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
  openaiModel: modelArg || process.env.OPENAI_MODEL || 'gpt-4o-mini',
  aiProvider: providerArg || process.env.AI_PROVIDER || 'gemini',
})

// ─── Project imports (after runtime config mock) ──────────────────────────────
import { useDb } from '../server/utils/db'
import { generateSuggestion } from '../server/services/suggestion-engine'
import { comments, videos } from '../server/db/schema'
import { eq, desc } from 'drizzle-orm'
import { setSetting } from '../server/utils/settings'

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const config = (global as any).useRuntimeConfig()

  console.log(`\n${B}${CY}══════════════════════════════════════════════${R}`)
  console.log(`${B}${CY}   AI SUGGESTION TEST — tube-reply${R}`)
  console.log(`${B}${CY}══════════════════════════════════════════════${R}`)

  if (langPreset) {
    const preset = PRESETS[langPreset.toLowerCase()]
    console.log(`${B}Preset:${R}   ${CY}${langPreset.toUpperCase()}${R} — ${preset.label}`)
  }
  console.log(`${B}Comment:${R}  "${query}"`)

  if (providerArg) await setSetting('ai_provider', providerArg)

  const provider = config.aiProvider as string
  const model = provider === 'openai' ? config.openaiModel : config.geminiModel
  console.log(`${B}Provider:${R} ${GR}${provider}${R}  ${B}Model:${R} ${GR}${model}${R}`)
  if (langArg)    console.log(`${B}Reply lang override:${R} ${langArg}`)
  if (userLangArg) console.log(`${B}User UI lang:${R} ${userLangArg}`)
  if (contextArg) console.log(`${B}Extra context:${R} ${contextArg}`)
  if (videoArg)   console.log(`${B}Video ID:${R} ${videoArg}`)

  const db = useDb()

  // ─── Find target video ────────────────────────────────────────────────────
  let targetVideo: any
  if (videoArg) {
    targetVideo = await db.query.videos.findFirst({ where: eq(videos.id, videoArg) })
    if (!targetVideo) { console.error(`${RD}Video "${videoArg}" not found.${R}`); process.exit(1) }
  } else {
    targetVideo = await db.query.videos.findFirst({ orderBy: [desc(videos.publishedAt)] })
  }
  if (!targetVideo) { console.error(`${RD}No videos in database. Run a sync first.${R}`); process.exit(1) }
  console.log(`${B}Video:${R}    ${targetVideo.title} ${DIM}(${targetVideo.id})${R}`)

  // ─── Insert temporary test comment ───────────────────────────────────────
  const testCommentId = `test_${Date.now()}`
  await db.insert(comments).values({
    id:          testCommentId,
    videoId:     targetVideo.id,
    text:        query,
    authorName:  'Tester',
    publishedAt: new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
    status:      'pending',
    detectedLang: presetDetectedLang ?? langPreset ?? 'es',
  })

  console.log(`\n${DIM}Generating AI suggestion…${R}`)

  try {
    const t0 = Date.now()
    const { suggestionId } = await generateSuggestion(testCommentId, langArg, contextArg, userLangArg)
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2)

    const sug = await db.query.suggestedReplies.findFirst({
      where: (t, { eq }) => eq(t.id, suggestionId)
    })
    if (!sug) throw new Error('Suggestion record not found after generation')

    const confidence = ((sug.confidenceScore ?? 0) * 100).toFixed(0)
    const confColor  = Number(confidence) >= 80 ? GR : Number(confidence) >= 50 ? YL : RD

    console.log(`\n${B}${CY}── RESULT ────────────────────────────────────${R}`)
    console.log(`${B}Time:${R}         ${elapsed}s`)
    console.log(`${B}Model:${R}        ${sug.modelUsed}`)
    console.log(`${B}Tokens:${R}       ${sug.promptTokens} prompt / ${sug.completionTokens} completion`)
    console.log(`${B}Detected lang:${R} ${sug.detectedCommentLang}`)
    console.log(`${B}Confidence:${R}   ${confColor}${confidence}%${R}`)

    console.log(`\n${B}${GR}▶ Response (${sug.detectedCommentLang}):${R}`)
    console.log(sug.responseText)

    if (sug.verificationTranslation && sug.verificationTranslation !== sug.responseText) {
      console.log(`\n${B}${MG}▶ Verification (${userLangArg}):${R}`)
      console.log(sug.verificationTranslation)
    }

    const ctx   = JSON.parse(sug.contextUsed as string ?? '{}')
    const links = JSON.parse(sug.videoLinksUsed as string ?? '[]')

    console.log(`\n${B}Context used:${R}`)
    console.log(`  KB entries:     ${ctx.kb_entries?.join(', ') || 'none'}`)
    console.log(`  Summary used:   ${ctx.video_summary_used}`)
    console.log(`  Existing replies: ${ctx.existing_replies_count}`)

    console.log(`\n${B}Video links referenced:${R}`)
    if (links.length === 0) {
      console.log(`  ${DIM}none${R}`)
    } else {
      for (const l of links) {
        console.log(`  ${GR}★${R} ${l.video_title}`)
        console.log(`    ${DIM}${l.url}${R}`)
      }
    }

    if (sug.needsConfirmation) {
      console.log(`\n${YL}${B}[!] Needs confirmation:${R} ${sug.confirmationReason}`)
    }

    console.log(`\n${B}${CY}══════════════════════════════════════════════${R}`)
    console.log(`${DIM}Comment ID:    ${testCommentId}${R}`)
    console.log(`${DIM}Suggestion ID: ${suggestionId}${R}`)
    console.log(`${DIM}Visible in UI → Community Voice (filter by this video)${R}\n`)

  } catch (err) {
    console.error(`\n${RD}Error during AI generation:${R}`, err)
  }
}

main().catch(console.error)
