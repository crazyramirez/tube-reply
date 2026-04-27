const Database = require('better-sqlite3');
const db = new Database('data/youtube.db');

const rows = db.prepare('SELECT * FROM sync_log ORDER BY started_at DESC LIMIT 5').all();
console.log(JSON.stringify(rows, null, 2));
