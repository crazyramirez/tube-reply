import { eq, inArray } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { suggestedReplies, videos } from '../../db/schema'
import { getAiProvider, getUserLanguageCode } from '../../utils/settings'
import * as gemini from '../../utils/gemini'
import * as openai from '../../utils/openai'

export default defineEventHandler(async (event) => {
  const db = useDb()
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const { editedText, userLang = "Spanish" } = body ?? {}

  if (!editedText || typeof editedText !== 'string' || !editedText.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'editedText required' })
  }

  const suggestion = await db.query.suggestedReplies.findFirst({
    where: eq(suggestedReplies.id, id),
  })
  if (!suggestion) throw createError({ statusCode: 404, statusMessage: 'Suggestion not found' })
  if (suggestion.status === 'published') {
    throw createError({ statusCode: 409, statusMessage: 'Cannot edit a published suggestion' })
  }

  // 1. Sync Video Links from text
  const urlRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/g
  const matches = [...editedText.matchAll(urlRegex)]
  const detectedIds = [...new Set(matches.map(m => m[1]))]
  
  let videoLinksUsed = suggestion.videoLinksUsed ? (typeof suggestion.videoLinksUsed === 'string' ? JSON.parse(suggestion.videoLinksUsed) : suggestion.videoLinksUsed) : []
  
  if (detectedIds.length > 0) {
    const videoMetadata = await db.select({
      id: videos.id,
      title: videos.title,
      thumbnailUrl: videos.thumbnailUrl
    })
    .from(videos)
    .where(inArray(videos.id, detectedIds))

    const metaMap = new Map(videoMetadata.map(v => [v.id, v]))
    
    videoLinksUsed = detectedIds.map(vid => {
      const meta = metaMap.get(vid)
      return {
        video_id: vid,
        video_title: meta?.title ?? `Video ${vid}`,
        url: `https://youtu.be/${vid}`,
        thumbnail_url: meta?.thumbnailUrl ?? `https://img.youtube.com/vi/${vid}/mqdefault.jpg`
      }
    })
  } else {
    videoLinksUsed = []
  }

  // 2. Sync Verification Translation
  let verificationTranslation = suggestion.verificationTranslation
  
  // Skip translation if the reply language matches the user's language
  const userLangCode = body.userLangCode || (await getUserLanguageCode())
  const effectiveReplyLang = (body.replyLang || suggestion.detectedCommentLang || '').split('-')[0].toLowerCase()
  
  if (effectiveReplyLang !== userLangCode && editedText.length > 5) {
    try {
      const provider = await getAiProvider()
      const prompt = `Translate the following YouTube comment reply to ${userLang}. 
Maintain the tone and any technical terms. 
Return ONLY the translation, no preamble.

REPLY TO TRANSLATE:
"${editedText}"`

      const aiRes = provider === 'openai'
        ? await openai.openaiGenerate(prompt)
        : await gemini.generateWithRetry(prompt)
      
      verificationTranslation = aiRes.text.trim().replace(/^"|"$/g, '')
    } catch (err) {
      console.error('[suggestion-patch] Translation failed:', err)
    }
  } else {
    // If languages match, we don't need a translation
    verificationTranslation = ''
  }

  await db.update(suggestedReplies)
    .set({ 
      editedText: editedText.trim(), 
      verificationTranslation,
      videoLinksUsed: JSON.stringify(videoLinksUsed),
      reviewedAt: new Date().toISOString() 
    })
    .where(eq(suggestedReplies.id, id))

  return { 
    ok: true, 
    suggestion: { 
      verificationTranslation, 
      videoLinksUsed 
    } 
  }
})
