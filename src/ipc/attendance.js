/**
 * LocalPayroll - Attendance IPC Handlers
 * Mark attendance (P/A/H), bulk daily entry, monthly summaries.
 * Supports: check-in/check-out times, overtime tracking, Sunday work flag.
 */

const { getDB } = require('../database/db');

module.exports = function registerAttendanceHandlers(ipcMain) {

  // ── Mark Attendance (upsert) ──────────────────────────────────────────────
  ipcMain.handle('attendance:mark', async (_, data) => {
    const { employeeId, date, status, notes, markedBy, checkIn, checkOut, isSundayWork, projectName } = data;
    let { overtimeHours } = data;
    
    // Only calculate overtime if it's strictly >= 1 hour
    overtimeHours = overtimeHours || 0;
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
  // Returns only employees who had joined on or before `date` (joining_date <= date).
  // Employees with no joining_date are always included.
  ipcMain.handle('attendance:bulk', async (_, date) => {
    const db = getDB();
    const rows = db.prepare(`
      SELECT e.id, e.name, e.phone, e.role, e.joining_date,
             a.status, a.notes, a.id as attendance_id,
             a.check_in, a.check_out, a.overtime_hours, a.is_sunday_work, a.project_name
      FROM employees e
      LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = ?
      WHERE e.status = 'active'
        AND (e.joining_date IS NULL OR e.joining_date <= ?)
      ORDER BY e.name ASC
    `).all(date, date);
    return { success: true, records: rows };
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

    const rows = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM attendance
      WHERE employee_id = ? AND date >= ? AND date <= ?
      GROUP BY status
    `).all(empId, effectiveStart, end);

    const summary = { P: 0, A: 0, H: 0, total: 0 };
    rows.forEach(r => {
      summary[r.status] = r.count;
      summary.total += r.count;
    });

    // Effective working days: P + 0.5 * H
    summary.effectiveDays = summary.P + summary.H * 0.5;

    // Overtime totals for the month
    const otRow = db.prepare(`
      SELECT COALESCE(SUM(overtime_hours), 0) as totalOT
      FROM attendance
      WHERE employee_id = ? AND date >= ? AND date <= ? AND status IN ('P', 'H')
    `).get(empId, effectiveStart, end);
    summary.totalOvertimeHours = otRow.totalOT;

    // Sunday work days count
    const sunRow = db.prepare(`
      SELECT COUNT(*) as sundays
      FROM attendance
      WHERE employee_id = ? AND date >= ? AND date <= ? AND is_sunday_work = 1 AND status IN ('P', 'H')
    `).get(empId, effectiveStart, end);
    summary.sundayWorkDays = sunRow.sundays;

    return { success: true, summary };
  });

};
