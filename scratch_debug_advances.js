
const Database = require('better-sqlite3');
const db = new Database('LocalPayroll.db');
const stats = db.prepare('SELECT id, name, balance FROM employees WHERE balance < 0').all();
console.log('Outstanding Employees:', JSON.stringify(stats, null, 2));
db.close();
