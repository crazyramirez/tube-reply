import { useDb } from './server/utils/db'
import { syncLog } from './server/db/schema'
import { desc } from 'drizzle-orm'

async function dumpLogs() {
  const db = useDb()
  const logs = await db.query.syncLog.findMany({
    orderBy: [desc(syncLog.startedAt)],
    limit: 5
  })
  console.log(JSON.stringify(logs, null, 2))
}

dumpLogs().catch(console.error)
