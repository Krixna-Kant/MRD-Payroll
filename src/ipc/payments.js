/**
 * LocalPayroll - Payments IPC Handlers
 * Salary calculation engine + payment recording.
 * All monetary values stored and returned in PAISA.
 * Supports: overtime pay, Sunday double-pay bonus.
 */

const { getDB } = require('../database/db');

module.exports = function registerPaymentHandlers(ipcMain) {

  // ── INTERNAL HELPER: Calculate single salary ──────────────────────────────
  function calculateSalaryCore(db, empId, employee, month, year) {
    const workingDaysSetting = db.prepare(`SELECT value FROM settings WHERE key = 'working_days_per_month'`).get();
    const useAttendanceSetting = db.prepare(`SELECT value FROM settings WHERE key = 'use_attendance_for_salary'`).get();
    const sundayMultiplierSetting = db.prepare(`SELECT value FROM settings WHERE key = 'sunday_pay_multiplier'`).get();
    const totalWorkingDays = parseInt(workingDaysSetting?.value || '26', 10);
    const useAttendance = parseInt(useAttendanceSetting?.value || '0', 10) === 1;
    const sundayMultiplier = parseFloat(sundayMultiplierSetting?.value || '2');

    const monthStr = String(month).padStart(2, '0');
    const start = `${year}-${monthStr}-01`;
    const end   = `${year}-${monthStr}-31`;

    const joiningDate = employee.joining_date || null;
    const effectiveStart = (joiningDate && joiningDate > start) ? joiningDate : start;

    const attRows = db.prepare(`SELECT status, COUNT(*) as count FROM attendance WHERE employee_id = ? AND date >= ? AND date <= ? GROUP BY status`).all(empId, effectiveStart, end);
    const att = { P: 0, A: 0, H: 0 };
    attRows.forEach(r => { att[r.status] = r.count; });
    const effectiveDays = att.P + att.H * 0.5;

    const grossSalary = employee.salary;
    const dailyRate = Math.round(grossSalary / totalWorkingDays);
    const hourlyRate = Math.round(dailyRate / 9);
    
    // Prorate strictly by attendance if useAttendance is true, else full
    const effectiveSalary = useAttendance ? Math.round(dailyRate * effectiveDays) : grossSalary;

    const otRow = db.prepare(`SELECT COALESCE(SUM(overtime_hours), 0) as totalOT FROM attendance WHERE employee_id = ? AND date >= ? AND date <= ? AND status IN ('P', 'H')`).get(empId, effectiveStart, end);
    const totalOvertimeHours = otRow.totalOT;
    const overtimePay = Math.round(totalOvertimeHours * hourlyRate);

    const sunRow = db.prepare(`SELECT COUNT(*) as sundays FROM attendance WHERE employee_id = ? AND date >= ? AND date <= ? AND is_sunday_work = 1 AND status IN ('P', 'H')`).get(empId, effectiveStart, end);
    const sundayWorkDays = sunRow.sundays;
    const sundayBonus = Math.round(sundayWorkDays * dailyRate * (sundayMultiplier - 1));

    const advRow = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM advances WHERE employee_id = ? AND month = ? AND year = ?`).get(empId, month, year);
    const advanceTotal = advRow.total;

    const totalEarnings = effectiveSalary + overtimePay + sundayBonus;
    const netPayable = Math.max(0, totalEarnings - advanceTotal);

    const existingPayment = db.prepare(`SELECT * FROM payments WHERE employee_id = ? AND month = ? AND year = ?`).get(empId, month, year);

    return {
      employeeId:      empId,
      employeeName:    employee.name,
      employeeRole:    employee.role,
      grossSalary,
      attendanceDays:  effectiveDays,
      totalDays:       totalWorkingDays,
      presentDays:     att.P,
      halfDays:        att.H,
      absentDays:      att.A,
      useAttendance,
      effectiveSalary,
      totalOvertimeHours,
      hourlyRate,
      overtimePay,
      sundayWorkDays,
      sundayMultiplier,
      sundayBonus,
      advanceDeducted: advanceTotal,
      otherDeductions: existingPayment ? existingPayment.other_deductions : 0,
      netPayable,
      totalEarnings,
      existingPayment: existingPayment || null,
    };
  }

  // ── Calculate Salary (preview before recording) ───────────────────────────
  ipcMain.handle('payments:calculate', async (_, empId, month, year) => {
    const db = getDB();
    const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(empId);
    if (!employee) return { success: false, error: 'Employee not found.' };
    return { success: true, calculation: calculateSalaryCore(db, empId, employee, month, year) };
  });

  // ── Calculate ALL Active Salaries for Month ───────────────────────────────
  ipcMain.handle('payments:calculateAll', async (_, month, year) => {
    const db = getDB();
    const employees = db.prepare('SELECT * FROM employees WHERE status = "active" ORDER BY name ASC').all();
    const calculations = employees.map(emp => calculateSalaryCore(db, emp.id, emp, month, year));
    return { success: true, calculations };
  });

  // ── Get Payments (filterable) ─────────────────────────────────────────────
  ipcMain.handle('payments:get', async (_, filter = {}) => {
    const db = getDB();
    let query = `
      SELECT p.*, e.name as employee_name, e.phone as employee_phone, e.role as employee_role
      FROM payments p
      JOIN employees e ON e.id = p.employee_id
      WHERE 1=1
    `;
    const params = [];

    if (filter.employeeId) { query += ` AND p.employee_id = ?`; params.push(filter.employeeId); }
    if (filter.month)      { query += ` AND p.month = ?`;       params.push(filter.month); }
    if (filter.year)       { query += ` AND p.year = ?`;        params.push(filter.year); }
    if (filter.status)     { query += ` AND p.status = ?`;      params.push(filter.status); }

    query += ` ORDER BY p.year DESC, p.month DESC, e.name ASC`;
    const payments = db.prepare(query).all(...params);
    return { success: true, payments };
  });

  // ── Create / Upsert Payment ───────────────────────────────────────────────
  ipcMain.handle('payments:create', async (_, data) => {
    const db = getDB();
    const {
      employeeId, month, year, grossSalary, attendanceDays,
      totalDays, useAttendance, effectiveSalary, advanceDeducted,
      otherDeductions, totalEarnings, paidAmount, mode, paymentDate, notes, status, createdBy
    } = data;

    // The core math for partial payments and dues
    // What the company owes the employee before custom payments:
    const theoreticalNet = (totalEarnings || 0) - (advanceDeducted || 0) - (otherDeductions || 0);
    // Overpayment/Underpayment carry forward (paidAmount > theoreticalNet => Positive advance)
    const carryForwardAdvance = (paidAmount || 0) - theoreticalNet;
    // We treat the "paidAmount" as the literal "net_paid" column 
    const netPaid = paidAmount || 0;

    // Enable transaction for safety since we modify multiple tables
    const transaction = db.transaction(() => {
      // 1. Upsert Payment
      const result = db.prepare(`
        INSERT INTO payments
          (employee_id, month, year, gross_salary, attendance_days, total_days,
           use_attendance, effective_salary, advance_deducted, other_deductions,
           net_paid, mode, payment_date, notes, status, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(employee_id, month, year) DO UPDATE SET
          gross_salary     = excluded.gross_salary,
          attendance_days  = excluded.attendance_days,
          total_days       = excluded.total_days,
          use_attendance   = excluded.use_attendance,
          effective_salary = excluded.effective_salary,
          advance_deducted = excluded.advance_deducted,
          other_deductions = excluded.other_deductions,
          net_paid         = excluded.net_paid,
          mode             = excluded.mode,
          payment_date     = excluded.payment_date,
          notes            = excluded.notes,
          status           = excluded.status
      `).run(
        employeeId, month, year, grossSalary, attendanceDays, totalDays,
        useAttendance ? 1 : 0, effectiveSalary, advanceDeducted || 0,
        otherDeductions || 0, netPaid, mode || 'Cash', paymentDate || null,
        notes || null, status || 'paid', createdBy || null
      );

      // 2. Handle Advance Carry Forward
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear  = month === 12 ? year + 1 : year;
      const sysNote   = `[SYSTEM] Carry forward from ${month}/${year}`;

      // Always clear any previous carry-forward generated for next month to avoid duplicates
      db.prepare(`
        DELETE FROM advances 
        WHERE employee_id = ? AND month = ? AND year = ? AND notes LIKE ?
      `).run(employeeId, nextMonth, nextYear, '[SYSTEM]%');

      // If there is advance to carry forward, insert it
      if (typeof carryForwardAdvance === 'number' && carryForwardAdvance !== 0) {
        const customNote = carryForwardAdvance > 0 
            ? `[SYSTEM] Carry forward advance from ${month}/${year}` 
            : `[SYSTEM] Pending arrears from ${month}/${year}`;

        db.prepare(`
          INSERT INTO advances (employee_id, amount, mode, date, month, year, notes, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          employeeId,
          carryForwardAdvance,
          'Cash', // default mode for systemic carry forward
          paymentDate || new Date().toISOString().split('T')[0], // Use today's date
          nextMonth,
          nextYear,
          customNote,
          createdBy || null
        );
      }

      return result.lastInsertRowid;
    });

    try {
      const paymentId = transaction();
      return { success: true, paymentId };
    } catch (err) {
      console.error('[Payments IPC] Error creating payment:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Update Payment ─────────────────────────────────────────────────────────
  ipcMain.handle('payments:update', async (_, id, data) => {
    const db = getDB();
    const existing = db.prepare('SELECT id FROM payments WHERE id = ?').get(id);
    if (!existing) return { success: false, error: 'Payment not found.' };

    db.prepare(`
      UPDATE payments SET
        status = ?, mode = ?, payment_date = ?, notes = ?, net_paid = ?
      WHERE id = ?
    `).run(data.status, data.mode, data.paymentDate, data.notes, data.netPaid, id);
    return { success: true };
  });

  // ── Delete Payment ─────────────────────────────────────────────────────────
  ipcMain.handle('payments:delete', async (_, id) => {
    const db = getDB();
    db.prepare('DELETE FROM payments WHERE id = ?').run(id);
    return { success: true };
  });

};
