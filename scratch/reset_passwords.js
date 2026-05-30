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

const adminHash = bcrypt.hashSync('admin123', 10);
const hrHash = bcrypt.hashSync('admin123', 10); // set both to admin123 initially for simplicity

dbPaths.forEach(dbPath => {
  if (!fs.existsSync(dbPath)) return;
  console.log(`Resetting passwords in DB: ${dbPath}`);
  const db = new Database(dbPath);
  try {
    // Reset admin password to admin123, set must_change_password to 1
    const stmtAdmin = db.prepare("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE username = 'admin'");
    const infoAdmin = stmtAdmin.run(adminHash);
    console.log(`  Admin updated:`, infoAdmin);

    // Reset HR password to admin123, set must_change_password to 1
    const stmtHR = db.prepare("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE username = 'HR'");
    const infoHR = stmtHR.run(hrHash);
    console.log(`  HR updated:`, infoHR);
  } catch (err) {
    console.error(`  Error:`, err);
  } finally {
    db.close();
  }
});
process.exit(0);
