const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const { app } = require('electron');

// Electron 'app' might not be fully ready if run as a script, 
// so we'll construct the path manually like in the migrations.
const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'local-payroll', 'payroll.db');
console.log('--- USER DATABASE INSPECTION ---');
console.log('DB Path:', dbPath);

try {
    const db = new Database(dbPath);
    const users = db.prepare('SELECT id, username, full_name, role, password_hash FROM users').all();
    
    console.log(`Total Users Found: ${users.length}`);
    users.forEach(u => {
        console.log(`ID: ${u.id}`);
        console.log(`  Username:  [${u.username}]`);
        console.log(`  Full Name: [${u.full_name}]`);
        console.log(`  Role:      [${u.role}]`);
        console.log(`  Hash (truncated): ${u.password_hash.substring(0, 10)}...`);
        console.log('---');
    });
    
    db.close();
} catch (err) {
    console.error('Error:', err);
}

// Exit since this is a script run via electron
process.exit(0);
