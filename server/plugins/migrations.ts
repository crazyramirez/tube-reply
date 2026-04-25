import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

export default defineNitroPlugin(async () => {
  // Solo ejecutamos la sincronización al iniciar el servidor
  console.log('🚀 Starting Intelligent Database Sync...')

  try {
    // Localizamos el ejecutable de drizzle-kit
    const drizzleKitPath = resolve(process.cwd(), 'node_modules/.bin/drizzle-kit')
    
    // Aseguramos que la carpeta de la base de datos existe
    const { dirname } = await import('node:path')
    const { mkdirSync } = await import('node:fs')
    const dbUrl = process.env.DATABASE_URL || './data/youtube.db'
    const dbDir = dirname(resolve(process.cwd(), dbUrl))
    mkdirSync(dbDir, { recursive: true })
    
    console.log(`Ensuring directory exists at: ${dbDir}`)

    // Ejecutamos el "push". 
    // Este comando compara el esquema en código con la DB real y aplica los cambios.
    // Usamos --force para aceptar cambios que no borren datos automáticamente.
    const output = execSync(`${drizzleKitPath} push`, {
      env: {
        ...process.env,
        // Forzamos el uso de la config
        DRIZZLE_CONFIG_PATH: resolve(process.cwd(), 'drizzle.config.ts')
      },
      encoding: 'utf-8'
    })

    console.log('✓ Database Schema synchronized successfully')
    console.log(output)
  } catch (error: any) {
    console.error('✗ Intelligent Sync failed:')
    // Mostramos el error detallado de drizzle-kit
    if (error.stdout) console.error(error.stdout)
    if (error.stderr) console.error(error.stderr)
    
    // No bloqueamos el arranque de la app, pero avisamos
  }
})
