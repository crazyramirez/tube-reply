const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve('data/youtube.db');
const db = new Database(dbPath);

const validTypes = ['faq', 'style', 'info', 'rule'];
const rows = db.prepare('SELECT id, type, title FROM knowledge_base').all();

console.log('Knowledge Base Entries:');
for (const row of rows) {
  const isValid = validTypes.includes(row.type);
  console.log(`ID: ${row.id} | Type: ${row.type} | Title: ${row.title} | Valid: ${isValid}`);
}

db.close();
