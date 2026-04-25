import { useDb } from '../../utils/db'
import { knowledgeBase } from '../../db/schema'

const VALID_TYPES = ['faq', 'style', 'info', 'rule'] as const

export default defineEventHandler(async (event) => {
  const db = useDb()
  const body = await readBody(event)
  const { type, title, content, tags, priority } = body ?? {}

  if (!type || !VALID_TYPES.includes(type)) {
    throw createError({ statusCode: 400, statusMessage: `type must be one of: ${VALID_TYPES.join(', ')}` })
  }
  if (!title?.trim()) throw createError({ statusCode: 400, statusMessage: 'title required' })
  if (!content?.trim()) throw createError({ statusCode: 400, statusMessage: 'content required' })

  const [entry] = await db.insert(knowledgeBase).values({
    type,
    title: title.trim(),
    content: content.trim(),
    tags: tags ? JSON.stringify(tags) : null,
    priority: Number(priority ?? 0),
    isActive: true,
  }).returning()

  return entry
})
