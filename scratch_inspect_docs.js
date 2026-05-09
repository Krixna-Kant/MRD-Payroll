const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

// On Windows, app.getPath('userData') typically maps to %AppData%\local-payroll (based on package.json name)
// or %AppData%\LocalPayroll (based on productName)
// Let's check both or use the environment variable.

const userData = path.join(os.homedir(), 'AppData', 'Roaming', 'local-payroll');
const dbPath = path.join(userData, 'payroll.db');

try {
    const db = new Database(dbPath, { readonly: true });
    const docs = db.prepare('SELECT * FROM staff_documents').all();
    console.log(JSON.stringify(docs, null, 2));
    db.close();
} catch (err) {
    console.error('Error opening DB at ' + dbPath + ': ' + err.message);
    
    // Try the other common path
    const userData2 = path.join(os.homedir(), 'AppData', 'Roaming', 'LocalPayroll');
    const dbPath2 = path.join(userData2, 'payroll.db');
    try {
        const db2 = new Database(dbPath2, { readonly: true });
        const docs2 = db2.prepare('SELECT * FROM staff_documents').all();
        console.log(JSON.stringify(docs2, null, 2));
        db2.close();
    } catch (err2) {
        console.error('Error opening DB at ' + dbPath2 + ': ' + err2.message);
    }
}
