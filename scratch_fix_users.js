const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

// Path to the database in AppData
const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'LocalPayroll', 'payroll.db');
console.log('Opening DB at:', dbPath);

try {
    const db = new Database(dbPath);
    
    // Find users where username looks like a bcrypt hash ($2a$10$...)
    const users = db.prepare("SELECT * FROM users WHERE username LIKE '$2a$10$%'").all();
    
    console.log(`Found ${users.length} users with hashed usernames.`);
    
    for (const user of users) {
        // According to the bug:
        // username = hash
        // password_hash = original_full_name (or original_username)
        // full_name = original_role (or 'staff')
        // role = original_username
        
        const originalUsername = user.role;
        const originalRole = user.full_name;
        const originalFullName = user.password_hash;
        const correctHash = user.username;
        
        console.log(`Fixing user ID ${user.id}:`);
        console.log(`  Current Username (Hash): ${user.username}`);
        console.log(`  Current Role (Original Username?): ${user.role}`);
        
        db.prepare(`
            UPDATE users 
            SET username = ?, 
                password_hash = ?, 
                full_name = ?, 
                role = ?
            WHERE id = ?
        `).run(originalUsername, correctHash, originalFullName, originalRole, user.id);
        
        console.log(`  Updated to Username: ${originalUsername}, Role: ${originalRole}, Full Name: ${originalFullName}`);
    }
    
    db.close();
    console.log('Database fix completed.');
} catch (err) {
    console.error('Error fixing database:', err);
}
