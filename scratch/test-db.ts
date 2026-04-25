import { useDb } from '../server/utils/db'
import { sql } from 'drizzle-orm'

async function test() {
  const db = useDb()
  try {
    const result = await db.run(sql`SELECT 1 as test`)
    console.log('db.run result:', JSON.stringify(result, null, 2))
    
    // @ts-ignore
    const allResult = await db.all ? await db.all(sql`SELECT 1 as test`) : 'all not available'
    console.log('db.all result:', JSON.stringify(allResult, null, 2))
  } catch (e) {
    console.error(e)
  }
}

test()
