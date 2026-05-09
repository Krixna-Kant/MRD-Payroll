/**
 * LocalPayroll - Leaves IPC Handlers
 * Manage leave requests and approval workflows.
 */

const { getDB } = require('../database/db');
const fs = require('fs');

module.exports = function registerLeaveHandlers(ipcMain) {

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
        INSERT INTO leaves (employee_id, type, from_date, to_date, total_days, reason, attachment_path, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(employeeId, type, fromDate, toDate, totalDays, reason || null, attachmentPath || null, createdBy || null);

      // Audit Log
      const { logActivity } = require('../utils/audit');
      const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(employeeId);
      logActivity('Leaves', 'Applied', `Applied ${type} leave for ${emp?.name}`, null, `${totalDays} days (${fromDate} to ${toDate})`);

      return { success: true, leaveId: result.lastInsertRowid };
    } catch (err) {
      console.error('[Leaves IPC] Error creating leave:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Update Leave Status (Approve/Reject) & Sync Attendance ────────────────
  ipcMain.handle('leaves:updateStatus', async (_, id, status) => {
    const db = getDB();
    const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(id);
    if (!leave) return { success: false, error: 'Leave request not found.' };

    const transaction = db.transaction(() => {
      // 1. Update status
      db.prepare('UPDATE leaves SET status = ?, updated_at = (strftime(\'%s\', \'now\')) WHERE id = ?').run(status, id);

      // 2. If approved, sync to attendance
      if (status === 'approved') {
        const startDate = new Date(leave.from_date);
        const endDate = new Date(leave.to_date);
        
        // Ensure no infinite loops by sanity checking
        if (startDate <= endDate) {
          let curr = new Date(startDate);
          while (curr <= endDate) {
            const dateStr = curr.toISOString().split('T')[0];
            const attStatus = (leave.type === 'CL' || leave.type === 'SL') ? 'P' : 'A';
            const notes = `${leave.type} Leave Approved`;

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

  // ── Delete Leave Request ──────────────────────────────────────────────────
  ipcMain.handle('leaves:delete', async (_, id) => {
    const db = getDB();
    const leave = db.prepare('SELECT attachment_path FROM leaves WHERE id = ?').get(id);
    if (!leave) return { success: false, error: 'Leave request not found.' };

    try {
      db.prepare('DELETE FROM leaves WHERE id = ?').run(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

};
