const Database = require('better-sqlite3');
const path = require('path');

const dbPath = 'D:\\LocalPayroll\\payroll.db';
try {
    const db = new Database(dbPath);
    console.log('Connected to DB at:', dbPath);

    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    stmt.run('hr_access_financials', '1');
    stmt.run('hr_access_audit', '1');
    stmt.run('hr_access_settings', '1');
    stmt.run('hr_edit_salary', '1');
    stmt.run('hr_delete_access', '1');
    stmt.run('hr_edit_past_attendance', '1');

    console.log('Settings successfully inserted!');
    db.close();
} catch (e) {
    console.error('Failed to update DB:', e.message);
}
process.exit(0);
