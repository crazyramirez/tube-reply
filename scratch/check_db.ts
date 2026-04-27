
import { db } from './server/utils/db'
import { comments } from './server/db/schema'

async function check() {
  const rows = await db.select({
    id: comments.id,
    authorName: comments.authorName,
    authorProfileImageUrl: comments.authorProfileImageUrl
  }).from(comments).limit(5)
  
  console.log(JSON.stringify(rows, null, 2))
}

check().catch(console.error)
