const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

// Try both paths: D:\LocalPayroll\payroll.db and AppData
const pathsToTry = [
    path.join('D:', 'LocalPayroll', 'payroll.db'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'local-payroll', 'payroll.db')
];

let db = null;
for (const p of pathsToTry) {
    try {
        db = new Database(p, { fileMustExist: true });
        console.log('Connected to DB at:', p);
        break;
    } catch (e) {
        // try next
    }
}

if (!db) {
    for (const p of pathsToTry) {
        try {
            db = new Database(p);
            console.log('Opened/Created DB at:', p);
            break;
        } catch (e) {
            console.error('Failed to open:', p, e.message);
        }
    }
}

if (!db) {
    console.error('Could not open database.');
    process.exit(1);
}

try {
    console.log('\n--- SETTINGS ---');
    const settings = db.prepare('SELECT * FROM settings').all();
    settings.forEach(s => {
        console.log(`${s.key}: ${s.value}`);
    });

    console.log('\n--- RECENT ACTIVITY LOGS ---');
    const logs = db.prepare('SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 20').all();
    logs.forEach(l => {
        console.log(`[${l.timestamp}] [${l.user_name}] [${l.module}] [${l.action}] - ${l.description}`);
    });

    db.close();
} catch (err) {
    console.error('Error during inspection:', err);
}
process.exit(0);
