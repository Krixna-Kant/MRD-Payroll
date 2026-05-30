const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'local-payroll', 'payroll.db');
const db = new Database(dbPath);
const count = db.prepare("SELECT COUNT(*) as n FROM employees WHERE status = 'active'").get().n;
console.log("ACTIVE EMPLOYEES:", count);
db.close();
