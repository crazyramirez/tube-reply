import { useDb } from '../server/utils/db'
import { errorLogs } from '../server/db/schema'
import { desc } from 'drizzle-orm'

async function check() {
  console.log('--- Buscando últimos errores de YouTube ---')
  const db = useDb()
  const logs = await db.query.errorLogs.findMany({
    where: (logs, { eq }) => eq(logs.source, 'youtube-auth'),
    orderBy: [desc(errorLogs.occurredAt)],
    limit: 5
  })

  if (logs.length === 0) {
    console.log('No se encontraron errores de youtube-auth en la base de datos.')
    return
  }

  logs.forEach(log => {
    console.log(`\n[${log.occurredAt}] ${log.message}`)
    console.log(`Detalles: ${log.details}`)
    if (log.stackTrace) console.log(`Stack: ${log.stackTrace.split('\n')[0]}`)
  })
}

check().catch(console.error)
