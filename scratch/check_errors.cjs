const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.resolve('data/youtube.db');
const db = new Database(dbPath);

console.log('--- Last 10 Error Logs ---');
try {
    const logs = db.prepare("SELECT * FROM error_logs ORDER BY occurred_at DESC LIMIT 10").all();
    console.log(JSON.stringify(logs, null, 2));
} catch (e) {
    console.error('Error reading error_logs:', e.message);
}

db.close();
