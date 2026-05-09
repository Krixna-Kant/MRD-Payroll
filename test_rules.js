const { processMonthlyAttendanceStats } = require('./src/utils/rules');
const Database = require('better-sqlite3');
const db = new Database('./payroll.db');
console.log(processMonthlyAttendanceStats(db, 1, '2026-04-01', '2026-04-30'));
