import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import * as dotenv from 'dotenv'
import { resolve } from 'node:path'
import { desc, eq } from 'drizzle-orm'

// Cargar .env
dotenv.config()

// Definición mínima de esquema para no depender de otros archivos
const errorLogs = sqliteTable('error_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  level: text('level').notNull(),
  source: text('source').notNull(),
  message: text('message').notNull(),
  details: text('details'),
  occurredAt: text('occurred_at'),
})

async function check() {
  console.log('--- Buscando últimos errores de YouTube ---')
  
  const dbUrl = process.env.DATABASE_URL || './data/youtube.db'
  const dbPath = resolve(process.cwd(), dbUrl)
  console.log(`Usando base de datos en: ${dbPath}`)

  const sqlite = new Database(dbPath)
  const db = drizzle(sqlite)

  const logs = await db.select().from(errorLogs)
    .where(eq(errorLogs.source, 'youtube-auth'))
    .orderBy(desc(errorLogs.id))
    .limit(5)

  if (logs.length === 0) {
    console.log('No se encontraron errores de youtube-auth.')
    return
  }

  logs.forEach(log => {
    console.log(`\n[${log.occurredAt}] ${log.message}`)
    console.log(`Detalles: ${log.details}`)
  })
}

check().catch(err => {
  console.error('Error ejecutando el script:', err)
})
