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

    const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(employeeId);
    if (!employee) return { success: false, error: 'Employee not found.' };

    const result = db.prepare(`
      INSERT INTO advances (employee_id, amount, mode, date, month, year, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(employeeId, amount, mode || 'Cash', date, month || null, year || null, notes || null, createdBy || null);

    return { success: true, advanceId: result.lastInsertRowid };
  });

  // ── Delete Advance ─────────────────────────────────────────────────────────
  ipcMain.handle('advances:delete', async (_, id) => {
    const db = getDB();
    const existing = db.prepare('SELECT id FROM advances WHERE id = ?').get(id);
    if (!existing) return { success: false, error: 'Advance record not found.' };
    db.prepare('DELETE FROM advances WHERE id = ?').run(id);
    return { success: true };
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
