import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '../server/db/schema';
import { eq } from 'drizzle-orm';

const sqlite = new Database('data/youtube.db');
const db = drizzle(sqlite, { schema });

async function findPhrase() {
  const videoId = 'L9G7vt6RS08';
  const rows = await db.select().from(schema.videoTranscripts)
    .where(eq(schema.videoTranscripts.videoId, videoId));
  
  if (rows.length > 0) {
    const text = rows[0].transcript;
    const phrase = 'detalle especial';
    const index = text.toLowerCase().indexOf(phrase.toLowerCase());
    if (index !== -1) {
      console.log('Found phrase at:', index);
      console.log('Context:', text.substring(index - 50, index + 100));
    } else {
      console.log('Phrase not found in transcript.');
    }
  }
}

findPhrase();
