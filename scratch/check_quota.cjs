const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.resolve('data/youtube.db');
const db = new Database(dbPath);

console.log('--- Daily Quota Check ---');
try {
    const syncResult = db.prepare("SELECT SUM(quota_used) as total FROM sync_log WHERE date(started_at, 'localtime') = date('now', 'localtime')").get();
    console.log('Sync Quota Used:', syncResult.total || 0);
    
    const publishResult = db.prepare("SELECT COUNT(*) as total FROM published_replies WHERE date(published_at, 'localtime') = date('now', 'localtime')").get();
    console.log('Publish Quota Used:', (publishResult.total || 0) * 50);
} catch (e) {
    console.error('Error calculating quota:', e.message);
}

db.close();
