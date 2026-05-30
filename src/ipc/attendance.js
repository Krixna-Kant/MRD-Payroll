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

const { generateAlert } = require('./alerts');
const { logActivity } = require('../utils/audit');

/**
 * Helper to format a local Date object as YYYY-MM-DD
 */
function formatLocalDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * AUTO CONTINUOUS ABSENT RULE:
 * If an employee is absent (A) for >= 2 consecutive days, auto-mark next day as 'A'.
 * This includes Sundays/WO.
 */
function applyAutoAbsentRules(db, date) {
  const reqDate = new Date(date + 'T00:00:00');
  const yesterday = new Date(reqDate); yesterday.setDate(yesterday.getDate() - 1);
  const dayBefore = new Date(reqDate); dayBefore.setDate(dayBefore.getDate() - 2);

  const d1 = formatLocalDate(yesterday);
  const d2 = formatLocalDate(dayBefore);

  // 1. Find active employees with no record today who were absent (A) for last 2 days
  const absentees = db.prepare(`
    SELECT e.id, e.name
    FROM employees e
    JOIN attendance a1 ON a1.employee_id = e.id AND a1.date = ? AND a1.status = 'A'
    JOIN attendance a2 ON a2.employee_id = e.id AND a2.date = ? AND a2.status = 'A'
    LEFT JOIN attendance a_curr ON a_curr.employee_id = e.id AND a_curr.date = ?
    WHERE e.status = 'active'
      AND a_curr.id IS NULL
  `).all(d1, d2, date);

  for (const emp of absentees) {
    // Check for approved leaves
    const leave = db.prepare(`
      SELECT id FROM leaves 
      WHERE employee_id = ? 
        AND status = 'approved' 
        AND ? BETWEEN from_date AND to_date
    `).get(emp.id, date);

    if (leave) continue;

    // Auto mark as absent
    db.prepare(`
      INSERT INTO attendance (employee_id, date, status, notes, marked_by, is_finalized)
      VALUES (?, ?, 'A', 'AUTO ABSENT', NULL, 1)
    `).run(emp.id, date);

    // Audit Log
    logActivity('Attendance', 'Auto-Marked', `System auto-marked ${emp.name} as Absent due to continuous absence rule.`, null, 'A');
    
    // Alert for HR
    generateAlert(db, 'Critical Absence', `${emp.name} absent continuously for 3+ days. (Auto-Marked)`, 'Critical', 'Attendance');
  }
}

/**
 * Retroactively apply auto absent rules sequentially for a range of dates.
 */
function applyAutoAbsentRulesRange(db, start, end) {
  const startDate = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  
  if (startDate > endDate) return;

  let curr = new Date(startDate);
  while (curr <= endDate) {
    const dateStr = formatLocalDate(curr);
    applyAutoAbsentRules(db, dateStr);
    curr.setDate(curr.getDate() + 1);
  }
}

/**
 * Helper to fetch the auto-filled project for an employee on a given date.
 * 1. Checks the last attendance record before the date with a project.
 * 2. If not found, falls back to the employee's default project.
 */
function getAutoFilledProject(db, employeeId, date) {
  // 1. Get last attendance entry with a project before date
  const lastRec = db.prepare(`
    SELECT project_id, COALESCE(project_name, site_name) AS project_name
    FROM attendance
    WHERE employee_id = ?
      AND date < ?
      AND (project_id IS NOT NULL OR (project_name IS NOT NULL AND project_name != '') OR (site_name IS NOT NULL AND site_name != ''))
    ORDER BY date DESC
    LIMIT 1
  `).get(employeeId, date);

  if (lastRec) {
    return {
      projectId: lastRec.project_id,
      projectName: lastRec.project_name || '',
      isAutoFilled: true
    };
  }

  // 2. Fall back to employee's default project
  const emp = db.prepare(`
    SELECT e.project_id, p.name AS project_name
    FROM employees e
    LEFT JOIN projects p ON p.id = e.project_id
    WHERE e.id = ?
  `).get(employeeId);

  if (emp && emp.project_id) {
    return {
      projectId: emp.project_id,
      projectName: emp.project_name || '',
      isAutoFilled: true
    };
  }

  return {
    projectId: null,
    projectName: '',
    isAutoFilled: false
  };
}



module.exports = function registerAttendanceHandlers(ipcMain) {

  // ── Mark Attendance (upsert) ──────────────────────────────────────────────
  ipcMain.handle('attendance:mark', async (_, data) => {
    try {
      const { 
        employeeId, date, status, notes, markedBy, checkIn, checkOut, 
        isSundayWork, projectName, projectId, userRole, isFinalized,
        extraShiftType, extraIn, extraOut, extraNotes
      } = data;
      let { overtimeHours } = data;
      
      const db = getDB();

      // RBAC: HR can only mark/edit Current Day or Previous Day (2-day rule) unless hr_edit_past_attendance is enabled
      if (userRole === 'hr') {
        const hrEditPastAttSetting = db.prepare("SELECT value FROM settings WHERE key = 'hr_edit_past_attendance'").get();
        const canEditPastAtt = hrEditPastAttSetting && hrEditPastAttSetting.value === '1';

        if (!canEditPastAtt) {
          const today = new Date();
          const yesterday = new Date();
          yesterday.setDate(today.getDate() - 1);
          
          const targetDate = new Date(date);
          const isRecent = targetDate.toDateString() === today.toDateString() || targetDate.toDateString() === yesterday.toDateString();
          
          if (!isRecent) {
            return { 
              success: false, 
              error: 'HR can only mark attendance for today or yesterday. For older records, please submit a correction request.',
              needsCorrectionRequest: true 
            };
          }
        }
      }
      
      // Only allow strictly integer OT hours >= 1
      overtimeHours = Math.floor(parseFloat(overtimeHours || 0));
      if (overtimeHours < 1) {
        overtimeHours = 0;
      }
      
      // Check old attendance for audit log
      const oldRec = db.prepare('SELECT status, overtime_hours, project_id, project_name, site_name FROM attendance WHERE employee_id = ? AND date = ?').get(employeeId, date);
      const oldStatus = oldRec ? oldRec.status : 'Not Marked';
      const oldProjId = oldRec ? oldRec.project_id : null;
      
      let finalProjId = projectId;
      let finalProjName = projectName;

      // If they are undefined (not passed from frontend), preserve existing or auto-fill
      if (finalProjId === undefined && finalProjName === undefined) {
        if (oldRec) {
          finalProjId = oldRec.project_id;
          finalProjName = oldRec.project_name || oldRec.site_name || '';
        } else {
          // New record, fetch auto-filled project
          const autoProj = getAutoFilledProject(db, employeeId, date);
          finalProjId = autoProj.projectId;
          finalProjName = autoProj.projectName;
        }
      }

      // If projectId is provided but projectName is not, resolve name from projects table
      if (finalProjId && !finalProjName) {
        const proj = db.prepare('SELECT name FROM projects WHERE id = ?').get(finalProjId);
        if (proj) {
          finalProjName = proj.name;
        }
      }

      // If isFinalized is not provided, default to 0 for new 'P'/'H' records, 
      // or if status is provided but it's not already finalized.
      let finalVal = isFinalized;
      if (finalVal === undefined || finalVal === null) {
        if (status === 'A' || status === 'WO') {
          finalVal = 1; // Auto sign-off for Absent and Weekly Off
        } else {
          // If status is present, it's "Pending Sign-Off" (0)
          finalVal = (status && status !== '') ? 0 : 1;
        }
      }

      const transaction = db.transaction(() => {
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
          overtimeHours, isSundayWork ? 1 : 0, finalProjName, finalProjId, markedBy, finalVal ? 1 : 0,
          extraShiftType, extraIn, extraOut, extraNotes
        );

        if (projectId !== undefined) {
          db.prepare('UPDATE employees SET project_id = ?, updated_at = (strftime(\'%s\', \'now\')) WHERE id = ?')
            .run(finalProjId ? parseInt(finalProjId) : null, employeeId);
        }
      });
      transaction();

      // Audit Log
      const { logActivity } = require('../utils/audit');
      const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(employeeId);
      
      if (!oldRec) {
        logActivity('Attendance', 'Marked', `Marked attendance for ${emp?.name} on ${date}`, null, status, markedBy);
      } else if (oldRec.status !== status || oldRec.overtime_hours !== overtimeHours) {
        logActivity('Attendance', 'Edited', `Changed attendance for ${emp?.name} on ${date}`, `Status: ${oldStatus}, OT: ${oldRec.overtime_hours}`, `Status: ${status}, OT: ${overtimeHours}`, markedBy);
      }

      // Audit Log for Manpower Transfer
      const targetProjId = projectId ? parseInt(projectId) : null;
      if (projectId !== undefined && oldProjId !== targetProjId) {
        logActivity(
          'Projects',
          'Manpower Transfer',
          `Auto-transferred ${emp?.name} to project ID ${targetProjId} via Attendance Module`,
          oldProjId ? `Project ID: ${oldProjId}` : 'Unassigned',
          targetProjId ? `Project ID: ${targetProjId}` : 'Unassigned',
          markedBy
        );
      }

      return { success: true };
    } catch (err) {
      console.error('[Attendance IPC] Error marking attendance:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Attendance Corrections (HR Approval Flow) ──────────────────────────────
  ipcMain.handle('attendance:submitCorrection', async (_, data) => {
    const { employeeId, date, requestedStatus, reason, requestedBy } = data;
    try {
      const db = getDB();
      db.prepare(`
        INSERT INTO attendance_corrections (employee_id, date, requested_status, reason, requested_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(employeeId, date, requestedStatus, reason, requestedBy);
      
      // Also create an alert for admin
      db.prepare(`
        INSERT INTO alerts (title, message, type, module)
        VALUES (?, ?, ?, ?)
      `).run('New Attendance Correction', `HR requested correction for ${date}. Reason: ${reason}`, 'Info', 'Attendance');

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('attendance:getPendingCorrections', async () => {
    try {
      const db = getDB();
      const rows = db.prepare(`
        SELECT ac.*, e.name as employee_name, u.full_name as submitted_by_name
        FROM attendance_corrections ac
        JOIN employees e ON e.id = ac.employee_id
        LEFT JOIN users u ON u.id = ac.requested_by
        WHERE ac.status = 'pending'
      `).all();
      return { success: true, corrections: rows };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('attendance:resolveCorrection', async (_, { id, action, resolvedBy }) => {
    const db = getDB();
    try {
      const corr = db.prepare('SELECT * FROM attendance_corrections WHERE id = ?').get(id);
      if (!corr) return { success: false, error: 'Correction request not found.' };

      if (action === 'approve') {
        // Apply the correction to the main attendance table
        db.prepare(`
          INSERT INTO attendance (employee_id, date, status, marked_by)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(employee_id, date) DO UPDATE SET status = excluded.status, marked_by = excluded.marked_by
        `).run(corr.employee_id, corr.date, corr.requested_status, resolvedBy);
        
        db.prepare('UPDATE attendance_corrections SET status = ?, resolved_by = ?, resolved_at = datetime(\'now\', \'localtime\') WHERE id = ?')
          .run('approved', resolvedBy, id);
      } else {
        db.prepare('UPDATE attendance_corrections SET status = ?, resolved_by = ?, resolved_at = datetime(\'now\', \'localtime\') WHERE id = ?')
          .run('rejected', resolvedBy, id);
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Get All Attendance for an Employee in a Month ─────────────────────────
  // Only returns records from the employee's joining date onward.
  ipcMain.handle('attendance:monthly', async (_, empId, month, year) => {
    try {
      const db = getDB();
      const monthStr = String(month).padStart(2, '0');
      const start = `${year}-${monthStr}-01`;
      const end   = `${year}-${monthStr}-31`;

      // Apply Auto Rules retroactively
      const lastDay = new Date(year, month, 0).getDate();
      const endOfMonthStr = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;
      const tzOffset = new Date().getTimezoneOffset() * 60000;
      const todayStr = new Date(Date.now() - tzOffset).toISOString().split('T')[0];
      const endLimit = endOfMonthStr < todayStr ? endOfMonthStr : todayStr;
      applyAutoAbsentRulesRange(db, start, endLimit);

      // Get employee joining date
      const emp = db.prepare('SELECT joining_date FROM employees WHERE id = ?').get(empId);
      const joiningDate = emp?.joining_date || null;

      // Return all records for the requested month range
      let query = `SELECT * FROM attendance WHERE employee_id = ? AND date >= ? AND date <= ?`;
      const params = [empId, start, end];
      query += ` ORDER BY date ASC`;
      const records = db.prepare(query).all(...params);

      return { success: true, records, joiningDate };
    } catch (err) {
      console.error('[Attendance IPC] Error fetching monthly records:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Bulk: Get all employees' attendance for a single date ─────────────────
  // Returns only employees who had joined on or before `date`.
  ipcMain.handle('attendance:bulk', async (_, date) => {
    try {
      const db = getDB();
      
      // Apply Auto Rules if not future date
      const tzOffset = new Date().getTimezoneOffset() * 60000;
      const today = new Date(Date.now() - tzOffset).toISOString().split('T')[0];
      if (date <= today) {
        applyAutoAbsentRules(db, date);
      }
      
      // Check if requested date is Sunday
      const reqDate = new Date(date + 'T00:00:00');
      const isSun = reqDate.getDay() === 0;
      
      let satStr = '', monStr = '';
      if (isSun) {
        const sat = new Date(reqDate); sat.setDate(sat.getDate() - 1);
        const mon = new Date(reqDate); mon.setDate(mon.getDate() + 1);
        satStr = formatLocalDate(sat);
        monStr = formatLocalDate(mon);
      }

      const rows = db.prepare(`
        SELECT e.id, e.name, e.phone, e.role, e.joining_date,
               a.status, a.notes, a.id as attendance_id,
               a.in_time, a.out_time, a.overtime_hours, a.is_sunday_work, 
               COALESCE(a.project_name, a.site_name) AS site_name, a.project_id, a.is_finalized,
               a.extra_shift_type, a.extra_in, a.extra_out, a.extra_notes,
               (SELECT status FROM attendance WHERE employee_id = e.id AND date = date(?, '-1 day')) AS yesterday_status
               ${isSun ? `, (SELECT status FROM attendance WHERE employee_id = e.id AND date = ?) AS sat_status, (SELECT status FROM attendance WHERE employee_id = e.id AND date = ?) AS mon_status` : ''}
        FROM employees e
        LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = ?
        WHERE e.status = 'active'
          AND (e.joining_date IS NULL OR e.joining_date <= ?)
        ORDER BY e.name ASC
      `).all(...(isSun ? [date, satStr, monStr, date, date] : [date, date, date]));

      const processedRows = rows.map(r => {
        let isAutoFilled = 0;
        let projId = r.project_id;
        let siteName = r.site_name || '';

        // If today's project is not set, resolve the auto-carried project
        if (projId === null && !siteName) {
          const autoProj = getAutoFilledProject(db, r.id, date);
          if (autoProj.isAutoFilled) {
            projId = autoProj.projectId;
            siteName = autoProj.projectName;
            isAutoFilled = 1;
          }
        }

        return {
          ...r,
          project_id: projId,
          site_name: siteName,
          is_project_auto_filled: isAutoFilled
        };
      });

      return { success: true, records: processedRows, isSunday: isSun };
    } catch (err) {
      console.error('[Attendance IPC] Error fetching bulk attendance:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Finalize Attendance ───────────────────────────────────────────────────
  ipcMain.handle('attendance:finalize', async (_, { date, employeeId, month, year, finalizedBy }) => {
    try {
      const db = getDB();
      
      if (employeeId && month && year) {
        const monthStr = String(month).padStart(2, '0');
        const start = `${year}-${monthStr}-01`;
        const end   = `${year}-${monthStr}-31`;
        db.prepare(`
          UPDATE attendance 
          SET is_finalized = 1,
              out_time = COALESCE(NULLIF(out_time, ''), '18:00'),
              overtime_hours = COALESCE(overtime_hours, 0)
          WHERE employee_id = ? AND date >= ? AND date <= ? AND is_finalized = 0
        `).run(employeeId, start, end);
      } else if (date) {
        // Update all pending records for this date
        // Set default check_out to 18:00 and OT to 0 if they are null
        db.prepare(`
          UPDATE attendance 
          SET is_finalized = 1,
              out_time = COALESCE(NULLIF(out_time, ''), '18:00'),
              overtime_hours = COALESCE(overtime_hours, 0)
          WHERE date = ? AND is_finalized = 0
        `).run(date);
      }
      
      return { success: true };
    } catch (err) {
      console.error('[Attendance IPC] Error finalizing attendance:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Unfinalize Attendance (Admin Only) ─────────────────────────────────────
  ipcMain.handle('attendance:unfinalize', async (_, { date }) => {
    try {
      const db = getDB();
      const result = db.prepare(`UPDATE attendance SET is_finalized = 0 WHERE date = ?`).run(date);
      console.log(`[Attendance IPC] Unfinalized ${result.changes} records for date: ${date}`);
      return { success: true, updatedCount: result.changes };
    } catch (err) {
      console.error('[Attendance IPC] Error unfinalizing attendance:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Check Pending Finalization ─────────────────────────────────────────────
  ipcMain.handle('attendance:checkPendingFinalization', async (_, { date }) => {
    try {
      const db = getDB();
      const row = db.prepare(`
        SELECT COUNT(*) as count 
        FROM attendance 
        WHERE date = ? AND is_finalized = 0
      `).get(date);
      
      return { success: true, pendingCount: row.count };
    } catch (err) {
      return { success: false, error: err.message };
    }
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
    try {
      const db = getDB();
      const monthStr = String(month).padStart(2, '0');
      const start = `${year}-${monthStr}-01`;
      const end   = `${year}-${monthStr}-31`;

      // Apply Auto Rules retroactively
      const lastDay = new Date(year, month, 0).getDate();
      const endOfMonthStr = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;
      const tzOffset = new Date().getTimezoneOffset() * 60000;
      const todayStr = new Date(Date.now() - tzOffset).toISOString().split('T')[0];
      const endLimit = endOfMonthStr < todayStr ? endOfMonthStr : todayStr;
      applyAutoAbsentRulesRange(db, start, endLimit);

      // Get employee joining date
      const emp = db.prepare('SELECT joining_date FROM employees WHERE id = ?').get(empId);
      const joiningDate = emp?.joining_date || null;

      // Calculate stats for the full month range to ensure visibility
      const effectiveStart = start;

      const summary = processMonthlyAttendanceStats(db, empId, effectiveStart, end);

      return { success: true, summary };
    } catch (err) {
      console.error('[Attendance IPC] Error fetching summary:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Export Monthly Attendance Register (Excel/PDF) ────────────────────────
  ipcMain.handle('attendance:exportRegister', async (event, month, year, format) => {
    const db = getDB();
    const monthStr = String(month).padStart(2, '0');
    const start = `${year}-${monthStr}-01`;
    const end   = `${year}-${monthStr}-31`;

    // Apply Auto Rules retroactively
    const lastDay = new Date(year, month, 0).getDate();
    const endOfMonthStr = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;
    const tzOffset = new Date().getTimezoneOffset() * 60000;
    const todayStr = new Date(Date.now() - tzOffset).toISOString().split('T')[0];
    const endLimit = endOfMonthStr < todayStr ? endOfMonthStr : todayStr;
    applyAutoAbsentRulesRange(db, start, endLimit);

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

  // ── Get Pending Past Attendance ───────────────────────────────────────────
  ipcMain.handle('attendance:getPendingPast', async (_, days) => {
    try {
      const db = getDB();
      const pastDaysToScan = days || 7; // default 7 days
      const pendingList = [];

      for (let i = 1; i <= pastDaysToScan; i++) {
        const checkDate = new Date();
        checkDate.setDate(checkDate.getDate() - i);
        const tzOffset = checkDate.getTimezoneOffset() * 60000;
        const dateStr = new Date(checkDate.getTime() - tzOffset).toISOString().split('T')[0];

        // Skip Sundays from pending tracker
        if (checkDate.getDay() === 0) continue;

        const missingPastAtt = db.prepare(`
          SELECT e.id, e.name 
          FROM employees e 
          WHERE e.status = 'active' 
            AND e.id NOT IN (SELECT employee_id FROM attendance WHERE date = ?)
          ORDER BY e.name ASC
        `).all(dateStr);

        if (missingPastAtt.length > 0) {
          pendingList.push({
            date: dateStr,
            missingCount: missingPastAtt.length,
            employees: missingPastAtt
          });
        }
      }
      return { success: true, pendingList };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

};
