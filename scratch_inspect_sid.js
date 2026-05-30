const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'local-payroll', 'payroll.db');
const db = new Database(dbPath);

const empId = 24;
const ledger = db.prepare('SELECT * FROM ledger WHERE employee_id = ? ORDER BY date DESC, id DESC').all(empId);
console.log('---START---');
console.log(JSON.stringify(ledger));
console.log('---END---');

db.close();
setTimeout(() => process.exit(0), 500);
