const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'local-payroll', 'payroll.db');
const db = new Database(dbPath);

const rows = db.prepare("SELECT * FROM expenses WHERE status = 'approved' AND payment_id IS NULL").all();
console.log(JSON.stringify(rows, null, 2));
db.close();
