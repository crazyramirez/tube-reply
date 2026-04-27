import Database from 'better-sqlite3';
import path from 'path';
import { detectLanguage } from '../server/services/language-detect';
import * as dotenv from 'dotenv';
dotenv.config();

const dbPath = path.resolve(process.env.DATABASE_URL || 'data/youtube.db');
const db = new Database(dbPath);

const rows = db.prepare('SELECT id, text FROM comments').all();
console.log(`Re-detecting language for ${rows.length} comments...`);

const update = db.prepare('UPDATE comments SET detected_lang = ?, lang_confidence = ? WHERE id = ?');

let updated = 0;
const transaction = db.transaction((comments) => {
  for (const comment of comments) {
    const { lang, confidence } = detectLanguage(comment.text || '');
    update.run(lang, confidence, comment.id);
    updated++;
  }
});

transaction(rows);

console.log(`Successfully updated ${updated} comments.`);
db.close();
