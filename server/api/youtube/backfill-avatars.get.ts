import { backfillAuthorsTable, backfillMissingAvatars } from '../../services/comment-sync'

export default defineEventHandler(async () => {
  try {
    console.log('[api] Starting manual massive backfill...')
    
    // 1. Fill the authors table from historical comments
    const authorsFilled = await backfillAuthorsTable()
    
    // 2. Propagate those images back to NULL columns in comments
    const commentsHealed = await backfillMissingAvatars()
    
    return { 
      success: true, 
      message: 'Database healing completed',
      stats: {
        authorsProcessed: authorsFilled,
        commentsHealed: commentsHealed
      }
    }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Backfill failed: ${error.message}`
    })
  }
})
