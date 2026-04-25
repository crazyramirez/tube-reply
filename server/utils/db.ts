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
  const dbPath = resolve(dbUrl)
  const dbDir = dirname(dbPath)

  try {
    console.log(`Initializing database at: ${dbPath}`)
    mkdirSync(dbDir, { recursive: true })
  } catch (err) {
    console.error(`Failed to create database directory at ${dbDir}:`, err)
  }

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  _db = drizzle(sqlite, { schema })
  return _db
}
