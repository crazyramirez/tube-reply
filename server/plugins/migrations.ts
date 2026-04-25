import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { resolve } from 'node:path'
import { useDb } from '../utils/db'

export default defineNitroPlugin(async () => {
  // In development, we use 'drizzle-kit push' via the CLI usually.
  // In production, we use the compiled migrations.
  console.log('🚀 Checking database migrations...')

  try {
    const db = useDb()
    
    // Path to the migrations folder. 
    // In Nuxt production, process.cwd() is the root of the .output/server directory or project root.
    // We try to find where the migrations ended up.
    const migrationsPath = resolve(process.cwd(), 'server/db/migrations')
    
    console.log(`Looking for migrations in: ${migrationsPath}`)

    // This will run all pending .sql migrations from the folder
    await migrate(db, { migrationsFolder: migrationsPath })
    
    console.log('✓ Database migrations applied successfully')
  } catch (error: any) {
    console.error('✗ Database migration failed:')
    console.error(error.message)
    
    // Fallback: If migrations folder is missing in production (common Nitro issue), 
    // we could use drizzle-kit push as a backup if it exists, 
    // but the migrate() call is the preferred way.
  }
})
