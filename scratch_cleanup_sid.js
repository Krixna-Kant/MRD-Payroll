
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'local-payroll', 'payroll.db');
const db = new Database(dbPath);

const empId = 24; // Sid

console.log('--- CLEANING SID LEDGER ---');

// 1. Delete the incorrect adjustment that caused the ghost debt
const result = db.prepare('DELETE FROM ledger WHERE employee_id = ? AND type = "ADJUSTMENT" AND notes LIKE "%Reversal of Payment ID: 40%"').run(empId);
console.log(`Deleted ${result.changes} incorrect ledger entries.`);

// 2. Recalculate actual advance balance
const advances = db.prepare('SELECT SUM(amount) as total FROM advances WHERE employee_id = ?').get(empId).total || 0;
const recoveries = db.prepare('SELECT SUM(advance_deducted) as total FROM payments WHERE employee_id = ? AND status = "paid"').get(empId).total || 0;
const correctBalance = -(advances - recoveries);

// 3. Update employee profile to correct balance
db.prepare('UPDATE employees SET balance = ? WHERE id = ?').run(correctBalance, empId);
console.log(`Corrected Employee Balance to: ${correctBalance / 100}`);

console.log('Done.');
