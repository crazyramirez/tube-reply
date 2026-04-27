import { runMigrations } from '../utils/migrations'

export default defineNitroPlugin(async () => {
  try {
    await runMigrations()
  } catch (error: any) {
    console.error('✗ Migration plugin failed:', error.message)
  }
})
