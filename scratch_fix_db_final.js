const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'local-payroll', 'payroll.db');
console.log('Fixing DB at:', dbPath);

try {
    const db = new Database(dbPath);
    
    // Find users where username starts with $2a$ (bcrypt hash)
    const users = db.prepare("SELECT * FROM users WHERE username LIKE '$2a$%'").all();
    console.log(`Found ${users.length} broken users.`);
    
    for (const u of users) {
        console.log(`Fixing User ID ${u.id}...`);
        
        // The bug swapped columns:
        // Current 'username' column contains the 'password_hash'
        // Current 'password_hash' column contains the 'full_name'
        // Current 'full_name' column contains the 'role'
        // Current 'role' column contains the 'username'
        
        const correctUsername = u.role;
        const correctRole = u.full_name;
        const correctFullName = u.password_hash;
        const correctHash = u.username;
        
        db.prepare(`
            UPDATE users 
            SET username = ?, 
                password_hash = ?, 
                full_name = ?, 
                role = ?
            WHERE id = ?
        `).run(correctUsername, correctHash, correctFullName, correctRole, u.id);
        
        console.log(`  Fixed ID ${u.id}: Username='${correctUsername}', Role='${correctRole}', Name='${correctFullName}'`);
    }
    
    db.close();
    console.log('Database repair complete.');
} catch (err) {
    console.error('Error:', err);
}
process.exit(0);
