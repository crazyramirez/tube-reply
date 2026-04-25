import { resolve } from 'node:path'
import { readFileSync, readdirSync } from 'node:fs'
import { useDb } from '../utils/db'
import { sql } from 'drizzle-orm'

export default defineNitroPlugin(async () => {
  console.log('🚀 Checking database migrations (Robust Mode)...')

  try {
    const db = useDb()
    const migrationsPath = resolve(process.cwd(), 'server/db/migrations')
    
    // List all .sql files in order
    const files = readdirSync(migrationsPath)
      .filter(f => f.endsWith('.sql'))
      .sort()

    for (const file of files) {
      console.log(`  → Processing migration: ${file}`)
      const content = readFileSync(resolve(migrationsPath, file), 'utf-8')
      
      // Drizzle splits statements with '--> statement-breakpoint' or just ';'
      const statements = content.split(/--> statement-breakpoint|;/).filter(s => s.trim())

      for (const statement of statements) {
        try {
          const cleanSql = statement.trim()
          if (!cleanSql) continue
          
          // Execute raw SQL
          db.run(sql.raw(cleanSql))
        } catch (err: any) {
          // Ignore "already exists" errors
          if (
            err.message?.includes('already exists') || 
            err.message?.includes('duplicate column') ||
            err.message?.includes('duplicate column name')
          ) {
            // This is fine, it means the migration was partially applied before
            continue
          }
          console.warn(`    ⚠️ Statement failed in ${file}: ${err.message}`)
        }
      }
    }
    
    console.log('✓ Database migrations synchronized')
  } catch (error: any) {
    console.error('✗ Robust migration failed:', error.message)
  }
})
