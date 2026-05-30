const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'local-payroll', 'payroll.db');
const db = new Database(dbPath);
const employees = db.prepare("SELECT id, name, status, joining_date FROM employees").all();
console.log("TOTAL EMPLOYEES:", employees.length);
console.log(JSON.stringify(employees, null, 2));
db.close();
