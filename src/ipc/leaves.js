/**
 * LocalPayroll - Leaves IPC Handlers
 * Manage leave requests and approval workflows.
 */

const { getDB } = require('../database/db');
const { getLeaveStats } = require('../utils/rules');
const fs = require('fs');

/**
 * Helper to format a local Date object as YYYY-MM-DD
 */
function formatLocalDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

module.exports = function registerLeaveHandlers(ipcMain) {

  // ── Get Leave Stats (Balance) ──────────────────────────────────────────────
  ipcMain.handle('leaves:getStats', async (_, { employeeId, year }) => {
    try {
      const db = getDB();
      const stats = getLeaveStats(db, employeeId, year || new Date().getFullYear());
      return { success: true, stats };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Get All Leaves (filterable) ───────────────────────────────────────────
  ipcMain.handle('leaves:getAll', async (_, filter = {}) => {
    const db = getDB();
    let query = `
      SELECT l.*, e.name as employee_name, e.phone as employee_phone
      FROM leaves l
      JOIN employees e ON e.id = l.employee_id
      WHERE 1=1
    `;
    const params = [];

    if (filter.employeeId) { query += ` AND l.employee_id = ?`; params.push(filter.employeeId); }
    if (filter.status)     { query += ` AND l.status = ?`;      params.push(filter.status); }
    if (filter.month && filter.year) {
      const monthStr = String(filter.month).padStart(2, '0');
      query += ` AND (l.from_date LIKE ? OR l.to_date LIKE ?)`;
      params.push(`${filter.year}-${monthStr}-%`, `${filter.year}-${monthStr}-%`);
    }

    query += ` ORDER BY l.created_at DESC`;
    const leaves = db.prepare(query).all(...params);
    return { success: true, leaves };
  });

  // ── Create Leave Request ──────────────────────────────────────────────────
  ipcMain.handle('leaves:create', async (_, data) => {
    const db = getDB();
    const { employeeId, type, fromDate, toDate, totalDays, reason, attachmentPath, createdBy } = data;

    if (!employeeId || !type || !fromDate || !toDate || !totalDays) {
      return { success: false, error: 'Missing required fields.' };
    }

    try {
      const result = db.prepare(`
        INSERT INTO leaves (employee_id, type, from_date, to_date, total_days, reason, attachment_path, created_by, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(employeeId, type, fromDate, toDate, totalDays, reason || null, attachmentPath || null, createdBy || null, data.status || 'pending');

      const leaveId = result.lastInsertRowid;

      // 1. Audit Log
      const { logActivity } = require('../utils/audit');
      const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(employeeId);
      logActivity('Leaves', 'Applied', `Applied ${type} leave for ${emp?.name}`, null, `${totalDays} days (${fromDate} to ${toDate})`);

      // 2. If already approved (Admin entry), sync to attendance
      if (data.status === 'approved') {
        const startDate = new Date(fromDate + 'T00:00:00');
        const endDate = new Date(toDate + 'T00:00:00');
        
        let lastYearChecked = null;
        let remainingPaid = 0;

        if (startDate <= endDate) {
          let curr = new Date(startDate);
          while (curr <= endDate) {
            const dateStr = formatLocalDate(curr);
            const currentYear = curr.getFullYear();
            const isSunday = curr.getDay() === 0;

            // Refresh balance if year changes in the loop
            if (currentYear !== lastYearChecked) {
              const stats = getLeaveStats(db, employeeId, currentYear);
              remainingPaid = stats.remaining;
              lastYearChecked = currentYear;
            }
            
            let attStatus = 'A'; 
            let notes = `${type} Leave Approved (LWP)`;

            // RULE: Sundays are always Weekly Off (Paid) and DON'T use quota
            if (isSunday) {
              attStatus = 'WO';
              notes = `Weekly Off (During ${type} Leave)`;
            } else if ((type === 'CL' || type === 'SL') && remainingPaid > 0) {
              attStatus = 'P';
              notes = `${type} Leave Approved (Paid)`;
              remainingPaid--;
            }

            db.prepare(`
              INSERT INTO attendance (employee_id, date, status, notes)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(employee_id, date) DO UPDATE SET 
                status = excluded.status, 
                notes = excluded.notes
            `).run(employeeId, dateStr, attStatus, notes);

            curr.setDate(curr.getDate() + 1);
          }
        }
      }
 else {
        // 3. Generate System Alert for admin only if it's a new request
        db.prepare(`
          INSERT INTO alerts (title, message, type, module)
          VALUES (?, ?, ?, ?)
        `).run('New Leave Request', `${emp?.name} requested ${totalDays} days ${type} leave (${fromDate} to ${toDate}).`, 'Info', 'Leaves');
      }

      return { success: true, leaveId };
    } catch (err) {
      console.error('[Leaves IPC] Error creating leave:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Update Leave Status (Approve/Reject) & Sync Attendance ────────────────
  ipcMain.handle('leaves:updateStatus', async (_, { id, status }) => {
    const db = getDB();
    const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(id);
    if (!leave) return { success: false, error: 'Leave request not found.' };

    const transaction = db.transaction(() => {
      // 1. Update status
      db.prepare('UPDATE leaves SET status = ?, updated_at = (strftime(\'%s\', \'now\')) WHERE id = ?').run(status, id);

      // 2. If approved, sync to attendance
      if (status === 'approved') {
        const year = new Date(leave.from_date).getFullYear();
        const startDate = new Date(leave.from_date + 'T00:00:00');
        const endDate = new Date(leave.to_date + 'T00:00:00');
        
        let lastYearChecked = null;
        let remainingPaid = 0;

        if (startDate <= endDate) {
          let curr = new Date(startDate);
          while (curr <= endDate) {
            const dateStr = formatLocalDate(curr);
            const currentYear = curr.getFullYear();
            const isSunday = curr.getDay() === 0;

            // Refresh balance if year changes in the loop
            if (currentYear !== lastYearChecked) {
              const stats = getLeaveStats(db, leave.employee_id, currentYear);
              remainingPaid = stats.remaining;
              lastYearChecked = currentYear;
            }
            
            let attStatus = 'A'; 
            let notes = `${leave.type} Leave Approved (LWP)`;

            // RULE: Sundays are always Weekly Off (Paid) and DON'T use quota
            if (isSunday) {
              attStatus = 'WO';
              notes = `Weekly Off (During ${leave.type} Leave)`;
            } else if ((leave.type === 'CL' || leave.type === 'SL') && remainingPaid > 0) {
              attStatus = 'P';
              notes = `${leave.type} Leave Approved (Paid)`;
              remainingPaid--;
            }

            db.prepare(`
              INSERT INTO attendance (employee_id, date, status, notes)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(employee_id, date) DO UPDATE SET 
                status = excluded.status, 
                notes = excluded.notes
            `).run(leave.employee_id, dateStr, attStatus, notes);

            curr.setDate(curr.getDate() + 1);
          }
        }
      }
    });

    try {
      transaction();

      // Audit Log
      const { logActivity } = require('../utils/audit');
      const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(leave.employee_id);
      logActivity('Leaves', status === 'approved' ? 'Approved' : 'Rejected', `${status === 'approved' ? 'Approved' : 'Rejected'} leave for ${emp?.name}`, `Status: ${leave.status}`, `Status: ${status}`);

      return { success: true };
    } catch (err) {
      console.error('[Leaves IPC] Error updating status:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Get All Employee Leave Balances ───────────────────────────────────────
  ipcMain.handle('leaves:getAllBalances', async (_, { year }) => {
    try {
      const db = getDB();
      const employees = db.prepare('SELECT id, name, role, joining_date FROM employees WHERE status = "active" ORDER BY name ASC').all();
      
      const balances = employees.map(emp => {
        const stats = getLeaveStats(db, emp.id, year || new Date().getFullYear());
        return {
          id: emp.id,
          name: emp.name,
          role: emp.role,
          joining_date: emp.joining_date,
          ...stats
        };
      });

      return { success: true, balances };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

};
