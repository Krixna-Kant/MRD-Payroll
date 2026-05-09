const Database = require('./node_modules/better-sqlite3/index.js');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'local-payroll', 'payroll.db');

try {
    const db = new Database(dbPath, { readonly: true });
    const docs = db.prepare('SELECT * FROM staff_documents').all();
    console.log('DOCS_DATA_START');
    console.log(JSON.stringify(docs, null, 2));
    console.log('DOCS_DATA_END');
    db.close();
} catch (err) {
    console.error('Error opening DB: ' + err.message);
}

