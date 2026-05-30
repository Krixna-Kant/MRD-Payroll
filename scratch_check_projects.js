
const Database = require('better-sqlite3');
const db = new Database('LocalPayroll.db');
const att = db.prepare("SELECT date, project_name, status FROM attendance WHERE date LIKE '2026-05%'").all();
console.log('Attendance Records for May:', JSON.stringify(att, null, 2));
db.close();
