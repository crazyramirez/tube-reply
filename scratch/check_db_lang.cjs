const Database = require('better-sqlite3');
const db = new Database('./data/youtube.db');
const row = db.prepare("SELECT value FROM app_settings WHERE key = 'language'").get();
console.log('LANGUAGE IN DB:', row ? row.value : 'NOT SET (default es)');
