import { useDb } from '../utils/db'
import { requireSession } from '../utils/session'
import { sql } from 'drizzle-orm'
import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

export default defineEventHandler(async (event) => {
  requireSession(event)

  const config = useRuntimeConfig()
  const db = useDb()
  
  const results: any = {
    timestamp: new Date().toISOString(),
    cwd: process.cwd(),
    env: {
      hasGeminiKey: !!config.geminiApiKey,
      hasOpenAIKey: !!config.openaiApiKey,
      dbUrl: config.dbUrl,
    },
    filesystem: {
      dataDirExists: existsSync(resolve(process.cwd(), 'data')),
      dbFileExists: existsSync(resolve(process.cwd(), config.dbUrl)),
      migrationsDirExists: existsSync(resolve(process.cwd(), 'server/db/migrations')),
    },
    database: {
      tables: [],
      error: null
    }
  }

  try {
    // Check migrations folder content
    if (results.filesystem.migrationsDirExists) {
      results.filesystem.migrationFiles = readdirSync(resolve(process.cwd(), 'server/db/migrations'))
    }

    // Check tables
    const rawTables = (db as any).session.client.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    results.database.tables = rawTables.map((t: any) => t.name)

    // Test write permission
    try {
      (db as any).session.client.prepare("CREATE TABLE IF NOT EXISTS _test_write (id INTEGER PRIMARY KEY)").run();
      (db as any).session.client.prepare("DROP TABLE _test_write").run();
      results.database.writeAccess = true
    } catch (writeErr: any) {
      results.database.writeAccess = false
      results.database.writeError = writeErr.message
    }
  } catch (err: any) {
    results.database.error = err.message
  }

  return results
})
