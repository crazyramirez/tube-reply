const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.resolve('data/youtube.db');
const db = new Database(dbPath);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('tables:', tables.map(t=>t.name).join(', '));
const info = db.prepare("PRAGMA table_info(videos)").all();
console.log('videos cols:', info.map(c=>c.name).join(', '));
db.close();
