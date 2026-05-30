const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

console.log('--- USER DATABASE INSPECTION ---');

const pathsToCheck = [];
if (fs.existsSync('D:\\')) {
  pathsToCheck.push('D:\\LocalPayroll\\payroll.db');
}
pathsToCheck.push(path.join(os.homedir(), 'AppData', 'Roaming', 'LocalPayroll', 'payroll.db'));
pathsToCheck.push(path.join(os.homedir(), 'AppData', 'Roaming', 'local-payroll', 'payroll.db'));

pathsToCheck.forEach(dbPath => {
  console.log(`Checking path: ${dbPath}`);
  if (!fs.existsSync(dbPath)) {
    console.log(`  File does not exist.`);
    return;
  }
  
  try {
    const db = new Database(dbPath);
    const users = db.prepare('SELECT id, username, full_name, role, password_hash, must_change_password FROM users').all();
    
    console.log(`  Total Users Found: ${users.length}`);
    users.forEach(u => {
      console.log(`  - ID: ${u.id}`);
      console.log(`    Username:             [${u.username}]`);
      console.log(`    Full Name:            [${u.full_name}]`);
      console.log(`    Role:                 [${u.role}]`);
      console.log(`    Must Change Password: [${u.must_change_password}]`);
      console.log(`    Hash (truncated):     ${u.password_hash.substring(0, 15)}...`);
    });
    db.close();
  } catch (err) {
    console.error(`  Error reading database at ${dbPath}:`, err);
  }
  console.log('---');
});
