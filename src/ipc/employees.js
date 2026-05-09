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
    const employee = db.prepare(`
      SELECT *, 
             (SELECT COALESCE(SUM(amount), 0) FROM advances WHERE employee_id = e.id) as total_advances,
             balance
      FROM employees e
      WHERE id = ?
    `).get(id);
    if (!employee) return { success: false, error: 'Employee not found.' };
    return { success: true, employee };
  });

  // ── Create Employee ───────────────────────────────────────────────────────
  // salary comes in as PAISA from the renderer (renderer converts ₹ → paisa before calling)
  ipcMain.handle('employees:create', async (_, data) => {
    const db = getDB();
    const { name, phone, role, salary, joiningDate, notes, balance } = data;
    
    if (!name || !name.trim()) return { success: false, error: 'Employee name is required.' };

    const transaction = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO employees (name, phone, role, salary, joining_date, notes, balance)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(name.trim(), phone || null, role || null, salary || 0, joiningDate || null, notes || null, balance || 0);

      const empId = result.lastInsertRowid;

      if (balance !== 0) {
        db.prepare(`
          INSERT INTO ledger (employee_id, type, amount, running_balance, date, notes)
          VALUES (?, 'OPENING', ?, ?, ?, ?)
        `).run(empId, balance, balance, new Date().toISOString().split('T')[0], 'Opening Balance at creation');
      }

      return empId;
    });

    try {
      const employeeId = transaction();
      return { success: true, employeeId };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Update Employee Balance (Manual Adjustment) ───────────────────────────
  ipcMain.handle('employees:updateBalance', async (_, { employeeId, amount, notes }) => {
    const db = getDB();
    const employee = db.prepare('SELECT id, balance FROM employees WHERE id = ?').get(employeeId);
    if (!employee) return { success: false, error: 'Employee not found.' };

    const newBalance = employee.balance + amount;
    
    const transaction = db.transaction(() => {
      db.prepare('UPDATE employees SET balance = ? WHERE id = ?').run(newBalance, employeeId);
      
      db.prepare(`
        INSERT INTO ledger (employee_id, type, amount, running_balance, date, notes)
        VALUES (?, 'ADJUSTMENT', ?, ?, ?, ?)
      `).run(employeeId, amount, newBalance, new Date().toISOString().split('T')[0], notes || 'Manual Balance Adjustment');
    });

    try {
      transaction();
      return { success: true, newBalance };
    } catch (err) {
      return { success: false, error: err.message };
    }
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
