
import { useDb } from '../../utils/db'
import { sql } from 'drizzle-orm'
import { comments, authors } from '../../db/schema'

export default defineEventHandler(async () => {
  const db = useDb()
  
  try {
    const stats: any = {}
    
    // 1. Total Comments
    const totalComments = await db.run(sql`SELECT COUNT(*) as count FROM comments`)
    stats.totalComments = totalComments.rows[0].count
    
    // 2. Comments with Channel ID
    const withChannelId = await db.run(sql`SELECT COUNT(*) as count FROM comments WHERE author_channel_id IS NOT NULL AND author_channel_id != ''`)
    stats.commentsWithChannelId = withChannelId.rows[0].count
    
    // 3. Comments with Image
    const withImage = await db.run(sql`SELECT COUNT(*) as count FROM comments WHERE author_profile_image_url IS NOT NULL AND author_profile_image_url != ''`)
    stats.commentsWithImage = withImage.rows[0].count
    
    // 4. Unique Authors in Comments
    const uniqueAuthorsInComments = await db.run(sql`SELECT COUNT(DISTINCT author_channel_id) as count FROM comments WHERE author_channel_id IS NOT NULL AND author_channel_id != ''`)
    stats.uniqueAuthorsInComments = uniqueAuthorsInComments.rows[0].count
    
    // 5. Total in Authors Table
    const totalInAuthorsTable = await db.run(sql`SELECT COUNT(*) as count FROM authors`)
    stats.totalInAuthorsTable = totalInAuthorsTable.rows[0].count
    
    // 6. Authors with Image in Master Table
    const authorsWithImage = await db.run(sql`SELECT COUNT(*) as count FROM authors WHERE profile_image_url IS NOT NULL AND profile_image_url != ''`)
    stats.authorsWithImageMaster = authorsWithImage.rows[0].count

    return {
      success: true,
      stats
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    }
  }
})
