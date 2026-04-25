import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { useDb } from '../utils/db'
import { join } from 'node:path'

export default defineNitroPlugin(async () => {
  try {
    const db = useDb()
    
    // Ruta a las migraciones
    const migrationsFolder = process.dev 
      ? './server/db/migrations' 
      : join(process.cwd(), 'server/db/migrations')

    console.log('Checking database migrations...')
    
    // Ejecutamos la migración de forma síncrona para better-sqlite3
    migrate(db, { migrationsFolder })
    
    console.log('✓ Database is up to date')
  } catch (error) {
    console.error('✗ Migration failed during startup:', error)
  }
})
