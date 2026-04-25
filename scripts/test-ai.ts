/**
 * AI TEST SCRIPT
 * 
 * This script allows you to test the AI suggestion engine from the terminal
 * using the exact same parameters and logic as the web application.
 * 
 * USAGE:
 *   npx tsx scripts/test-ai.ts [query] [options]
 * 
 * ARGUMENTS:
 *   query              The comment text to simulate (optional, default: "Como se hace...")
 * 
 * OPTIONS:
 *   -p, --provider     AI provider: 'gemini' or 'openai' (overrides DB setting)
 *   -m, --model        Specific model ID (e.g. 'gpt-4o', 'gemini-3-flash-preview')
 *   -v, --video        Specific Video ID from the database to attach the comment to
 *   -l, --lang         Force the reply language (e.g. 'en', 'es', 'pt')
 *   -c, --context      Additional instructions for the AI (e.g. "be very professional")
 * 
 * EXAMPLES:
 *   # Simple test with default video
 *   npx tsx scripts/test-ai.ts "How do I make a magic ring?"
 * 
 *   # Test with specific video and provider
 *   npx tsx scripts/test-ai.ts "Me encanta el bolso" -v N3oVoGOl89U -p openai
 * 
 *   # Test with additional context and forced language
 *   npx tsx scripts/test-ai.ts "Tutorial please" -l es -c "usa un tono muy alegre"
 * 
 * NOTE: Use scripts/cleanup-tests.ts to remove generated test data from the database.
 */

import dotenv from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// 1. Setup environment
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env') })

// Simple argument parser
const args = process.argv.slice(2)
const getArg = (name: string) => {
  const idx = args.indexOf(name)
  if (idx !== -1 && args[idx + 1]) return args[idx + 1]
  return null
}

const query = args.find(a => !a.startsWith('-')) || 'Como se hace, no encuentro el paso a paso'
const providerArg = getArg('--provider') || getArg('-p')
const modelArg = getArg('--model') || getArg('-m')
const langArg = getArg('--lang') || getArg('-l')
const contextArg = getArg('--context') || getArg('-c')
const videoArg = getArg('--video') || getArg('-v')

// 2. Mock useRuntimeConfig BEFORE importing any project files
// This matches the exact defaults used in server/utils/openai.ts and server/utils/gemini.ts
global.useRuntimeConfig = () => ({
  dbUrl: process.env.DATABASE_URL ?? './data/youtube.db',
  geminiApiKey: process.env.GEMINI_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  geminiModel: modelArg || process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
  openaiModel: modelArg || process.env.OPENAI_MODEL || 'gpt-4o-mini',
  aiProvider: providerArg || process.env.AI_PROVIDER || 'gemini',
})

// 3. Import project services
import { useDb } from '../server/utils/db'
import { generateSuggestion } from '../server/services/suggestion-engine'
import { comments, videos } from '../server/db/schema'
import { eq, desc } from 'drizzle-orm'
import { setSetting } from '../server/utils/settings'

async function main() {
  console.log('--- AI TEST SCRIPT ---')
  console.log(`Query: "${query}"`)
  
  const config = (global as any).useRuntimeConfig()
  
  // If provider is explicitly passed, override it in the DB to ensure getAiProvider() picks it up
  if (providerArg) {
    console.log(`Setting provider to: ${providerArg}`)
    await setSetting('ai_provider', providerArg)
  }

  console.log(`Provider: ${config.aiProvider}`)
  console.log(`Model: ${config.aiProvider === 'openai' ? config.openaiModel : config.geminiModel}`)
  if (langArg) console.log(`Lang Override: ${langArg}`)
  if (contextArg) console.log(`Additional Context: ${contextArg}`)
  if (videoArg) console.log(`Video ID: ${videoArg}`)

  const db = useDb()

  // Find a video to attach the test comment to
  let targetVideo;
  
  if (videoArg) {
    targetVideo = await db.query.videos.findFirst({
      where: eq(videos.id, videoArg)
    })
    if (!targetVideo) {
      console.error(`Video with ID ${videoArg} not found in database.`)
      process.exit(1)
    }
  } else {
    targetVideo = await db.query.videos.findFirst({
      orderBy: [desc(videos.publishedAt)]
    })
  }

  if (!targetVideo) {
    console.error('No videos found in database. Please sync some videos first.')
    process.exit(1)
  }

  console.log(`Using video: ${targetVideo.title} (${targetVideo.id})`)

  // Create a temporary test comment
  const testCommentId = `test_${Date.now()}`
  await db.insert(comments).values({
    id: testCommentId,
    videoId: targetVideo.id,
    text: query,
    authorName: 'Tester',
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'pending',
    detectedLang: 'es'
  })

  console.log(`Created test comment: ${testCommentId}`)

  try {
    console.log('\nGenerating AI suggestion...')
    const startTime = Date.now()
    // Use the exact service function with all parameters
    const { suggestionId } = await generateSuggestion(testCommentId, langArg, contextArg)
    const duration = (Date.now() - startTime) / 1000

    // Fetch the result
    const suggestion = await db.query.suggestedReplies.findFirst({
      where: (table, { eq }) => eq(table.id, suggestionId)
    })

    if (!suggestion) {
      throw new Error('Suggestion not found after generation')
    }

    console.log(`\n--- RESULT (Took ${duration.toFixed(2)}s) ---`)
    console.log(`Model Used: ${suggestion.modelUsed}`)
    console.log(`Tokens: ${suggestion.promptTokens} prompt / ${suggestion.completionTokens} completion`)
    console.log(`Detected Lang: ${suggestion.detectedCommentLang}`)
    console.log(`Confidence: ${(suggestion.confidenceScore * 100).toFixed(0)}%`)
    
    console.log(`\nResponse (Original):`)
    console.log(suggestion.responseText)
    
    if (suggestion.responseEs && suggestion.responseEs !== suggestion.responseText) {
      console.log(`\nResponse (Spanish):`)
      console.log(suggestion.responseEs)
    }

    const contextUsed = JSON.parse(suggestion.contextUsed as string)
    console.log(`\nContext Details:`)
    console.log(`- KB Entries: ${contextUsed.kb_entries?.join(', ') || 'None'}`)
    console.log(`- Video Summary Used: ${contextUsed.video_summary_used}`)
    console.log(`- Existing Replies Count: ${contextUsed.existing_replies_count}`)
    
    const linksUsed = JSON.parse(suggestion.videoLinksUsed as string)
    console.log(`\nLinks Referenced:`)
    if (linksUsed.length === 0) {
      console.log('None')
    } else {
      linksUsed.forEach((l: any) => {
        console.log(`- ${l.video_title} (${l.url})`)
      })
    }

    if (suggestion.needsConfirmation) {
      console.log(`\n[!] NEEDS CONFIRMATION: ${suggestion.confirmationReason}`)
    }

    console.log('\n-----------------------')
    console.log(`Test comment ID: ${testCommentId}`)
    console.log(`Suggestion ID: ${suggestionId}`)
    console.log('You can now see this in the web UI under "Community Voice" if you filter for this video.')

  } catch (err) {
    console.error('\nError during AI generation:', err)
  }
}

main().catch(console.error)
