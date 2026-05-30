const path = require('path');
const fs = require('fs');

// Mock Electron app for database initialization
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(name) {
  if (name === 'electron') {
    return {
      app: {
        getPath: () => path.resolve('.'),
        isForceClose: false
      },
      ipcMain: {
        handle: () => {}
      }
    };
  }
  return originalRequire.apply(this, arguments);
};

// Now import the DB and performance handlers
const { getDB } = require('../src/database/db');
const { runMigrations } = require('../src/database/migrations');

// Run migrations to ensure special_incentive column is created
runMigrations();

const db = getDB();

// Let's import the performance script to test the helper function
// Since performance.js doesn't export checkEmployeeEligibility, we can read the file and eval it,
// or we can test the IPC handlers. But wait, we can just export checkEmployeeEligibility or register handlers.
// Let's test the handlers directly by calling them if we mock ipcMain.handle!
const handlers = {};
const mockIpcMain = {
  handle: (name, cb) => {
    handlers[name] = cb;
  }
};

// Re-require electron mock to inject mockIpcMain
Module.prototype.require = function(name) {
  if (name === 'electron') {
    return {
      app: {
        getPath: () => path.resolve('.'),
        isForceClose: false
      },
      ipcMain: mockIpcMain
    };
  }
  return originalRequire.apply(this, arguments);
};

const { registerPerformanceHandlers } = require('../src/ipc/performance');
registerPerformanceHandlers();

async function runTests() {
  console.log('--- STARTING ELIGIBILITY TESTS ---');
  
  // Let's see what employees exist
  const employees = db.prepare("SELECT * FROM employees").all();
  console.log(`Found ${employees.length} employees in the database.`);
  
  if (employees.length === 0) {
    console.log('No employees found, seeding test employee...');
    db.prepare("INSERT INTO employees (name, role, salary, joining_date, status) VALUES ('Test Employee', 'Developer', 5000000, '2026-01-01', 'active')").run();
  }
  
  const emp = db.prepare("SELECT * FROM employees LIMIT 1").get();
  console.log(`Testing with employee: ${emp.name} (ID: ${emp.id})`);
  
  // Clean up existing attendance for April 2026 for this test
  db.prepare("DELETE FROM attendance WHERE employee_id = ? AND date LIKE ?").run(emp.id, '2026-04-%');
  
  // Test Case 1: Ineligible (1 present day, 0 OT, multiple absents)
  console.log('\n--- Test Case 1: 1 Present day, 0 OT ---');
  db.prepare("INSERT INTO attendance (employee_id, date, status, overtime_hours, is_finalized) VALUES (?, '2026-04-01', 'P', 0, 1)").run(emp.id);
  // Mark remaining days as Absent (A) to simulate multiple absents
  for (let i = 2; i <= 30; i++) {
    const dayStr = String(i).padStart(2, '0');
    db.prepare("INSERT INTO attendance (employee_id, date, status, overtime_hours, is_finalized) VALUES (?, ?, 'A', 0, 1)").run(emp.id, `2026-04-${dayStr}`);
  }
  
  let stats = await handlers['engine:getEligibilityStats'](null, { month: 4, year: 2026 });
  console.log('Eligibility Result for Test Case 1:', stats[emp.id]);
  
  // Test Case 2: Eligible (20 present days, 5 OT hours, no consecutive absents > 2)
  console.log('\n--- Test Case 2: 20 Present days, 5 OT, no continuous absences ---');
  db.prepare("DELETE FROM attendance WHERE employee_id = ? AND date LIKE ?").run(emp.id, '2026-04-%');
  for (let i = 1; i <= 30; i++) {
    const dayStr = String(i).padStart(2, '0');
    const isSunday = new Date(2026, 3, i).getDay() === 0;
    let status = 'P';
    let ot = 0;
    if (isSunday) {
      status = 'WO';
    } else if (i === 10 || i === 20) {
      status = 'A'; // isolated absences
    }
    if (i === 5) {
      ot = 5;
    }
    db.prepare("INSERT INTO attendance (employee_id, date, status, overtime_hours, is_finalized) VALUES (?, ?, ?, ?, 1)").run(emp.id, `2026-04-${dayStr}`, status, ot);
  }
  
  stats = await handlers['engine:getEligibilityStats'](null, { month: 4, year: 2026 });
  console.log('Eligibility Result for Test Case 2:', stats[emp.id]);
  
  // Clean up
  db.prepare("DELETE FROM attendance WHERE employee_id = ? AND date LIKE ?").run(emp.id, '2026-04-%');
  console.log('\n--- TESTS COMPLETED ---');
  process.exit(0);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
