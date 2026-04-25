import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { eq, like } from 'drizzle-orm'
import * as schema from '../server/db/schema'
import dotenv from 'dotenv'
import { join } from 'path'

dotenv.config()

async function upgradeThumbnails() {
  // Use the same logic as server/utils/db.ts
  const dbUrl = process.env.DATABASE_URL || './data/youtube.db'
  const dbPath = join(process.cwd(), dbUrl)
  
  console.log(`Connecting to database at: ${dbPath}`)
  
  const sqlite = new Database(dbPath)
  const db = drizzle(sqlite, { schema })

  try {
    // 1. Upgrade Videos
    console.log('Upgrading video thumbnails...')
    const videosToUpdate = await db.select().from(schema.videos).where(like(schema.videos.thumbnailUrl, '%maxresdefault.jpg%'))
    console.log(`Found ${videosToUpdate.length} videos to update.`)
    
    let videoCount = 0
    for (const video of videosToUpdate) {
      if (video.thumbnailUrl) {
        const newUrl = video.thumbnailUrl.replace('maxresdefault.jpg', 'mqdefault.jpg')
        await db.update(schema.videos)
          .set({ thumbnailUrl: newUrl })
          .where(eq(schema.videos.id, video.id))
        videoCount++
      }
    }
    console.log(`Successfully updated ${videoCount} videos.`)

    // 2. Upgrade OAuth Tokens (Channels)
    console.log('Upgrading channel thumbnails...')
    const tokensToUpdate = await db.select().from(schema.oauthTokens).where(like(schema.oauthTokens.channelThumbnailUrl, '%maxresdefault.jpg%'))
    console.log(`Found ${tokensToUpdate.length} tokens to update.`)

    let tokenCount = 0
    for (const token of tokensToUpdate) {
      if (token.channelThumbnailUrl) {
        const newUrl = token.channelThumbnailUrl.replace('maxresdefault.jpg', 'mqdefault.jpg')
        await db.update(schema.oauthTokens)
          .set({ channelThumbnailUrl: newUrl })
          .where(eq(schema.oauthTokens.id, token.id))
        tokenCount++
      }
    }
    console.log(`Successfully updated ${tokenCount} tokens.`)

    // 3. Upgrade Suggested Replies (JSON)
    console.log('Upgrading thumbnails in suggested replies...')
    const suggestions = await db.select().from(schema.suggestedReplies).where(like(schema.suggestedReplies.videoLinksUsed, '%maxresdefault.jpg%'))
    console.log(`Found ${suggestions.length} suggestions to update.`)

    let suggestionCount = 0
    for (const sug of suggestions) {
      if (sug.videoLinksUsed) {
        try {
          const links = JSON.parse(sug.videoLinksUsed)
          if (Array.isArray(links)) {
            const updatedLinks = links.map((link: any) => {
              if (link.thumbnail_url && link.thumbnail_url.includes('maxresdefault.jpg')) {
                return { ...link, thumbnail_url: link.thumbnail_url.replace('maxresdefault.jpg', 'mqdefault.jpg') }
              }
              return link
            })
            await db.update(schema.suggestedReplies)
              .set({ videoLinksUsed: JSON.stringify(updatedLinks) })
              .where(eq(schema.suggestedReplies.id, sug.id))
            suggestionCount++
          }
        } catch (e) {
          console.error(`Failed to parse/update suggestion ${sug.id}:`, e)
        }
      }
    }
    console.log(`Successfully updated ${suggestionCount} suggestions.`)

    console.log('Upgrade complete!')
  } catch (err) {
    console.error('Error during upgrade:', err)
  } finally {
    sqlite.close()
  }
}

upgradeThumbnails().catch(console.error)
