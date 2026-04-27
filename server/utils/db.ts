import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as schema from '../db/schema'

let _sqlite: Database.Database | null = null
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

  _sqlite = new Database(dbPath)
  _sqlite.pragma('journal_mode = WAL')
  _sqlite.pragma('foreign_keys = ON')

  // Custom function: strip diacritics + emojis for accent-insensitive search.
  // Covers: Latin/Greek combining marks (U+0300–U+036F) + Arabic tashkeel (U+064B–U+065F)
  _sqlite.function('normalize_text', (text: string | null) => {
    if (!text) return ''
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')   // Latin/Greek diacritics
      .replace(/[\u064b-\u065f]/g, '')   // Arabic tashkeel (fatha, kasra, shadda, etc.)
      .replace(/\p{Extended_Pictographic}/gu, '')
      .toLowerCase()
  })

  // Relevance scorer: returns a numeric score based on where the keyword matches.
  // title match = 10 pts, tags match = 5 pts, description match = 1 pt.
  // Called from searchVideos for result ranking.
  _sqlite.function('score_relevance', (title: string | null, tags: string | null, description: string | null, keyword: string) => {
    const norm = (s: string | null) => (s ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u064b-\u065f]/g, '')
      .replace(/\p{Extended_Pictographic}/gu, '')
      .toLowerCase()
    const kw = norm(keyword)
    if (!kw) return 0
    let score = 0
    if (norm(title).includes(kw)) score += 10
    if (norm(tags).includes(kw)) score += 5
    if (norm(description).includes(kw)) score += 1
    return score
  })

  _db = drizzle(_sqlite, { schema })
  return _db
}

export function closeDb() {
  if (_sqlite) {
    try {
      _sqlite.close()
    } catch (err) {
      console.error('[db] Error closing SQLite:', err)
    }
    _sqlite = null
    _db = null
  }
}
