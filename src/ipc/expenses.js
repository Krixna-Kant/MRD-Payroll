/**
 * LocalPayroll - Expenses IPC Handlers
 * Manage expense claims, approvals, and payroll integration.
 * All amounts are in PAISA.
 */

const { getDB } = require('../database/db');
const fs = require('fs');

module.exports = function registerExpenseHandlers(ipcMain) {

  // ── Get All Expenses (filterable) ─────────────────────────────────────────
  ipcMain.handle('expenses:getAll', async (_, filter = {}) => {
    const db = getDB();
    let query = `
      SELECT ex.*, e.name as employee_name, e.phone as employee_phone
      FROM expenses ex
      JOIN employees e ON e.id = ex.employee_id
      WHERE 1=1
    `;
    const params = [];

    if (filter.employeeId) { query += ` AND ex.employee_id = ?`; params.push(filter.employeeId); }
    if (filter.status)     { query += ` AND ex.status = ?`;      params.push(filter.status); }
    if (filter.category)   { query += ` AND ex.category = ?`;    params.push(filter.category); }
    if (filter.project)    { query += ` AND ex.project_id = ?`;  params.push(filter.project); }
    if (filter.month && filter.year) {
      const monthStr = String(filter.month).padStart(2, '0');
      query += ` AND ex.date LIKE ?`;
      params.push(`${filter.year}-${monthStr}-%`);
    }

    query += ` ORDER BY ex.date DESC, ex.created_at DESC`;
    const expenses = db.prepare(query).all(...params);
    return { success: true, expenses };
  });

  // ── Create Expense Claim ──────────────────────────────────────────────────
  ipcMain.handle('expenses:create', async (_, data) => {
    const db = getDB();
    const { employeeId, projectName, projectId, category, amount, date, remarks, attachmentPath, createdBy, status } = data;

    if (!employeeId || !category || !amount || !date) {
      return { success: false, error: 'Missing required fields.' };
    }

    try {
      const result = db.prepare(`
        INSERT INTO expenses (employee_id, project_name, project_id, category, amount, date, remarks, attachment_path, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(employeeId, projectName || null, projectId || null, category, amount, date, remarks || null, attachmentPath || null, status || 'pending', createdBy || null);

      // Audit Log
      const { logActivity } = require('../utils/audit');
      const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(employeeId);
      logActivity('Expenses', 'Added', `Added ${category} expense of ₹${amount/100} for ${emp?.name}`, null, `Amount: ₹${amount/100}, Status: ${status || 'pending'}`);

      return { success: true, expenseId: result.lastInsertRowid };
    } catch (err) {
      console.error('[Expenses IPC] Error creating expense:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Update Expense Status ─────────────────────────────────────────────────
  ipcMain.handle('expenses:updateStatus', async (_, id, status) => {
    const db = getDB();
    try {
      const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
      db.prepare('UPDATE expenses SET status = ?, updated_at = (strftime(\'%s\', \'now\')) WHERE id = ?').run(status, id);

      // Audit Log
      if (expense) {
        const { logActivity } = require('../utils/audit');
        const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(expense.employee_id);
        logActivity('Expenses', status === 'approved' ? 'Approved' : 'Rejected', `${status === 'approved' ? 'Approved' : 'Rejected'} expense of ₹${expense.amount/100} for ${emp?.name}`, `Status: ${expense.status}`, `Status: ${status}`);
      }

      return { success: true };
    } catch (err) {
      console.error('[Expenses IPC] Error updating status:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Delete Expense Claim ──────────────────────────────────────────────────
  ipcMain.handle('expenses:delete', async (_, id) => {
    const db = getDB();
    try {
      const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
      db.prepare('DELETE FROM expenses WHERE id = ?').run(id);

      // Audit Log
      if (expense) {
        const { logActivity } = require('../utils/audit');
        const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(expense.employee_id);
        logActivity('Expenses', 'Deleted', `Deleted expense of ₹${expense.amount/100} for ${emp?.name}`, `Amount: ₹${expense.amount/100}`, null);
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Get Pending/Approved Unreimbursed Expenses For Employee ───────────────
  // Used by the Payroll system to settle expenses with salary
  ipcMain.handle('expenses:getUnreimbursed', async (_, employeeId) => {
    const db = getDB();
    const expenses = db.prepare(`
      SELECT * FROM expenses 
      WHERE employee_id = ? AND status = 'approved' AND payment_id IS NULL
      ORDER BY date ASC
    `).all(employeeId);
    return { success: true, expenses };
  });

};
