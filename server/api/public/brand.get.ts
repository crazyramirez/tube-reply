import { useDb } from '../../utils/db'
import { oauthTokens } from '../../db/schema'

export default defineEventHandler(async () => {
  try {
    const db = useDb()
    const token = await db.query.oauthTokens.findFirst()
    
    return {
      logoUrl: token?.channelThumbnailUrl || null,
      name: token?.channelTitle || null
    }
  } catch (err) {
    console.error('[brand-api] Error fetching channel info:', err)
    return {
      logoUrl: null,
      name: null
    }
  }
})
