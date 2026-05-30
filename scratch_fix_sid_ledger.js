const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'local-payroll', 'payroll.db');
const db = new Database(dbPath);

console.log('--- START CLEANUP ---');

// 1. Find all ADJUSTMENT entries that refer to a payment reversal
const adjustments = db.prepare(`SELECT * FROM ledger WHERE type = 'ADJUSTMENT' AND notes LIKE 'Reversal of Payment ID:%'`).all();

console.log(`Found ${adjustments.length} reversal adjustments in ledger.`);

let cleanedCount = 0;
const affectedEmployees = new Set();

for (const adj of adjustments) {
    const paymentId = adj.reference_id;
    // Check if the payment still exists in the payments table
    const paymentExists = db.prepare(`SELECT id FROM payments WHERE id = ?`).get(paymentId);
    
    if (!paymentExists) {
        console.log(`Payment ID ${paymentId} is deleted from payments table. Cleaning up ledger entries for Employee ID ${adj.employee_id}...`);
        
        // Delete all ledger entries related to this deleted payment
        const result = db.prepare(`
            DELETE FROM ledger 
            WHERE employee_id = ? 
            AND reference_id = ? 
            AND type IN ('SALARY', 'PAYMENT', 'ADJUSTMENT')
        `).run(adj.employee_id, paymentId);
        
        console.log(`Deleted ${result.changes} ledger entries for Payment ${paymentId}.`);
        affectedEmployees.add(adj.employee_id);
        cleanedCount++;
    }
}

// 2. Recalculate and update balances for affected employees
for (const empId of affectedEmployees) {
    const ledgerSum = db.prepare('SELECT SUM(amount) as total FROM ledger WHERE employee_id = ?').get(empId).total || 0;
    db.prepare('UPDATE employees SET balance = ? WHERE id = ?').run(ledgerSum, empId);
    console.log(`Updated Employee ID ${empId} balance to: ${ledgerSum}`);
}

console.log(`Cleanup complete. Processed ${cleanedCount} deleted payment reversals.`);
console.log('--- END CLEANUP ---');

db.close();
setTimeout(() => process.exit(0), 500);
