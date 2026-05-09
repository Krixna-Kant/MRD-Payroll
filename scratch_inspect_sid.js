const sqlite = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'database', 'payroll.db');
const db = new sqlite(dbPath);

const sid = db.prepare("SELECT * FROM employees WHERE name = 'sid'").get();
if (!sid) {
    console.log('Employee sid not found.');
    process.exit(1);
}

console.log('--- Employee Information ---');
console.log(JSON.stringify(sid, null, 2));

console.log('\n--- Ledger History ---');
const ledger = db.prepare("SELECT * FROM ledger WHERE employee_id = ? ORDER BY date DESC, id DESC").all(sid.id);
ledger.forEach(row => {
    console.log(`[${row.date}] ${row.type}: ${row.amount / 100} | Running: ${row.running_balance / 100} | Notes: ${row.notes}`);
});

console.log('\n--- Past Payments ---');
const payments = db.prepare("SELECT * FROM payments WHERE employee_id = ? ORDER BY year DESC, month DESC").all(sid.id);
payments.forEach(p => {
    console.log(`${p.month}/${p.year}: Net Paid: ${p.net_paid / 100} | Salary Earned: ${p.salary_earned / 100} | Opening: ${p.opening_balance / 100}`);
});
