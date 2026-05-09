/**
 * LocalPayroll - Attendance IPC Handlers
 * Mark attendance (P/A/H), bulk daily entry, monthly summaries.
 * Supports: check-in/check-out times, overtime tracking, Sunday work flag.
 */

const { getDB } = require('../database/db');
const { processMonthlyAttendanceStats } = require('../utils/rules');
const { dialog, BrowserWindow } = require('electron');
const { generateAttendanceRegisterExcel } = require('../utils/excel');
const { generateAttendanceRegisterPdf } = require('../utils/pdf');

module.exports = function registerAttendanceHandlers(ipcMain) {

  // ── Mark Attendance (upsert) ──────────────────────────────────────────────
  ipcMain.handle('attendance:mark', async (_, data) => {
    const { employeeId, date, status, notes, markedBy, checkIn, checkOut, isSundayWork, projectName, projectId } = data;
    let { overtimeHours } = data;
    
    // Only allow strictly integer OT hours >= 1
    overtimeHours = Math.floor(parseFloat(overtimeHours || 0));
    if (overtimeHours < 1) {
      overtimeHours = 0;
    }

    const db = getDB();
    
    // Check old attendance for audit log
    const oldRec = db.prepare('SELECT status, overtime_hours FROM attendance WHERE employee_id = ? AND date = ?').get(employeeId, date);
    const oldStatus = oldRec ? oldRec.status : 'Not Marked';
    
    db.prepare(`
      INSERT INTO attendance (employee_id, date, status, notes, marked_by, check_in, check_out, overtime_hours, is_sunday_work, project_name, project_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(employee_id, date) DO UPDATE SET
        status         = excluded.status,
        notes          = excluded.notes,
        marked_by      = excluded.marked_by,
        check_in       = excluded.check_in,
        check_out      = excluded.check_out,
        overtime_hours = excluded.overtime_hours,
        is_sunday_work = excluded.is_sunday_work,
        project_name   = excluded.project_name,
        project_id     = excluded.project_id
    `).run(
      employeeId, date, status, notes || null, markedBy || null,
      checkIn || null, checkOut || null, overtimeHours, isSundayWork ? 1 : 0, projectName || null, projectId || null
    );

    // Audit Log
    const { logActivity } = require('../utils/audit');
    const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(employeeId);
    if (!oldRec) {
      logActivity('Attendance', 'Marked', `Marked attendance for ${emp?.name} on ${date}`, null, status);
    } else if (oldRec.status !== status || oldRec.overtime_hours !== overtimeHours) {
      logActivity('Attendance', 'Edited', `Changed attendance for ${emp?.name} on ${date}`, `Status: ${oldStatus}, OT: ${oldRec.overtime_hours}`, `Status: ${status}, OT: ${overtimeHours}`);
    }

    return { success: true };
  });

  // ── Get All Attendance for an Employee in a Month ─────────────────────────
  // Only returns records from the employee's joining date onward.
  ipcMain.handle('attendance:monthly', async (_, empId, month, year) => {
    const db = getDB();
    const monthStr = String(month).padStart(2, '0');
    const start = `${year}-${monthStr}-01`;
    const end   = `${year}-${monthStr}-31`;

    // Get employee joining date
    const emp = db.prepare('SELECT joining_date FROM employees WHERE id = ?').get(empId);
    const joiningDate = emp?.joining_date || null;

    // Filter: only records on or after joining date
    let query = `SELECT * FROM attendance WHERE employee_id = ? AND date >= ? AND date <= ?`;
    const params = [empId, start, end];
    if (joiningDate) {
      query += ` AND date >= ?`;
      params.push(joiningDate);
    }
    query += ` ORDER BY date ASC`;
    const records = db.prepare(query).all(...params);

    return { success: true, records, joiningDate };
  });

  // ── Bulk: Get all employees' attendance for a single date ─────────────────
  // Returns only employees who had joined on or before `date`.
  ipcMain.handle('attendance:bulk', async (_, date) => {
    const db = getDB();
    
    // Check if requested date is Sunday
    const reqDate = new Date(date);
    const isSun = reqDate.getDay() === 0;
    
    let satStr = '', monStr = '';
    if (isSun) {
      const sat = new Date(reqDate); sat.setDate(sat.getDate() - 1);
      const mon = new Date(reqDate); mon.setDate(mon.getDate() + 1);
      satStr = sat.toISOString().split('T')[0];
      monStr = mon.toISOString().split('T')[0];
    }

    const rows = db.prepare(`
      SELECT e.id, e.name, e.phone, e.role, e.joining_date,
             a.status, a.notes, a.id as attendance_id,
             a.check_in, a.check_out, a.overtime_hours, a.is_sunday_work, a.project_name, a.project_id
             ${isSun ? `, (SELECT status FROM attendance WHERE employee_id = e.id AND date = ?) AS sat_status, (SELECT status FROM attendance WHERE employee_id = e.id AND date = ?) AS mon_status` : ''}
      FROM employees e
      LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = ?
      WHERE e.status = 'active'
        AND (e.joining_date IS NULL OR e.joining_date <= ?)
      ORDER BY e.name ASC
    `).all(isSun ? [satStr, monStr, date, date] : [date, date]);

    return { success: true, records: rows, isSunday: isSun };
  });

  // ── Reset Attendance (Admin Only) ─────────────────────────────────────────
  // Clears a single attendance record and logs the action to attendance_audit.
  ipcMain.handle('attendance:reset', async (_, { employeeId, date, changedBy }) => {
    const db = getDB();
    try {
      const existing = db.prepare(`SELECT id, status FROM attendance WHERE employee_id = ? AND date = ?`).get(employeeId, date);
      if (!existing) return { success: false, error: 'No attendance record found for this date.' };

      const transaction = db.transaction(() => {
        db.prepare(`DELETE FROM attendance WHERE employee_id = ? AND date = ?`).run(employeeId, date);
        db.prepare(`
          INSERT INTO attendance_audit (employee_id, date, old_status, new_status, action_type, changed_by)
          VALUES (?, ?, ?, NULL, 'RESET', ?)
        `).run(employeeId, date, existing.status, changedBy || null);
      });
      transaction();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Edit Attendance (Admin Only — logs old→new change) ────────────────────
  ipcMain.handle('attendance:edit', async (_, { employeeId, date, newStatus, changedBy }) => {
    const db = getDB();
    try {
      const existing = db.prepare(`SELECT id, status FROM attendance WHERE employee_id = ? AND date = ?`).get(employeeId, date);
      const oldStatus = existing ? existing.status : null;

      const transaction = db.transaction(() => {
        db.prepare(`
          INSERT INTO attendance (employee_id, date, status, marked_by)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(employee_id, date) DO UPDATE SET status = excluded.status, marked_by = excluded.marked_by
        `).run(employeeId, date, newStatus, changedBy || null);

        db.prepare(`
          INSERT INTO attendance_audit (employee_id, date, old_status, new_status, action_type, changed_by)
          VALUES (?, ?, ?, ?, 'EDIT', ?)
        `).run(employeeId, date, oldStatus, newStatus, changedBy || null);
      });
      transaction();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Get Audit Log for a date/employee ─────────────────────────────────────
  ipcMain.handle('attendance:getAudit', async (_, { employeeId, date }) => {
    const db = getDB();
    const logs = db.prepare(`
      SELECT aa.*, u.full_name as changed_by_name
      FROM attendance_audit aa
      LEFT JOIN users u ON u.id = aa.changed_by
      WHERE aa.employee_id = ? AND aa.date = ?
      ORDER BY aa.timestamp DESC
    `).all(employeeId, date);
    return { success: true, logs };
  });

  // ── Monthly Attendance Summary (P/A/H counts + overtime + Sunday) ─────────
  // Only counts records from the employee's joining date onward.
  ipcMain.handle('attendance:summary', async (_, empId, month, year) => {
    const db = getDB();
    const monthStr = String(month).padStart(2, '0');
    const start = `${year}-${monthStr}-01`;
    const end   = `${year}-${monthStr}-31`;

    // Get employee joining date
    const emp = db.prepare('SELECT joining_date FROM employees WHERE id = ?').get(empId);
    const joiningDate = emp?.joining_date || null;

    // Determine effective start (max of month start and joining date)
    const effectiveStart = (joiningDate && joiningDate > start) ? joiningDate : start;

    const summary = processMonthlyAttendanceStats(db, empId, effectiveStart, end);

    return { success: true, summary };
  });

  // ── Export Monthly Attendance Register (Excel/PDF) ────────────────────────
  ipcMain.handle('attendance:exportRegister', async (event, month, year, format) => {
    const db = getDB();
    const monthStr = String(month).padStart(2, '0');
    const start = `${year}-${monthStr}-01`;
    const end   = `${year}-${monthStr}-31`;

    // Fetch all active employees, and any inactive who have attendance in this month
    const employees = db.prepare(`
      SELECT DISTINCT e.id, e.name, e.role, e.joining_date, e.status
      FROM employees e
      LEFT JOIN attendance a ON a.employee_id = e.id AND a.date >= ? AND a.date <= ?
      WHERE e.status = 'active' OR a.id IS NOT NULL
      ORDER BY e.name ASC
    `).all(start, end);

    if (!employees || employees.length === 0) return { success: false, error: 'No employees found.' };

    const employeeIds = employees.map(e => e.id);
    const placeholders = employeeIds.map(() => '?').join(',');

    // Fetch all attendance for these employees for this month
    const records = db.prepare(`
      SELECT employee_id, date, status, overtime_hours, is_sunday_work, project_name
      FROM attendance
      WHERE employee_id IN (${placeholders}) AND date >= ? AND date <= ?
    `).all(...employeeIds, start, end);

    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

    const extension = format === 'excel' ? 'xlsx' : 'pdf';
    const filterName = format === 'excel' ? 'Excel Files' : 'PDF Files';
    
    const { filePath } = await dialog.showSaveDialog(win, {
      title: 'Save Attendance Register',
      defaultPath: `Attendance_Register_${month}_${year}.${extension}`,
      filters: [{ name: filterName, extensions: [extension] }]
    });

    if (!filePath) return { success: false, error: 'Cancelled.' };

    const data = { employees, records };

    try {
      if (format === 'excel') {
        await generateAttendanceRegisterExcel(data, month, year, filePath);
      } else {
        await generateAttendanceRegisterPdf(data, month, year, filePath);
      }
      return { success: true, filePath };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });

};
