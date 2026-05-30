const { app } = require('electron');
const db = require('./src/database/db').getDB();
console.log('--- SCORES ---');
console.log(db.prepare('SELECT * FROM performance_scores').all());
console.log('--- ATTENDANCE ---');
console.log(db.prepare('SELECT employee_id, status, count(*) as c FROM attendance GROUP BY employee_id, status').all());
app.quit();
