/**
 * LocalPayroll - Payments IPC Handlers
 * Salary calculation engine + payment recording.
 * All monetary values stored and returned in PAISA.
 * Supports: overtime pay, Sunday double-pay bonus.
 */

const { getDB } = require('../database/db');
const { processMonthlyAttendanceStats } = require('../utils/rules');

module.exports = function registerPaymentHandlers(ipcMain) {

  // ── INTERNAL HELPER: Calculate single salary ──────────────────────────────
  function calculateSalaryCore(db, empId, employee, month, year) {
    const useAttendance = true; // Forced true for this model

    const monthStr = String(month).padStart(2, '0');
    const start = `${year}-${monthStr}-01`;
    const end   = `${year}-${monthStr}-31`;

    const joiningDate = employee.joining_date || null;
    const effectiveStart = (joiningDate && joiningDate > start) ? joiningDate : start;

    const stats = processMonthlyAttendanceStats(db, empId, effectiveStart, end);

    const monthlySalary = employee.salary; 
    
    // Step 1: PerDay = Monthly / 30
    const perDay = Math.round(monthlySalary / 30);
    const hourlyRate = Math.round(perDay / 8);

    // Step 2: AttendanceTotal
    const pAmount = Math.round(stats.P * perDay);
    const hAmount = Math.round(stats.H * 0.5 * perDay);
    const woAmount = Math.round(stats.WO * perDay);
    const attendanceTotal = pAmount + hAmount + woAmount;

    // effectiveSalary is strictly attendanceTotal in this model
    const effectiveSalary = attendanceTotal;

    // Step 3: OT Amount
    const totalOvertimeHours = stats.totalOvertimeHours;
    const overtimePay = Math.round(totalOvertimeHours * hourlyRate);

    // Fetch existing payment to check if we should show live or saved data
    const existingPayment = db.prepare(`SELECT * FROM payments WHERE employee_id = ? AND month = ? AND year = ?`).get(empId, month, year);

    // LIVE calculation (for preview)
    const liveStats = stats;
    // Determine final values: Use saved record if it exists, otherwise use live calculation
    // NEW: Fetch pending approved expenses (that fall within or before this month)
    const unReimbursedExpenses = existingPayment 
      ? existingPayment.reimbursed_expenses 
      : db.prepare(`
          SELECT COALESCE(SUM(amount), 0) as total FROM expenses
          WHERE employee_id = ? AND status = 'approved' AND payment_id IS NULL AND date <= ?
        `).get(empId, end).total;

    const liveSalaryEarned = effectiveSalary + overtimePay + unReimbursedExpenses;
    const liveNetPayable = (employee.balance || 0) + liveSalaryEarned;

    const salaryEarned = existingPayment ? (existingPayment.salary_earned || 0) : (liveSalaryEarned + (existingPayment ? existingPayment.food_allowance + existingPayment.travel_allowance : 0));
    const openingBalance = existingPayment ? (existingPayment.opening_balance || 0) : (employee.balance || 0);
    const netPayable = existingPayment ? (openingBalance + (existingPayment.salary_earned || 0) - (existingPayment.other_deductions || 0)) : liveNetPayable;

    // Mismatch detection: Does live attendance match what was saved?
    const isMismatch = existingPayment && (
       existingPayment.present_days !== liveStats.P || 
       existingPayment.half_days !== liveStats.H || 
       existingPayment.wo_days !== liveStats.WO
    );

    // Allowances
    const foodAllowance = existingPayment ? existingPayment.food_allowance : 0;
    const travelAllowance = existingPayment ? existingPayment.travel_allowance : 0;
    const otherDeductions = existingPayment ? existingPayment.other_deductions : 0;

    // NEW LEDGER LOGIC:
    let recoverableAmount = 0;
    if (openingBalance < 0 && salaryEarned > 0) {
      recoverableAmount = Math.min(Math.abs(openingBalance), salaryEarned);
    }

    const adjustedSalary = salaryEarned - recoverableAmount;
    
    const suggestedPaidAmount = netPayable;

    return {
      employeeId:      empId,
      employeeName:    employee.name,
      employeeRole:    employee.role,
      grossSalary:     monthlySalary,
      attendanceDays:  stats.effectiveDays,
      totalDays:       30,
      presentDays:     stats.P,
      halfDays:        stats.H,
      absentDays:      stats.A,
      woDays:          stats.WO,
      useAttendance:   useAttendance,
      effectiveSalary,
      totalOvertimeHours,
      hourlyRate,
      overtimePay,
      foodAllowance,
      travelAllowance,
      otherDeductions,
      openingBalance,
      salaryEarned,
      recoverableAmount,
      adjustedSalary,
      netPayable,
      totalEarnings:   salaryEarned,
      reimbursedExpenses: unReimbursedExpenses,
      existingPayment: existingPayment || null,
      isMismatch
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
    const employees = db.prepare(`SELECT * FROM employees WHERE status = 'active' ORDER BY name ASC`).all();
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
      otherDeductions, foodAllowance, travelAllowance,
      paidAmount, mode, paymentDate, notes, status, createdBy,
      presentDays, halfDays, absentDays, woDays, overtimeHours, overtimePay,
      salaryEarned, reimbursedExpenses
    } = data;

    const employee = db.prepare('SELECT balance FROM employees WHERE id = ?').get(employeeId);
    if (!employee) return { success: false, error: 'Employee not found.' };

    const netPaid = paidAmount || 0;

    const transaction = db.transaction(() => {
      // 1. Record/Update Payment
      // CRITICAL: We use COALESCE to ensure opening_balance is ONLY set on initial INSERT
      const result = db.prepare(`
        INSERT INTO payments
          (employee_id, month, year, gross_salary, attendance_days, total_days,
           use_attendance, effective_salary, advance_deducted, other_deductions,
           food_allowance, travel_allowance,
           net_paid, mode, payment_date, notes, status, created_by,
           present_days, half_days, absent_days, wo_days, overtime_hours, overtime_pay,
           salary_earned, reimbursed_expenses, opening_balance)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(employee_id, month, year) DO UPDATE SET
          gross_salary     = excluded.gross_salary,
          attendance_days  = excluded.attendance_days,
          total_days       = excluded.total_days,
          use_attendance   = excluded.use_attendance,
          effective_salary = excluded.effective_salary,
          advance_deducted = excluded.advance_deducted,
          other_deductions = excluded.other_deductions,
          food_allowance   = excluded.food_allowance,
          travel_allowance = excluded.travel_allowance,
          net_paid         = excluded.net_paid,
          mode             = excluded.mode,
          payment_date     = excluded.payment_date,
          notes            = excluded.notes,
          status           = excluded.status,
          present_days     = excluded.present_days,
          half_days        = excluded.half_days,
          absent_days      = excluded.absent_days,
          wo_days          = excluded.wo_days,
          overtime_hours   = excluded.overtime_hours,
          overtime_pay     = excluded.overtime_pay,
          salary_earned    = excluded.salary_earned,
          reimbursed_expenses = excluded.reimbursed_expenses
          -- Note: opening_balance is NOT updated here to preserve historical accuracy
      `).run(
        employeeId, month, year, grossSalary, attendanceDays, totalDays,
        useAttendance ? 1 : 0, effectiveSalary, advanceDeducted || 0,
        otherDeductions || 0, foodAllowance || 0, travelAllowance || 0,
        netPaid, mode || 'Cash', paymentDate || null,
        notes || null, status || 'paid', createdBy || null,
        presentDays || 0, halfDays || 0, absentDays || 0, woDays || 0, overtimeHours || 0, overtimePay || 0,
        salaryEarned || 0, reimbursedExpenses || 0, employee.balance
      );

      const paymentId = result.lastInsertRowid || db.prepare('SELECT id FROM payments WHERE employee_id=? AND month=? AND year=?').get(employeeId, month, year).id;

      // 1.5 Update expenses to link to this payment if this is a newly created payment or we are adding to it
      if (reimbursedExpenses > 0) {
        const monthStr = String(month).padStart(2, '0');
        const end = `${year}-${monthStr}-31`;
        db.prepare(`
          UPDATE expenses SET payment_id = ?
          WHERE employee_id = ? AND status = 'approved' AND payment_id IS NULL AND date <= ?
        `).run(paymentId, employeeId, end);
      }

      // 2. Update Employee Balance: New Balance = Old + SalaryEarned - NetPaid - Deductions
      const finalBalanceChange = (salaryEarned || 0) - netPaid - (otherDeductions || 0);
      const newBalance = employee.balance + finalBalanceChange;

      db.prepare('UPDATE employees SET balance = ?, updated_at = (strftime(\'%s\', \'now\')) WHERE id = ?')
        .run(newBalance, employeeId);

      // 3. Record in Ledger
      if ((salaryEarned || 0) > 0) {
        db.prepare(`
          INSERT INTO ledger (employee_id, type, amount, running_balance, date, month, year, notes, reference_id)
          VALUES (?, 'SALARY', ?, ?, ?, ?, ?, ?, ?)
        `).run(employeeId, salaryEarned, employee.balance + salaryEarned, paymentDate, month, year, `Salary for ${month}/${year}`, paymentId);
      }

      // Record payment even if 0 (e.g., full recovery) for audit trail
      db.prepare(`
        INSERT INTO ledger (employee_id, type, amount, running_balance, date, month, year, notes, reference_id)
        VALUES (?, 'PAYMENT', ?, ?, ?, ?, ?, ?, ?)
      `).run(employeeId, -netPaid, newBalance, paymentDate, month, year, `Salary Payment/Recovery for ${month}/${year}`, paymentId);

      // Audit Log
      const { logActivity } = require('../utils/audit');
      logActivity('Payroll', 'Processed', `Processed salary for ${employee.name} (${month}/${year})`, null, `Net Paid: ${netPaid / 100}`);

      return paymentId;
    });

    try {
      const paymentId = transaction();
      return { success: true, paymentId };
    } catch (err) {
      console.error('[Payments IPC] Error creating payment:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Delete Payment ─────────────────────────────────────────────────────────
  ipcMain.handle('payments:delete', async (_, id) => {
    const db = getDB();
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
    if (!payment) return { success: false, error: 'Payment not found.' };

    const employee = db.prepare('SELECT balance FROM employees WHERE id = ?').get(payment.employee_id);

    const transaction = db.transaction(() => {
      // 1. Delete the payment record
      db.prepare('DELETE FROM payments WHERE id = ?').run(id);

      // Revert expenses linked to this payment
      db.prepare('UPDATE expenses SET payment_id = NULL WHERE payment_id = ?').run(id);

      // 2. Revert Balance: Subtract salary, add back net_paid and other_deductions
      const salaryImpact = (payment.effective_salary || 0) + (payment.overtime_pay || 0) + (payment.food_allowance || 0) + (payment.travel_allowance || 0);
      const revertedBalance = (employee ? employee.balance : 0) - salaryImpact + (payment.net_paid || 0) + (payment.other_deductions || 0);

      db.prepare('UPDATE employees SET balance = ? WHERE id = ?').run(revertedBalance, payment.employee_id);

      // 3. Ledger adjustment
      db.prepare(`
        INSERT INTO ledger (employee_id, type, amount, running_balance, date, notes, reference_id)
        VALUES (?, 'ADJUSTMENT', ?, ?, ?, ?, ?)
      `).run(payment.employee_id, -salaryImpact + payment.net_paid, revertedBalance, new Date().toISOString().split('T')[0], `Reversal of Payment ID: ${id}`, id);
    });

    try {
      transaction();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Get Ledger for Employee ────────────────────────────────────────────────
  ipcMain.handle('ledger:get', async (_, employeeId) => {
    const db = getDB();
    const history = db.prepare(`
      SELECT * FROM ledger 
      WHERE employee_id = ? 
      ORDER BY date DESC, id DESC
    `).all(employeeId);
    return { success: true, history };
  });

};
