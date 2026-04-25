import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as schema from '../db/schema'

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

export function useDb() {
  if (_db) return _db

  const config = useRuntimeConfig()
  const dbUrl = config.dbUrl
  const dbPath = resolve(process.cwd(), dbUrl)
  const dbDir = dirname(dbPath)

  try {
    mkdirSync(dbDir, { recursive: true })
  } catch (err) {
    // Ignorar si ya existe
  }

  if (process.env.NODE_ENV !== 'test') {
    console.log(`[db] Initializing SQLite at: ${dbPath}`)
  }

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  // Custom function: strip diacritics + emojis for accent-insensitive search
  sqlite.function('normalize_text', (text: string | null) => {
    if (!text) return ''
    return text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\p{Extended_Pictographic}/gu, '')
      .toLowerCase()
  })

  _db = drizzle(sqlite, { schema })
  return _db
}
