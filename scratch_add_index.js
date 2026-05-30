const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'local-payroll', 'payroll.db');
const db = new Database(dbPath);

console.log('Creating index...');
db.exec('CREATE INDEX IF NOT EXISTS idx_attendance_project_id ON attendance(project_id)');
console.log('Index created.');

db.close();
process.exit(0);
