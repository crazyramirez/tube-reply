import { useDb } from '../../utils/db'
import { videos, comments, knowledgeBase } from '../../db/schema'
import { desc, and, isNull } from 'drizzle-orm'
import { getAiProvider } from '../../utils/settings'
import { getGeminiClient } from '../../utils/gemini'
import OpenAI from 'openai'

const SYSTEM_PROMPT = `You are a Knowledge Base generator for a YouTube crochet channel assistant.
Analyze the channel data and generate Knowledge Base entries. Return ONLY a valid JSON array.
Each object: { "type": "faq"|"info"|"style"|"rule", "title": "string (max 80 chars)", "content": "string (max 400 chars)", "priority": number (0-100) }
- faq: frequent user question with canonical answer
- info: factual channel/technique/product data
- style: tone, persona, voice guidelines for replies
- rule: hard AI behavior constraint
Calculate 'priority' (0-100) based on how frequently similar questions/comments appear in the data (frequency) or how essential the information is for the channel's identity and AI behavior (relevance).
Write ALL content in Spanish. Be specific to THIS crochet channel. No markdown, no explanation, only the JSON array.`

export default defineEventHandler(async (event) => {
  const db = useDb()
  const body = await readBody(event)
  const count = Math.min(Math.max(Number(body?.count ?? 10), 1), 30)

  // ─── Gather real channel data ─────────────────────────────────────
  const topVideos = await db.select({
    title: videos.title,
    tags: videos.tags,
    description: videos.description,
  }).from(videos).orderBy(desc(videos.viewCount)).limit(30)

  const topComments = await db.select({
    text: comments.text,
    likeCount: comments.likeCount,
  }).from(comments)
    .where(and(isNull(comments.parentId)))
    .orderBy(desc(comments.likeCount))
    .limit(40)

  const existingKb = await db.select({
    type: knowledgeBase.type,
    title: knowledgeBase.title,
  }).from(knowledgeBase)

  // ─── Build user prompt ────────────────────────────────────────────
  const videoList = topVideos
    .map(v => {
      const tags = v.tags ? JSON.parse(v.tags as string).slice(0, 5).join(', ') : ''
      const excerpt = (v.description ?? '').substring(0, 120).replace(/\n/g, ' ')
      return `- "${v.title}"${tags ? ` [${tags}]` : ''}${excerpt ? ` — ${excerpt}` : ''}`
    })
    .join('\n')

  const commentList = topComments
    .map(c => `- [${c.likeCount}❤] ${c.text.substring(0, 160).replace(/\n/g, ' ')}`)
    .join('\n')

  const existingList = existingKb
    .map(e => `[${e.type}] ${e.title}`)
    .join('\n') || 'None'

  const userPrompt = `Generate exactly ${count} new Knowledge Base entries.

EXISTING ENTRIES (do NOT duplicate these titles):
${existingList}

TOP VIDEOS (by views):
${videoList}

TOP USER COMMENTS (by likes):
${commentList}

Return a JSON array of exactly ${count} objects.`

  // ─── Call AI provider ─────────────────────────────────────────────
  const config = useRuntimeConfig()
  const provider = await getAiProvider()
  let raw = ''

  if (provider === 'gemini') {
    const client = getGeminiClient()
    const model = client.getGenerativeModel({
      model: (config.geminiModel as string) || 'gemini-3-flash-preview',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    })
    const result = await model.generateContent(SYSTEM_PROMPT + '\n\n' + userPrompt)
    raw = result.response.text()
  } else {
    const openai = new OpenAI({ apiKey: config.openaiApiKey as string })
    const resp = await openai.chat.completions.create({
      model: (config.openaiModel as string) || 'gpt-4o-mini',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT + '\nWrap the array in {"entries": [...]}' },
        { role: 'user', content: userPrompt },
      ],
    })
    const parsed = JSON.parse(resp.choices[0].message.content ?? '{}')
    // OpenAI wraps in object when using json_object mode
    raw = JSON.stringify(parsed.entries ?? parsed)
  }

  // ─── Parse & validate ─────────────────────────────────────────────
  let entries: Array<{ type: string; title: string; content: string; priority: number }>
  try {
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(clean)
    entries = Array.isArray(parsed) ? parsed : (parsed.entries ?? [])
    if (!Array.isArray(entries)) throw new Error('Not an array')
  } catch {
    throw createError({ statusCode: 500, statusMessage: `AI returned invalid JSON. Try again.` })
  }

  const VALID_TYPES = new Set(['faq', 'info', 'style', 'rule'])
  const existingTitles = new Set(existingKb.map(e => e.title.toLowerCase()))

  const filtered = entries.filter(e =>
    e &&
    VALID_TYPES.has(e.type) &&
    typeof e.title === 'string' && e.title.trim() &&
    typeof e.content === 'string' && e.content.trim() &&
    !existingTitles.has(e.title.trim().toLowerCase())
  ).map(e => ({
    type: e.type,
    title: e.title.trim().substring(0, 120),
    content: e.content.trim().substring(0, 600),
    priority: Math.min(Math.max(Number(e.priority ?? 0), 0), 100),
  }))

  return { entries: filtered, provider, total: filtered.length }
})
