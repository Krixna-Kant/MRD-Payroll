/**
 * LocalPayroll - Advances IPC Handlers
 * Add, list, and delete salary advances. All amounts in PAISA.
 */

const { getDB } = require('../database/db');

module.exports = function registerAdvanceHandlers(ipcMain) {

  // ── Get Advances (filterable by employee, month, year) ────────────────────
  ipcMain.handle('advances:get', async (_, filter = {}) => {
    const db = getDB();
    let query = `
      SELECT a.*, e.name as employee_name, e.phone as employee_phone
      FROM advances a
      JOIN employees e ON e.id = a.employee_id
      WHERE 1=1
    `;
    const params = [];

    if (filter.employeeId) { query += ` AND a.employee_id = ?`; params.push(filter.employeeId); }
    if (filter.month)      { query += ` AND a.month = ?`;       params.push(filter.month); }
    if (filter.year)       { query += ` AND a.year = ?`;        params.push(filter.year); }

    query += ` ORDER BY a.date DESC`;
    const advances = db.prepare(query).all(...params);
    return { success: true, advances };
  });

  // ── Add Advance ───────────────────────────────────────────────────────────
  // `amount` must arrive in PAISA from the renderer.
  ipcMain.handle('advances:add', async (_, { employeeId, amount, mode, date, month, year, notes, createdBy }) => {
    const db = getDB();

    if (!employeeId) return { success: false, error: 'Employee is required.' };
    if (!amount || amount <= 0) return { success: false, error: 'Amount must be greater than zero.' };

    const employee = db.prepare('SELECT id, balance FROM employees WHERE id = ?').get(employeeId);
    if (!employee) return { success: false, error: 'Employee not found.' };

    const transaction = db.transaction(() => {
      // 1. Insert advance record
      const result = db.prepare(`
        INSERT INTO advances (employee_id, amount, mode, date, month, year, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(employeeId, amount, mode || 'Cash', date, month || null, year || null, notes || null, createdBy || null);

      const advanceId = result.lastInsertRowid;

      // 2. Update employee balance (Advance = subtract from balance)
      const newBalance = employee.balance - amount;
      db.prepare('UPDATE employees SET balance = ?, updated_at = (strftime(\'%s\', \'now\')) WHERE id = ?')
        .run(newBalance, employeeId);

      // 3. Record in ledger
      db.prepare(`
        INSERT INTO ledger (employee_id, type, amount, running_balance, date, month, year, notes, reference_id)
        VALUES (?, 'ADVANCE', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        employeeId, 
        -amount, // Store as negative since it's an advance (employee owes)
        newBalance, 
        date, 
        month || null, 
        year || null, 
        notes || 'Manual Advance', 
        advanceId
      );

      return advanceId;
    });

    try {
      const advanceId = transaction();

      // Audit Log
      const { logActivity } = require('../utils/audit');
      const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(employeeId);
      logActivity('Advances', 'Added', `Added advance of ₹${amount/100} for ${emp?.name}`, null, `Amount: ₹${amount/100}`);

      return { success: true, advanceId };
    } catch (err) {
      console.error('[Advances IPC] Error adding advance:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Delete Advance ─────────────────────────────────────────────────────────
  ipcMain.handle('advances:delete', async (_, id) => {
    const db = getDB();
    const existing = db.prepare('SELECT * FROM advances WHERE id = ?').get(id);
    if (!existing) return { success: false, error: 'Advance record not found.' };

    const employee = db.prepare('SELECT id, balance FROM employees WHERE id = ?').get(existing.employee_id);
    if (!employee) return { success: false, error: 'Employee not found.' };

    const transaction = db.transaction(() => {
      // 1. Delete advance record
      db.prepare('DELETE FROM advances WHERE id = ?').run(id);

      // 2. Revert employee balance (Add amount back)
      const newBalance = employee.balance + existing.amount;
      db.prepare('UPDATE employees SET balance = ?, updated_at = (strftime(\'%s\', \'now\')) WHERE id = ?')
        .run(newBalance, employee.id);

      // 3. Record reversal in ledger
      db.prepare(`
        INSERT INTO ledger (employee_id, type, amount, running_balance, date, month, year, notes, reference_id)
        VALUES (?, 'ADJUSTMENT', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        employee.id,
        existing.amount, // Positive adjustment to reverse negative advance
        newBalance,
        new Date().toISOString().split('T')[0],
        existing.month,
        existing.year,
        `Reversal of Advance ID: ${id}`,
        id
      );
      return true;
    });

    try {
      transaction();

      // Audit Log
      const { logActivity } = require('../utils/audit');
      logActivity('Advances', 'Deleted', `Deleted advance of ₹${existing.amount/100} for ${employee.name}`, `Amount: ₹${existing.amount/100}`, null);

      return { success: true };
    } catch (err) {
      console.error('[Advances IPC] Error deleting advance:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Get total advances for an employee in a specific month/year ───────────
  ipcMain.handle('advances:summary', async (_, empId, month, year) => {
    const db = getDB();
    const row = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM advances
      WHERE employee_id = ? AND month = ? AND year = ?
    `).get(empId, month, year);
    return { success: true, total: row.total }; // in paisa
  });

};
