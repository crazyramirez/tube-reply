const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.resolve('data/youtube.db');
const db = new Database(dbPath);

console.log('--- Last 5 Sync Logs ---');
try {
    const logs = db.prepare("SELECT * FROM sync_log ORDER BY started_at DESC LIMIT 5").all();
    console.log(JSON.stringify(logs, null, 2));
} catch (e) {
    console.error('Error reading sync_log:', e.message);
}

console.log('\n--- OAuth Tokens ---');
try {
    const tokens = db.prepare("SELECT channel_id, channel_title, expires_at FROM oauth_tokens").all();
    console.log(JSON.stringify(tokens, null, 2));
} catch (e) {
    console.error('Error reading oauth_tokens:', e.message);
}

db.close();
