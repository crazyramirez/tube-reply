import { eq, sql } from 'drizzle-orm'
import { useDb } from '../../../../utils/db'
import { agentChats, agentMessages } from '../../../../db/schema'
import { runAgentChat, getChatMessages } from '../../../../services/agent-engine'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid chat ID' })

  const body = await readBody(event)
  const userMessage = body?.message?.trim()
  if (!userMessage) throw createError({ statusCode: 400, statusMessage: 'Message is required' })

  const db = useDb()
  const [chat] = await db.select().from(agentChats).where(eq(agentChats.id, id)).limit(1)
  if (!chat) throw createError({ statusCode: 404, statusMessage: 'Chat not found' })

  const history = await getChatMessages(id)

  // Persist user message
  const [userMsg] = await db.insert(agentMessages).values({
    chatId: id,
    role: 'user',
    content: userMessage,
  }).returning()

  let aiText: string
  let promptTokens = 0
  let completionTokens = 0

  try {
    const result = await runAgentChat(userMessage, history)
    aiText = result.text
    promptTokens = result.promptTokens
    completionTokens = result.completionTokens
  }
  catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'AI generation failed'
    throw createError({ statusCode: 502, statusMessage: msg })
  }

  // Auto-title chat from first user message
  if (history.length === 0) {
    const autoTitle = userMessage.length > 60
      ? userMessage.slice(0, 57) + '…'
      : userMessage
    await db.update(agentChats)
      .set({ title: autoTitle, updatedAt: sql`(datetime('now'))` })
      .where(eq(agentChats.id, id))
  }

  // Persist assistant message
  const [assistantMsg] = await db.insert(agentMessages).values({
    chatId: id,
    role: 'assistant',
    content: aiText,
    metadata: JSON.stringify({ promptTokens, completionTokens, model: useRuntimeConfig().geminiModel }),
  }).returning()

  // Update chat counters
  await db.update(agentChats)
    .set({
      messageCount: (chat.messageCount ?? 0) + 2,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(agentChats.id, id))

  return {
    userMessage: userMsg,
    assistantMessage: assistantMsg,
    usage: { promptTokens, completionTokens },
  }
})
