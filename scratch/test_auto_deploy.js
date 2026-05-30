const { app } = require('electron');
app.whenReady().then(async () => {
  const { getDB } = require('../src/ipc/../database/db');
  const db = getDB();

try {
  console.log('[TEST] Initializing test...');
  
  // 1. Create a test project
  db.prepare(`
    INSERT INTO projects (name, code, status) 
    VALUES ('Auto Deploy Test Project', 'TEST-001', 'Ongoing')
  `).run();
  
  const proj = db.prepare("SELECT id FROM projects WHERE code = 'TEST-001'").get();
  console.log('[TEST] Created project with ID:', proj.id);

  // 2. Create a test employee
  db.prepare(`
    INSERT INTO employees (name, salary, status)
    VALUES ('Auto Deploy Tester', 2600000, 'active')
  `).run();
  
  const emp = db.prepare("SELECT id, project_id FROM employees WHERE name = 'Auto Deploy Tester'").get();
  console.log('[TEST] Created employee with ID:', emp.id, 'Initial project_id:', emp.project_id);

  // 3. Mock the backend logic of attendance:mark
  const employeeId = emp.id;
  const date = '2026-05-27';
  const status = 'P';
  const notes = 'Test Notes';
  const checkIn = '09:00';
  const checkOut = '18:00';
  const overtimeHours = 0;
  const isSundayWork = 0;
  const projectName = 'Auto Deploy Test Project';
  const projectId = proj.id; // Target project ID
  const markedBy = null;
  const finalVal = 0;
  const extraShiftType = null;
  const extraIn = '';
  const extraOut = '';
  const extraNotes = '';

  console.log('[TEST] Executing attendance:mark transactional logic...');
  const transaction = db.transaction(() => {
    // Insert/update attendance
    db.prepare(`
      INSERT INTO attendance (
        employee_id, date, status, notes, in_time, out_time, 
        overtime_hours, is_sunday_work, project_name, project_id, marked_by, is_finalized,
        extra_shift_type, extra_in, extra_out, extra_notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(employee_id, date) DO UPDATE SET
        status = excluded.status,
        notes = excluded.notes,
        in_time = excluded.in_time,
        out_time = excluded.out_time,
        overtime_hours = excluded.overtime_hours,
        is_sunday_work = excluded.is_sunday_work,
        project_name = excluded.project_name,
        project_id = excluded.project_id,
        marked_by = excluded.marked_by,
        is_finalized = excluded.is_finalized,
        extra_shift_type = excluded.extra_shift_type,
        extra_in = excluded.extra_in,
        extra_out = excluded.extra_out,
        extra_notes = excluded.extra_notes
    `).run(
      employeeId, date, status, notes, checkIn, checkOut, 
      overtimeHours, isSundayWork, projectName, projectId, markedBy, finalVal,
      extraShiftType, extraIn, extraOut, extraNotes
    );

    // Auto-update employee's project_id
    if (projectId !== undefined) {
      db.prepare('UPDATE employees SET project_id = ?, updated_at = (strftime(\'%s\', \'now\')) WHERE id = ?')
        .run(projectId ? parseInt(projectId) : null, employeeId);
    }
  });
  transaction();

  // 4. Verify employee project_id updated
  const updatedEmp = db.prepare("SELECT project_id FROM employees WHERE id = ?").get(employeeId);
  console.log('[TEST] Post-attendance employee project_id:', updatedEmp.project_id);

  if (updatedEmp.project_id === proj.id) {
    console.log('[TEST] SUCCESS: Employee project_id successfully matches the selected project ID!');
  } else {
    throw new Error('Employee project_id was not updated correctly!');
  }

  // 5. Verify attendance record project_id updated
  const updatedAtt = db.prepare("SELECT project_id FROM attendance WHERE employee_id = ? AND date = ?").get(employeeId, date);
  console.log('[TEST] Attendance record project_id:', updatedAtt.project_id);
  
  if (updatedAtt.project_id === proj.id) {
    console.log('[TEST] SUCCESS: Attendance record project_id matches successfully!');
  } else {
    throw new Error('Attendance project_id was not saved correctly!');
  }

  // 6. Test setting to null (CUSTOM / Select Project)
  console.log('[TEST] Testing setting project_id to null...');
  const transactionNull = db.transaction(() => {
    db.prepare('UPDATE employees SET project_id = ? WHERE id = ?').run(null, employeeId);
  });
  transactionNull();
  const nullEmp = db.prepare("SELECT project_id FROM employees WHERE id = ?").get(employeeId);
  console.log('[TEST] Post-unassign employee project_id:', nullEmp.project_id);
  if (nullEmp.project_id === null) {
    console.log('[TEST] SUCCESS: Employee project_id successfully set to null!');
  } else {
    throw new Error('Employee project_id failed to clear!');
  }

} catch (err) {
  console.error('[TEST] FAILED:', err.message);
} finally {
  console.log('[TEST] Cleaning up test records...');
  try {
    db.prepare("DELETE FROM attendance WHERE employee_id IN (SELECT id FROM employees WHERE name = 'Auto Deploy Tester')").run();
    db.prepare("DELETE FROM employees WHERE name = 'Auto Deploy Tester'").run();
    db.prepare("DELETE FROM projects WHERE code = 'TEST-001'").run();
    console.log('[TEST] Cleanup completed.');
  } catch (cleanErr) {
    console.error('[TEST] Cleanup failed:', cleanErr.message);
  }
  db.close();
  app.quit();
}
});
