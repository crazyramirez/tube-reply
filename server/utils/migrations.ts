import { resolve } from 'node:path'
import { readFileSync, readdirSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { useDb } from './db'

export async function runMigrations() {
  console.log('🚀 Running database migrations...')

  try {
    const db = useDb()
    const migrationsPath = resolve(process.cwd(), 'server/db/migrations')
    
    const files = readdirSync(migrationsPath)
      .filter(f => f.endsWith('.sql'))
      .sort()

    for (const file of files) {
      const content = readFileSync(resolve(migrationsPath, file), 'utf-8')
      
      // Split by statement breakpoint or semicolon
      const statements = content.split(/--> statement-breakpoint|;/).filter(s => s.trim())

      for (const statement of statements) {
        const cleanSql = statement.trim()
        if (!cleanSql) continue

        try {
          // Use .run() for better-sqlite3 DDL statements
          db.run(sql.raw(cleanSql))
        } catch (err: any) {
          const combined = `${err.toString().toLowerCase()} ${err.cause ? String(err.cause).toLowerCase() : ''}`
          
          // Ignore "already exists" errors
          const isIgnorable = 
            combined.includes('already exists') || 
            combined.includes('duplicate column') ||
            combined.includes('already has column') ||
            combined.includes('table already exists') ||
            combined.includes('index already exists')
          
          if (!isIgnorable) {
            console.error(`    ❌ Error in ${file}: ${err.message}`)
          }
        }
      }
    }
    
    console.log('✓ Database migrations completed')
  } catch (error: any) {
    console.error('✗ Migration utility failed:', error.message)
    throw error
  }
}
