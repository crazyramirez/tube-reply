import { useDb } from './db'
import { errorLogs } from '../db/schema'

type LogLevel = 'info' | 'warn' | 'error' | 'fatal'

async function log(level: LogLevel, source: string, message: string, details?: unknown, error?: Error) {
  try {
    const db = useDb()
    await db.insert(errorLogs).values({
      level,
      source,
      message,
      details: details ? JSON.stringify(details) : null,
      stackTrace: error?.stack ?? null,
    })
    console.log(`[${level.toUpperCase()}] [${source}] ${message}`, details ?? "")
  }
  catch {
    // Fallback to console if DB is unavailable
    console.error(`[${level.toUpperCase()}] [${source}] ${message}`, details)
  }
}

export const logger = {
  info: (source: string, message: string, details?: unknown) => log('info', source, message, details),
  warn: (source: string, message: string, details?: unknown) => log('warn', source, message, details),
  error: (source: string, message: string, error?: Error, details?: unknown) => log('error', source, message, details, error),
  fatal: (source: string, message: string, error?: Error, details?: unknown) => log('fatal', source, message, details, error),
}
