const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'local-payroll', 'payroll.db');
const db = new Database(dbPath);

const info = db.prepare("PRAGMA table_info(attendance)").all();
console.log(JSON.stringify(info, null, 2));
db.close();
