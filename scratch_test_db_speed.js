const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'local-payroll', 'payroll.db');
const db = new Database(dbPath);

console.log('--- DB TEST START ---');

try {
    const start = Date.now();
    const employees = db.prepare("SELECT id, name FROM employees WHERE status = 'active'").all();
    console.log(`Fetched ${employees.length} employees in ${Date.now() - start}ms`);

    const statsStart = Date.now();
    const stats = employees.map(emp => {
        try {
            const totalGiven = db.prepare(`SELECT COALESCE(SUM(amount), 0) as n FROM advances WHERE employee_id = ?`).get(emp.id).n;
            const totalRecovered = db.prepare(`SELECT COALESCE(SUM(advance_deducted), 0) as n FROM payments WHERE employee_id = ? AND status = 'paid'`).get(emp.id).n;
            return { id: emp.id, totalGiven, totalRecovered };
        } catch (e) {
            return { id: emp.id, error: e.message };
        }
    });
    console.log(`Processed stats for all employees in ${Date.now() - statsStart}ms`);
    console.log('First 5 results:', JSON.stringify(stats.slice(0, 5)));

} catch (err) {
    console.error('Database Test Error:', err);
}

db.close();
process.exit(0);
