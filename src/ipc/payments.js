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
    const useAttendanceSetting = db.prepare(`SELECT value FROM settings WHERE key = 'use_attendance_for_salary'`).get();
    const useAttendance = true; // Forced true for this model

    const monthStr = String(month).padStart(2, '0');
    const start = `${year}-${monthStr}-01`;
    const end   = `${year}-${monthStr}-31`;

    const joiningDate = employee.joining_date || null;
    const effectiveStart = (joiningDate && joiningDate > start) ? joiningDate : start;

    const stats = processMonthlyAttendanceStats(db, empId, effectiveStart, end);

    const monthlySalary = employee.salary; // Input is now Monthly Salary
    
    // Step 1: PerDay = Monthly / 30
    const perDay = Math.round(monthlySalary / 30);
    const hourlyRate = Math.round(perDay / 8);

    // Step 2: AttendanceTotal = (P × PerDay) + (H × 0.5 × PerDay) + (WO × PerDay)
    // Formula: Present = Full, WO = Full, Half Day (H) = Half
    const pAmount = Math.round(stats.P * perDay);
    const hAmount = Math.round(stats.H * 0.5 * perDay);
    const woAmount = Math.round(stats.WO * perDay);
    const attendanceTotal = pAmount + hAmount + woAmount;

    // effectiveSalary is strictly attendanceTotal in this model
    const effectiveSalary = attendanceTotal;

    // Step 3: OT Amount = OT Hours × Hourly Rate
    const totalOvertimeHours = stats.totalOvertimeHours;
    const overtimePay = Math.round(totalOvertimeHours * hourlyRate);

    const existingPayment = db.prepare(`SELECT * FROM payments WHERE employee_id = ? AND month = ? AND year = ?`).get(empId, month, year);

    const allAdvRows = db.prepare(`SELECT amount, notes, date FROM advances WHERE employee_id = ? AND month = ? AND year = ?`).all(empId, month, year);
    let manualAdvances = 0;
    let prevMonthDues = 0;
    const advanceList = allAdvRows.map(a => {
      const isSystem = a.notes && a.notes.startsWith('[SYSTEM]');
      if (isSystem) prevMonthDues += a.amount;
      else manualAdvances += a.amount;
      
      const sourceDate = new Date(a.date);
      const sourceMonthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(sourceDate);
      
      return {
        amount: a.amount,
        notes: a.notes,
        isSystem,
        sourceMonth: sourceMonthName
      };
    });

    const advanceTotal = existingPayment ? existingPayment.advance_deducted : (manualAdvances + prevMonthDues);

    // Allowances strictly manual default 0
    const foodAllowance = existingPayment ? existingPayment.food_allowance : 0;
    const travelAllowance = existingPayment ? existingPayment.travel_allowance : 0;
    const pendingDeductions = existingPayment ? existingPayment.other_deductions : 0;

    // Step 4: Gross = AttendanceTotal + OT + Food + Travel
    const grossEarnings = effectiveSalary + overtimePay + foodAllowance + travelAllowance;

    // Step 5: Net = Gross − Advance − Pending
    const netPayable = Math.max(0, grossEarnings - advanceTotal - pendingDeductions);
    
    // Step 6: Payment Adjustment
    const suggestedPaidAmount = netPayable;

    return {
      employeeId:      empId,
      employeeName:    employee.name,
      employeeRole:    employee.role,
      grossSalary:     monthlySalary,
      fixedGrossSalary: 0,
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
      sundayWorkDays:  stats.sundayWorkDays,
      sundayMultiplier: 1,
      sundayBonus:     0,
      foodAllowance,
      travelAllowance,
      advanceDeducted: advanceTotal,
      manualAdvances,
      prevMonthDues,
      advanceList,
      prevMonthName: (new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(year, (month - 2), 1))),
      otherDeductions: pendingDeductions,
      netPayable,
      suggestedPaidAmount,
      totalEarnings:   grossEarnings,
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
      totalEarnings, paidAmount, mode, paymentDate, notes, status, createdBy,
      presentDays, halfDays, absentDays, woDays, overtimeHours, overtimePay
    } = data;

    const netPayable = (data.netPayable || 0); // This was passed from the modal calculation
    let carryForwardAdvance = paidAmount - netPayable;
    
    // We treat the "paidAmount" as the literal "net_paid" column 
    const netPaid = paidAmount || 0;

    // Enable transaction for safety since we modify multiple tables
    const transaction = db.transaction(() => {
      // 1. Upsert Payment
      const result = db.prepare(`
        INSERT INTO payments
          (employee_id, month, year, gross_salary, attendance_days, total_days,
           use_attendance, effective_salary, advance_deducted, other_deductions,
           food_allowance, travel_allowance,
           net_paid, mode, payment_date, notes, status, created_by,
           present_days, half_days, absent_days, wo_days, overtime_hours, overtime_pay)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
          overtime_pay     = excluded.overtime_pay
      `).run(
        employeeId, month, year, grossSalary, attendanceDays, totalDays,
        useAttendance ? 1 : 0, effectiveSalary, advanceDeducted || 0,
        otherDeductions || 0, foodAllowance || 0, travelAllowance || 0,
        netPaid, mode || 'Cash', paymentDate || null,
        notes || null, status || 'paid', createdBy || null,
        presentDays || 0, halfDays || 0, absentDays || 0, woDays || 0, overtimeHours || 0, overtimePay || 0
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
    const payment = db.prepare('SELECT employee_id, month, year FROM payments WHERE id = ?').get(id);
    if (!payment) return { success: false, error: 'Payment not found.' };

    const transaction = db.transaction(() => {
      // 1. Delete the payment record
      db.prepare('DELETE FROM payments WHERE id = ?').run(id);

      // 2. Delete generated carry-forward for NEXT month
      const nextMonth = payment.month === 12 ? 1 : payment.month + 1;
      const nextYear  = payment.month === 12 ? payment.year + 1 : payment.year;
      db.prepare(`
        DELETE FROM advances 
        WHERE employee_id = ? AND month = ? AND year = ? AND notes LIKE ?
      `).run(payment.employee_id, nextMonth, nextYear, '[SYSTEM]%');
    });

    try {
      transaction();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

};
