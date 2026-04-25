const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve('data/youtube.db');
const db = new Database(dbPath);

const id = 2; // Test with one of the IDs
const entry = db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(id);

if (entry) {
  console.log('Deleting entry:', entry);
  const result = db.prepare('DELETE FROM knowledge_base WHERE id = ?').run(id);
  console.log('Result:', result);
} else {
  console.log('Entry not found:', id);
}

db.close();
