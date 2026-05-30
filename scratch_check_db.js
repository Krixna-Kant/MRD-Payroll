const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'LocalPayroll', 'payroll.db');
console.log('Connecting to:', dbPath);

try {
  const db = new Database(dbPath, { fileMustExist: true });
  const projects = db.prepare('SELECT * FROM projects').all();
  console.log('Projects count:', projects.length);
  if (projects.length > 0) {
    console.log('Project Statuses:', projects.map(p => p.status));
  }
  
  const employees = db.prepare('PRAGMA table_info(employees)').all();
  console.log('Employees has daily_rate:', employees.some(c => c.name === 'daily_rate'));
  
  db.close();
} catch (e) {
  console.error('Error:', e.message);
}
