const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const os = require('os');
const fs = require('fs');

const dbPaths = [];
if (fs.existsSync('D:\\')) {
  dbPaths.push('D:\\LocalPayroll\\payroll.db');
}
dbPaths.push(path.join(os.homedir(), 'AppData', 'Roaming', 'local-payroll', 'payroll.db'));

dbPaths.forEach(dbPath => {
  if (!fs.existsSync(dbPath)) return;
  console.log(`Checking DB: ${dbPath}`);
  const db = new Database(dbPath);
  try {
    const users = db.prepare('SELECT id, username, password_hash FROM users').all();
    users.forEach(user => {
      const isDefault = bcrypt.compareSync('admin123', user.password_hash);
      const isAdminPass = bcrypt.compareSync('admin', user.password_hash);
      console.log(`User: ${user.username}`);
      console.log(`  Matches 'admin123': ${isDefault}`);
      console.log(`  Matches 'admin': ${isAdminPass}`);
    });
  } catch (err) {
    console.error(err);
  } finally {
    db.close();
  }
});
process.exit(0);
