const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.resolve('data/youtube.db');
const db = new Database(dbPath);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();

for (const table of tables) {
    const info = db.prepare(`PRAGMA table_info(${table.name})`).all();
    console.log(`${table.name}: ${info.map(c=>c.name).join(', ')}`);
}

db.close();
