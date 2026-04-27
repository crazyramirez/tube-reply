import { unlinkSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { closeDb } from '~/server/utils/db'
import { destroySession, getAppSession } from '~/server/utils/session'
import { runMigrations } from '~/server/utils/migrations'

export default defineEventHandler(async (event) => {
  // Ensure the user is authenticated before allowing a reset
  const session = await getAppSession(event)
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 1. Clear the session in the database before deleting it
  await destroySession(event)

  // 2. Close the database connection to release file locks (critical on Windows)
  closeDb()

  // 3. Resolve database path
  const config = useRuntimeConfig()
  const dbUrl = config.dbUrl
  const dbPath = resolve(process.cwd(), dbUrl)
  
  // 4. Delete the main DB file and associated SQLite files
  const filesToDelete = [
    dbPath,
    `${dbPath}-wal`,
    `${dbPath}-shm`
  ]

  let deletedCount = 0
  for (const file of filesToDelete) {
    if (existsSync(file)) {
      try {
        unlinkSync(file)
        console.log(`[reset] Deleted: ${file}`)
        deletedCount++
      } catch (err) {
        console.error(`[reset] Error deleting ${file}:`, err)
      }
    }
  }

  // 5. Re-initialize the database schema so subsequent requests don't fail
  await runMigrations()

  return { 
    success: true, 
    message: 'Application reset successfully',
    filesDeleted: deletedCount
  }
})
