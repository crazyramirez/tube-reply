import { useDb } from '../server/utils/db'
import { appSettings } from '../server/db/schema'
import { eq } from 'drizzle-orm'

async function check() {
  const db = useDb()
  const lang = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, 'language')
  })
  console.log('LANGUAGE SETTING:', lang)
}

check()
