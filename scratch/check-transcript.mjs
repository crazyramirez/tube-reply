import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '../server/db/schema';
import { eq } from 'drizzle-orm';

const sqlite = new Database('data/youtube.db');
const db = drizzle(sqlite, { schema });

async function checkTranscript() {
  const videoId = 'L9G7vt6RS08';
  const rows = await db.select().from(schema.videoTranscripts)
    .where(eq(schema.videoTranscripts.videoId, videoId));
  
  console.log('Count:', rows.length);
  if (rows.length > 0) {
    console.log('First 500 chars:', rows[0].transcript.substring(0, 500));
    console.log('Total length:', rows[0].transcript.length);
  }
}

checkTranscript();
