/**
 * LocalPayroll - Attendance IPC Handlers
 * Mark attendance (P/A/H), bulk daily entry, monthly summaries.
 * Supports: check-in/check-out times, overtime tracking, Sunday work flag.
 */

const { getDB } = require('../database/db');
const { processMonthlyAttendanceStats } = require('../utils/rules');

module.exports = function registerAttendanceHandlers(ipcMain) {

  // ── Mark Attendance (upsert) ──────────────────────────────────────────────
  ipcMain.handle('attendance:mark', async (_, data) => {
    const { employeeId, date, status, notes, markedBy, checkIn, checkOut, isSundayWork, projectName } = data;
    let { overtimeHours } = data;
    
    // Only allow strictly integer OT hours >= 1
    overtimeHours = Math.floor(parseFloat(overtimeHours || 0));
    if (overtimeHours < 1) {
      overtimeHours = 0;
    }

    const db = getDB();
    db.prepare(`
      INSERT INTO attendance (employee_id, date, status, notes, marked_by, check_in, check_out, overtime_hours, is_sunday_work, project_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(employee_id, date) DO UPDATE SET
        status         = excluded.status,
        notes          = excluded.notes,
        marked_by      = excluded.marked_by,
        check_in       = excluded.check_in,
        check_out      = excluded.check_out,
        overtime_hours = excluded.overtime_hours,
        is_sunday_work = excluded.is_sunday_work,
        project_name   = excluded.project_name
    `).run(
      employeeId, date, status, notes || null, markedBy || null,
      checkIn || null, checkOut || null, overtimeHours, isSundayWork ? 1 : 0, projectName || null
    );
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
             a.check_in, a.check_out, a.overtime_hours, a.is_sunday_work, a.project_name
             ${isSun ? `, (SELECT status FROM attendance WHERE employee_id = e.id AND date = ?) AS sat_status, (SELECT status FROM attendance WHERE employee_id = e.id AND date = ?) AS mon_status` : ''}
      FROM employees e
      LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = ?
      WHERE e.status = 'active'
        AND (e.joining_date IS NULL OR e.joining_date <= ?)
      ORDER BY e.name ASC
    `).all(isSun ? [satStr, monStr, date, date] : [date, date]);

    return { success: true, records: rows, isSunday: isSun };
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

};
