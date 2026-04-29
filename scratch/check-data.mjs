import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '../server/db/schema';
import { eq, like } from 'drizzle-orm';

const sqlite = new Database('data/youtube.db');
const db = drizzle(sqlite, { schema });

async function checkData() {
  const videoId = 'L9G7vt6RS08';
  
  console.log('--- Transcript ---');
  const transcripts = await db.select().from(schema.videoTranscripts)
    .where(eq(schema.videoTranscripts.videoId, videoId));
  console.log(JSON.stringify(transcripts, null, 2));

  console.log('--- Comments mentioning escote/escotado ---');
  const comments = await db.select().from(schema.comments)
    .where(like(schema.comments.text, '%escot%'))
    .limit(5);
  console.log(JSON.stringify(comments, null, 2));

  console.log('--- KB Entries ---');
  const kb = await db.select().from(schema.knowledgeBase).limit(10);
  console.log(JSON.stringify(kb, null, 2));
}

checkData();
