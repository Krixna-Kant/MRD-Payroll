
const { getDB } = require('./src/database/db');
const db = getDB();
const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='attendance'").get().sql;
console.log('--- ATTENDANCE SCHEMA ---');
console.log(schema);

const employees = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='employees'").get().sql;
console.log('\n--- EMPLOYEES SCHEMA ---');
console.log(employees);

const corrections = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='attendance_corrections'").get();
if (corrections) console.log('\n--- CORRECTIONS SCHEMA ---\n', corrections.sql);
