/**
 * LocalPayroll - Employees IPC Handlers
 * Full CRUD for employees. Salary stored as PAISA (integer).
 */

const { getDB } = require('../database/db');

module.exports = function registerEmployeeHandlers(ipcMain) {

  // ── Get All Employees (with optional search filter) ───────────────────────
  ipcMain.handle('employees:getAll', async (_, filter = {}) => {
    const db = getDB();
    let query = `SELECT * FROM employees WHERE 1=1`;
    const params = [];

    if (filter.search) {
      query += ` AND (name LIKE ? OR phone LIKE ?)`;
      params.push(`%${filter.search}%`, `%${filter.search}%`);
    }
    if (filter.status) {
      query += ` AND status = ?`;
      params.push(filter.status);
    }

    query += ` ORDER BY name ASC`;
    const employees = db.prepare(query).all(...params);
    return { success: true, employees };
  });

  // ── Get Single Employee ───────────────────────────────────────────────────
  ipcMain.handle('employees:getOne', async (_, id) => {
    const db = getDB();
    const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
    if (!employee) return { success: false, error: 'Employee not found.' };
    return { success: true, employee };
  });

  // ── Create Employee ───────────────────────────────────────────────────────
  // salary comes in as PAISA from the renderer (renderer converts ₹ → paisa before calling)
  ipcMain.handle('employees:create', async (_, emp) => {
    const db = getDB();
    if (!emp.name || !emp.name.trim()) return { success: false, error: 'Employee name is required.' };

    const result = db.prepare(`
      INSERT INTO employees (name, phone, role, salary, fixed_gross_salary, joining_date, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      emp.name.trim(),
      emp.phone || null,
      emp.role  || null,
      emp.salary || 0,
      emp.fixedGrossSalary || 0,
      emp.joiningDate || null,
      emp.status || 'active',
      emp.notes || null
    );
    return { success: true, employeeId: result.lastInsertRowid };
  });

  // ── Update Employee ───────────────────────────────────────────────────────
  ipcMain.handle('employees:update', async (_, id, emp) => {
    const db = getDB();
    const existing = db.prepare('SELECT id FROM employees WHERE id = ?').get(id);
    if (!existing) return { success: false, error: 'Employee not found.' };

    db.prepare(`
      UPDATE employees
      SET name = ?, phone = ?, role = ?, salary = ?, fixed_gross_salary = ?, joining_date = ?,
          status = ?, notes = ?, updated_at = strftime('%s', 'now')
      WHERE id = ?
    `).run(
      emp.name.trim(),
      emp.phone       || null,
      emp.role        || null,
      emp.salary      || 0,
      emp.fixedGrossSalary || 0,
      emp.joiningDate || null,
      emp.status      || 'active',
      emp.notes       || null,
      id
    );
    return { success: true };
  });

  // ── Delete Employee ────────────────────────────────────────────────────────
  // CASCADE in schema will auto-delete attendance, advances, and payments.
  ipcMain.handle('employees:delete', async (_, id) => {
    const db = getDB();
    const existing = db.prepare('SELECT id FROM employees WHERE id = ?').get(id);
    if (!existing) return { success: false, error: 'Employee not found.' };

    db.prepare('DELETE FROM employees WHERE id = ?').run(id);
    return { success: true };
  });

};
