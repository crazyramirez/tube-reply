import { resolve } from 'node:path'
import { readFileSync, readdirSync } from 'node:fs'
import { useDb } from '../utils/db'
import { sql } from 'drizzle-orm'

export default defineNitroPlugin(async () => {
  console.log('🚀 Checking database migrations (Robust Mode)...')

  try {
    const db = useDb()
    const migrationsPath = resolve(process.cwd(), 'server/db/migrations')
    
    const files = readdirSync(migrationsPath)
      .filter(f => f.endsWith('.sql'))
      .sort()

    for (const file of files) {
      console.log(`  → Checking migration: ${file}`)
      const content = readFileSync(resolve(migrationsPath, file), 'utf-8')
      
      // Split by statement breakpoint or semicolon
      const statements = content.split(/--> statement-breakpoint|;/).filter(s => s.trim())

      for (const statement of statements) {
        const cleanSql = statement.trim()
        if (!cleanSql) continue

        try {
          // Use .run() for better-sqlite3 DDL statements
          db.run(sql.raw(cleanSql))
          
          // Log success for important DDL changes
          const lowerSql = cleanSql.toLowerCase()
          if (lowerSql.includes('alter table') || lowerSql.includes('create table') || lowerSql.includes('create index')) {
            console.log(`    ✅ Applied: ${cleanSql.split('\n')[0].substring(0, 80)}${cleanSql.length > 80 ? '...' : ''}`)
          }
        } catch (err: any) {
          const errMsg = err.message || ''
          const fullErr = err.toString().toLowerCase()
          const causeMsg = err.cause ? String(err.cause).toLowerCase() : ''
          const combined = `${fullErr} ${causeMsg}`
          
          // Ignore "already exists" errors (catch direct SQLite, Drizzle-wrapped, and cause-wrapped errors)
          const isIgnorable = 
            combined.includes('already exists') || 
            combined.includes('duplicate column') ||
            combined.includes('already has column') ||
            combined.includes('already has') ||
            combined.includes('table already exists') ||
            combined.includes('index already exists')
          
          if (!isIgnorable) {
            console.error(`    ❌ Error in ${file}: ${errMsg}`)
            if (causeMsg) console.error(`       Cause: ${causeMsg}`)
            console.error(`       Statement: ${cleanSql.substring(0, 100)}...`)
          }
        }
      }
    }
    
    console.log('✓ Database migrations sync completed')
  } catch (error: any) {
    console.error('✗ Robust migration failed:', error.message)
  }
})
