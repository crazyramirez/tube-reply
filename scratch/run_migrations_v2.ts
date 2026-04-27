
import { resolve } from 'node:path'
import { readFileSync, readdirSync } from 'node:fs'
import Database from 'better-sqlite3'

const dbPath = resolve(process.cwd(), './data/youtube.db')
const migrationsPath = resolve(process.cwd(), 'server/db/migrations')

console.log('Running migrations manually...')
const sqlite = new Database(dbPath)

const files = readdirSync(migrationsPath)
  .filter(f => f.endsWith('.sql'))
  .sort()

for (const file of files) {
  console.log(`Processing: ${file}`)
  const content = readFileSync(resolve(migrationsPath, file), 'utf-8')
  const statements = content.split(/--> statement-breakpoint|;/).filter(s => s.trim())

  for (const statement of statements) {
    const cleanSql = statement.trim()
    if (!cleanSql) continue
    try {
      sqlite.prepare(cleanSql).run()
      console.log(`  SUCCESS: ${cleanSql.substring(0, 50)}...`)
    } catch (err: any) {
      const fullErr = err.toString().toLowerCase()
      const isIgnorable = 
            fullErr.includes('already exists') || 
            fullErr.includes('duplicate column') ||
            fullErr.includes('already has column') ||
            fullErr.includes('already has') ||
            fullErr.includes('table already exists') ||
            fullErr.includes('index already exists')

      if (isIgnorable) {
        console.log(`  SKIPPED (Already exists): ${cleanSql.substring(0, 50)}...`)
      } else {
        console.warn(`  FAILED: ${err.message}`)
        console.warn(`    Statement: ${cleanSql}`)
      }
    }
  }
}
