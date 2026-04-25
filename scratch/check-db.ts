import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve('data/youtube.db');
const db = new Database(dbPath);

try {
    const rows = db.prepare('SELECT * FROM oauth_tokens').all();
    console.log('Connected channels:', rows.length);
    rows.forEach((t: any) => {
      console.log(`- ${t.channel_title} (${t.channel_id})`);
      console.log(`  Thumbnail: ${t.channel_thumbnail_url}`);
    });
} catch (e) {
    console.error(e);
}
db.close();
