const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'local-payroll', 'payroll.db');
const db = new Database(dbPath);
const date = '2026-05-12'; // Use today's date
const records = db.prepare('SELECT id, employee_id, date, status, is_finalized FROM attendance WHERE date = ?').all(date);
console.log('Attendance for ' + date + ':', records);
