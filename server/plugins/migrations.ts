import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

export default defineNitroPlugin(async () => {
  // Solo ejecutamos la sincronización al iniciar el servidor
  console.log('🚀 Starting Intelligent Database Sync...')

  try {
    // Localizamos el ejecutable de drizzle-kit
    // Localizamos el ejecutable de drizzle-kit
    const cwd = process.cwd()
    const drizzleKitPath = resolve(cwd, 'node_modules/.bin/drizzle-kit')
    const configPath = resolve(cwd, 'drizzle.config.ts')
    
    // Aseguramos que la carpeta de la base de datos existe
    const { dirname } = await import('node:path')
    const { mkdirSync, existsSync } = await import('node:fs')
    const dbUrl = process.env.DATABASE_URL || './data/youtube.db'
    const dbPath = resolve(cwd, dbUrl)
    const dbDir = dirname(dbPath)
    
    if (!existsSync(dbDir)) {
      console.log(`Creating database directory at: ${dbDir}`)
      mkdirSync(dbDir, { recursive: true })
    }

    if (!existsSync(drizzleKitPath)) {
      console.warn('⚠️ drizzle-kit not found in node_modules. Skipping auto-migration.')
      console.warn('Please run "npx drizzle-kit push" manually if you have database errors.')
      return
    }

    console.log('Running drizzle-kit push...')
    const output = execSync(`"${drizzleKitPath}" push`, {
      env: {
        ...process.env,
        DRIZZLE_CONFIG_PATH: configPath
      },
      encoding: 'utf-8',
      stdio: 'pipe'
    })

    console.log('✓ Database Schema synchronized successfully')
    // console.log(output)
  } catch (error: any) {
    console.error('✗ Intelligent Sync failed:')
    if (error.stdout) console.error('STDOUT:', error.stdout)
    if (error.stderr) console.error('STDERR:', error.stderr)
    console.error('ERROR:', error.message)
  }
})
