/**
 * LocalPayroll - Payments IPC Handlers
 * Salary calculation engine + payment recording.
 * All monetary values stored and returned in PAISA.
 */

const { getDB } = require('../database/db');
const { logActivity } = require('../utils/audit');
const { processMonthlyAttendanceStats } = require('../utils/rules');

module.exports = function registerPaymentHandlers(ipcMain) {

  // ── INTERNAL HELPER: Calculate single salary ──────────────────────────────
  function calculateSalaryCore(db, empId, employee, month, year) {
    const useAttendance = true;

    const monthStr = String(month).padStart(2, '0');
    const start = `${year}-${monthStr}-01`;
    const end   = `${year}-${monthStr}-31`;

    const joiningDate = employee.joining_date || null;
    const effectiveStart = (joiningDate && joiningDate > start) ? joiningDate : start;

    const stats = processMonthlyAttendanceStats(db, empId, effectiveStart, end);
    const monthlySalary = employee.salary; 
    const daysInMonth = 30; 
    const perDay = monthlySalary / daysInMonth; 
    const hourlyRate = perDay / 8;

    const pAmount = stats.P * perDay;
    const hAmount = stats.H * 0.5 * perDay;
    const woAmount = stats.WO * perDay;
    const attendanceTotal = pAmount + hAmount + woAmount;
    const effectiveSalary = attendanceTotal;

    const totalOvertimeHours = stats.totalOvertimeHours;
    const overtimePay = totalOvertimeHours * hourlyRate;

    const existingPayment = db.prepare(`SELECT * FROM payments WHERE employee_id = ? AND month = ? AND year = ?`).get(empId, month, year);

    const unReimbursedExpenses = existingPayment 
      ? existingPayment.reimbursed_expenses 
      : db.prepare(`
          SELECT COALESCE(SUM(amount), 0) as total FROM (
            SELECT amount FROM expenses
            WHERE employee_id = ? AND status = 'approved' AND payment_id IS NULL AND date <= ?
            UNION ALL
            SELECT amount FROM room_food_expenses
            WHERE employee_id = ? AND paid_by = 'Employee' AND payment_id IS NULL AND date <= ?
          )
        `).get(empId, end, empId, end).total;

    let correctedExpenses = unReimbursedExpenses;
    if (unReimbursedExpenses > 5000000) { 
       correctedExpenses = unReimbursedExpenses / 100;
       db.prepare(`UPDATE expenses SET amount = amount / 100 WHERE employee_id = ? AND status = 'approved' AND payment_id IS NULL AND amount > 5000000`).run(empId);
    }

    const pendingBonuses = existingPayment 
      ? (existingPayment.bonus_amount || 0) 
      : db.prepare(`
          SELECT COALESCE(SUM(approved_bonus), 0) as total FROM bonus_recommendations 
          WHERE employee_id = ? AND month = ? AND year = ? AND status = 'Approved'
        `).get(empId, Number(month), Number(year)).total;

    const liveSalaryEarned = Math.round(effectiveSalary + overtimePay + correctedExpenses + pendingBonuses);
    const liveNetPayable = (employee.balance || 0) + liveSalaryEarned;

    const salaryEarned = existingPayment ? (existingPayment.salary_earned || 0) : liveSalaryEarned;
    const openingBalance = existingPayment ? (existingPayment.opening_balance || 0) : (employee.balance || 0);
    const netPayable = existingPayment ? (openingBalance + (existingPayment.salary_earned || 0) - (existingPayment.other_deductions || 0)) : liveNetPayable;

    const isMismatch = existingPayment && (
       existingPayment.present_days !== stats.P || 
       existingPayment.half_days !== stats.H || 
       existingPayment.wo_days !== stats.WO
    );

    let recoverableAmount = 0;
    if (openingBalance < 0 && salaryEarned > 0) {
      recoverableAmount = Math.min(Math.abs(openingBalance), salaryEarned);
    }
    const adjustedSalary = salaryEarned - recoverableAmount;

    // Inline payroll checks
    const unfinalizedRows = db.prepare(`
      SELECT date FROM attendance 
      WHERE employee_id = ? AND date >= ? AND date <= ? AND is_finalized = 0
      ORDER BY date ASC
    `).all(empId, start, end);
    const unfinalizedDates = unfinalizedRows.map(r => r.date);

    const missingProjectRows = db.prepare(`
      SELECT date FROM attendance 
      WHERE employee_id = ? AND date >= ? AND date <= ? 
        AND project_id IS NULL 
        AND (project_name IS NULL OR project_name = '') 
        AND (site_name IS NULL OR site_name = '')
        AND status NOT IN ('A', 'WO')
      ORDER BY date ASC
    `).all(empId, start, end);
    const missingProjectDates = missingProjectRows.map(r => r.date);

    const pendingOTRows = db.prepare(`
      SELECT date FROM attendance 
      WHERE employee_id = ? AND date >= ? AND date <= ? AND overtime_hours > 0 AND is_finalized = 0
      ORDER BY date ASC
    `).all(empId, start, end);
    const pendingOTDates = pendingOTRows.map(r => r.date);

    const totalRecs = db.prepare(`
      SELECT COUNT(*) as count FROM attendance 
      WHERE employee_id = ? AND date >= ? AND date <= ?
    `).get(empId, effectiveStart, end).count;
    
    const missingAttendance = totalRecs === 0;

    const issues = [];
    if (unfinalizedDates.length > 0) {
      issues.push({ 
        type: 'unfinalized', 
        severity: 'error', 
        message: `${unfinalizedDates.length} days unfinalized`,
        dates: unfinalizedDates
      });
    }
    if (missingProjectDates.length > 0) {
      issues.push({ 
        type: 'missing_project', 
        severity: 'error', 
        message: `Missing project on ${missingProjectDates.length} days`,
        dates: missingProjectDates
      });
    }
    if (pendingOTDates.length > 0) {
      issues.push({ 
        type: 'pending_ot', 
        severity: 'warning', 
        message: `${pendingOTDates.length} days OT pending review`,
        dates: pendingOTDates
      });
    }
    if (missingAttendance) {
      issues.push({ 
        type: 'missing_attendance', 
        severity: 'error', 
        message: 'No attendance records',
        dates: []
      });
    }
    if (isMismatch) {
      issues.push({ 
        type: 'mismatch', 
        severity: 'error', 
        message: 'Attendance changed since payment',
        dates: []
      });
    }

    return {
      employeeId:      empId,
      employeeName:    employee.name,
      employeeRole:    employee.role,
      grossSalary:     monthlySalary,
      attendanceDays:  stats.effectiveDays,
      totalDays:       daysInMonth,
      presentDays:     stats.P,
      halfDays:        stats.H,
      absentDays:      stats.A,
      woDays:          stats.WO,
      useAttendance:   useAttendance,
      effectiveSalary,
      totalOvertimeHours,
      hourlyRate,
      overtimePay,
      foodAllowance: existingPayment ? existingPayment.food_allowance : 0,
      travelAllowance: existingPayment ? existingPayment.travel_allowance : 0,
      otherDeductions: existingPayment ? existingPayment.other_deductions : 0,
      openingBalance,
      salaryEarned,
      recoverableAmount,
      adjustedSalary,
      netPayable,
      totalEarnings:   salaryEarned,
      reimbursedExpenses: unReimbursedExpenses,
      bonusAmount:     pendingBonuses,
      existingPayment: existingPayment || null,
      isMismatch,
      issues
    };
  }

  // ── Audit Payroll ────────────────────────────────────────────────────────
  ipcMain.handle('payments:auditPayroll', async (_, month, year, userRole) => {
    try {
      const db = getDB();
      const setting = db.prepare("SELECT value FROM settings WHERE key = 'hr_access_financials'").get();
      const canAccess = userRole === 'admin' || (userRole === 'hr' && setting && setting.value === '1');
      if (!canAccess) return { success: false, error: 'Unauthorized.' };
      const monthStr = String(month).padStart(2, '0');
      const start = `${year}-${monthStr}-01`;
      const end   = `${year}-${monthStr}-31`;

      const issues = [];
      const stats = { unlocked: 0, missingProject: 0, pendingOT: 0, missingAttendance: 0, duplicates: 0 };

      // 1. Unlocked
      const unlockedRows = db.prepare(`
        SELECT a.id, a.date, a.employee_id, e.name as emp_name, p.name as proj_name, a.status, a.overtime_hours
        FROM attendance a
        JOIN employees e ON e.id = a.employee_id
        LEFT JOIN projects p ON p.id = a.project_id
        WHERE a.date >= ? AND a.date <= ? AND a.is_finalized = 0
      `).all(start, end);

      unlockedRows.forEach(row => {
        stats.unlocked++;
        issues.push({
          type: 'Unlocked Attendance', severity: 'warning', employee: row.emp_name, employeeId: row.employee_id,
          date: row.date, project: row.proj_name || 'Not Assigned', issue: 'Attendance still editable',
          action: 'Lock Now', actionId: 'lock', refId: row.id
        });
      });

      // 2. Missing Projects
      const missingProjectRows = db.prepare(`
        SELECT a.id, a.date, e.name as emp_name, a.employee_id
        FROM attendance a
        JOIN employees e ON e.id = a.employee_id
        WHERE a.date >= ? AND a.date <= ? 
          AND a.project_id IS NULL 
          AND (a.project_name IS NULL OR a.project_name = '') 
          AND (a.site_name IS NULL OR a.site_name = '')
          AND a.status NOT IN ('A', 'WO')
      `).all(start, end);

      missingProjectRows.forEach(row => {
        stats.missingProject++;
        issues.push({
          type: 'Missing Project', severity: 'error', employee: row.emp_name, employeeId: row.employee_id,
          date: row.date, project: 'None', issue: 'Site/Project not assigned',
          action: 'Assign Site', actionId: 'open', refId: row.id
        });
      });

      // 3. Pending OT
      const pendingOTRows = db.prepare(`
        SELECT a.id, a.date, e.name as emp_name, a.employee_id, p.name as proj_name, a.overtime_hours
        FROM attendance a
        JOIN employees e ON e.id = a.employee_id
        LEFT JOIN projects p ON p.id = a.project_id
        WHERE a.date >= ? AND a.date <= ? AND a.overtime_hours > 0 AND a.is_finalized = 0
      `).all(start, end);

      pendingOTRows.forEach(row => {
        stats.pendingOT++;
        if (!issues.some(i => i.refId === row.id && i.type === 'Unlocked Attendance')) {
          issues.push({
            type: 'Pending OT Review', severity: 'warning', employee: row.emp_name, employeeId: row.employee_id,
            date: row.date, project: row.proj_name || 'Main', issue: `${row.overtime_hours} hrs OT not finalized`,
            action: 'Review OT', actionId: 'review_ot', refId: row.id
          });
        }
      });

      // 4. Gaps
      const activeEmployees = db.prepare(`SELECT id, name, joining_date FROM employees WHERE status = 'active'`).all();
      activeEmployees.forEach(emp => {
        const joinDate = emp.joining_date || start;
        const effS = joinDate > start ? joinDate : start;
        const count = db.prepare(`SELECT COUNT(*) as n FROM attendance WHERE employee_id = ? AND date >= ? AND date <= ?`).get(emp.id, effS, end).n;
        if (count === 0) {
          stats.missingAttendance++;
          issues.push({
            type: 'Missing Attendance', severity: 'error', employee: emp.name, employeeId: emp.id,
            date: 'Entire Month', project: 'N/A', issue: 'No attendance records found',
            action: 'Open Attendance', actionId: 'open_month', refId: emp.id
          });
        }
      });

      return { success: true, issues, stats };
    } catch (err) {
      console.error('[Payments IPC] Audit Error:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Calculate Salary ─────────────────────────────────────────────────────
  ipcMain.handle('payments:calculate', async (_, empId, month, year, userRole) => {
    try {
      const db = getDB();
      const setting = db.prepare("SELECT value FROM settings WHERE key = 'hr_access_financials'").get();
      const canAccess = userRole === 'admin' || (userRole === 'hr' && setting && setting.value === '1');
      if (!canAccess) return { success: false, error: 'Unauthorized.' };
      const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(empId);
      if (!employee) return { success: false, error: 'Employee not found.' };
      return { success: true, calculation: calculateSalaryCore(db, empId, employee, month, year) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Calculate All ────────────────────────────────────────────────────────
  ipcMain.handle('payments:calculateAll', async (_, month, year, userRole) => {
    try {
      const db = getDB();
      const setting = db.prepare("SELECT value FROM settings WHERE key = 'hr_access_financials'").get();
      const canAccess = userRole === 'admin' || (userRole === 'hr' && setting && setting.value === '1');
      if (!canAccess) return { success: false, error: 'Unauthorized.' };
      const monthStr = String(month).padStart(2, '0');
      const start = `${year}-${monthStr}-01`;
      const end   = `${year}-${monthStr}-31`;
      const employees = db.prepare(`SELECT * FROM employees WHERE status = 'active' ORDER BY name ASC`).all();
      const calculations = employees.map(emp => calculateSalaryCore(db, emp.id, emp, month, year));
      return { success: true, calculations };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Get Payments ─────────────────────────────────────────────────────────
  ipcMain.handle('payments:get', async (_, filter = {}, userRole) => {
    try {
      const db = getDB();
      const setting = db.prepare("SELECT value FROM settings WHERE key = 'hr_access_financials'").get();
      const canAccess = userRole === 'admin' || (userRole === 'hr' && setting && setting.value === '1');
      if (!canAccess) return { success: false, error: 'Unauthorized.' };
      let query = `SELECT p.*, e.name as employee_name, e.phone as employee_phone, e.role as employee_role FROM payments p JOIN employees e ON e.id = p.employee_id WHERE 1=1`;
      const params = [];
      if (filter.employeeId) { query += ` AND p.employee_id = ?`; params.push(filter.employeeId); }
      if (filter.month)      { query += ` AND p.month = ?`;       params.push(filter.month); }
      if (filter.year)       { query += ` AND p.year = ?`;        params.push(filter.year); }
      if (filter.status)     { query += ` AND p.status = ?`;      params.push(filter.status); }
      query += ` ORDER BY p.year DESC, p.month DESC, e.name ASC`;
      const payments = db.prepare(query).all(...params);
      return { success: true, payments };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Create Payment ───────────────────────────────────────────────────────
  ipcMain.handle('payments:create', async (_, data) => {
    const { userRole } = data;
    const db = getDB();
    const setting = db.prepare("SELECT value FROM settings WHERE key = 'hr_access_financials'").get();
    const canAccess = userRole === 'admin' || (userRole === 'hr' && setting && setting.value === '1');
    if (!canAccess) return { success: false, error: 'Unauthorized.' };
    const {
      employeeId, month, year, grossSalary, attendanceDays, totalDays,
      useAttendance, effectiveSalary, advanceDeducted, otherDeductions,
      foodAllowance, travelAllowance, paidAmount, mode, paymentDate, notes,
      status, createdBy, presentDays, halfDays, absentDays, woDays,
      overtimeHours, overtimePay, salaryEarned, reimbursedExpenses, bonusAmount
    } = data;

    const employee = db.prepare('SELECT balance, name FROM employees WHERE id = ?').get(employeeId);
    if (!employee) return { success: false, error: 'Employee not found.' };

    const transaction = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO payments
          (employee_id, month, year, gross_salary, attendance_days, total_days,
           use_attendance, effective_salary, advance_deducted, other_deductions,
           food_allowance, travel_allowance, net_paid, mode, payment_date, notes,
           status, created_by, present_days, half_days, absent_days, wo_days,
           overtime_hours, overtime_pay, salary_earned, reimbursed_expenses, opening_balance, bonus_amount)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(employee_id, month, year) DO UPDATE SET
          gross_salary=excluded.gross_salary, attendance_days=excluded.attendance_days,
          total_days=excluded.total_days, use_attendance=excluded.use_attendance,
          effective_salary=excluded.effective_salary, advance_deducted=excluded.advance_deducted,
          other_deductions=excluded.other_deductions, food_allowance=excluded.food_allowance,
          travel_allowance=excluded.travel_allowance, net_paid=excluded.net_paid,
          mode=excluded.mode, payment_date=excluded.payment_date, notes=excluded.notes,
          status=excluded.status, present_days=excluded.present_days, half_days=excluded.half_days,
          absent_days=excluded.absent_days, wo_days=excluded.wo_days,
          overtime_hours=excluded.overtime_hours, overtime_pay=excluded.overtime_pay,
          salary_earned=excluded.salary_earned, reimbursed_expenses=excluded.reimbursed_expenses,
          bonus_amount=excluded.bonus_amount
      `).run(
        employeeId, month, year, grossSalary, attendanceDays, totalDays,
        useAttendance ? 1 : 0, effectiveSalary, advanceDeducted || 0,
        otherDeductions || 0, foodAllowance || 0, travelAllowance || 0,
        paidAmount || 0, mode || 'Cash', paymentDate || null,
        notes || null, status || 'paid', createdBy || null,
        presentDays || 0, halfDays || 0, absentDays || 0, woDays || 0,
        overtimeHours || 0, overtimePay || 0, salaryEarned || 0,
        reimbursedExpenses || 0, employee.balance, bonusAmount || 0
      );

      const paymentId = result.lastInsertRowid || db.prepare('SELECT id FROM payments WHERE employee_id=? AND month=? AND year=?').get(employeeId, month, year).id;

      // Delete existing auto-generated records for this payment (re-save scenario)
      db.prepare(`DELETE FROM expenses WHERE payment_id = ? AND category IN ('Food', 'Travel')`).run(paymentId);

      // Infer project from attendance history
      const monthStr = String(month).padStart(2, '0');
      const start = `${year}-${monthStr}-01`;
      const end = `${year}-${monthStr}-31`;

      const inferred = db.prepare(`
        SELECT project_id, project_name, COUNT(*) as count
        FROM attendance
        WHERE employee_id = ? AND date >= ? AND date <= ? AND project_id IS NOT NULL
        GROUP BY project_id, project_name
        ORDER BY count DESC
        LIMIT 1
      `).get(employeeId, start, end);

      const projId = inferred ? inferred.project_id : null;
      const projName = inferred ? inferred.project_name : null;

      // Auto-generate Food & Travel expenses if positive
      if (foodAllowance > 0) {
        db.prepare(`
          INSERT INTO expenses
            (employee_id, category, amount, date, remarks, status, payment_id, project_id, project_name, created_by)
          VALUES (?, 'Food', ?, ?, 'Auto-generated Food Allowance from Payment', 'approved', ?, ?, ?, ?)
        `).run(employeeId, foodAllowance, paymentDate || start, paymentId, projId, projName, createdBy || null);
      }

      if (travelAllowance > 0) {
        db.prepare(`
          INSERT INTO expenses
            (employee_id, category, amount, date, remarks, status, payment_id, project_id, project_name, created_by)
          VALUES (?, 'Travel', ?, ?, 'Auto-generated Travel Allowance from Payment', 'approved', ?, ?, ?, ?)
        `).run(employeeId, travelAllowance, paymentDate || start, paymentId, projId, projName, createdBy || null);
      }

      if (reimbursedExpenses > 0) {
        db.prepare(`UPDATE expenses SET payment_id = ? WHERE employee_id = ? AND status = 'approved' AND payment_id IS NULL AND date <= ?`).run(paymentId, employeeId, end);
        db.prepare(`UPDATE room_food_expenses SET payment_id = ? WHERE employee_id = ? AND paid_by = 'Employee' AND payment_id IS NULL AND date <= ?`).run(paymentId, employeeId, end);
      }

      if (bonusAmount > 0) {
        db.prepare(`UPDATE bonus_recommendations SET status = 'Paid' WHERE employee_id = ? AND month = ? AND year = ? AND status = 'Approved'`).run(employeeId, Number(month), Number(year));
      }

      const finalBalanceChange = (salaryEarned || 0) - (paidAmount || 0) - (otherDeductions || 0);
      const newBalance = employee.balance + finalBalanceChange;
      db.prepare('UPDATE employees SET balance = ?, updated_at = (strftime(\'%s\', \'now\')) WHERE id = ?').run(newBalance, employeeId);

      let currentRunBal = employee.balance;
      if ((salaryEarned || 0) > 0) {
        currentRunBal += salaryEarned;
        db.prepare(`INSERT INTO ledger (employee_id, type, amount, running_balance, date, month, year, notes, reference_id) VALUES (?, 'SALARY', ?, ?, ?, ?, ?, ?, ?)`).run(employeeId, salaryEarned, currentRunBal, paymentDate, month, year, `Salary for ${month}/${year}`, paymentId);
      }
      currentRunBal -= (paidAmount || 0);
      db.prepare(`INSERT INTO ledger (employee_id, type, amount, running_balance, date, month, year, notes, reference_id) VALUES (?, 'PAYMENT', ?, ?, ?, ?, ?, ?, ?)`).run(employeeId, -(paidAmount || 0), currentRunBal, paymentDate, month, year, `Salary Payment/Recovery for ${month}/${year}`, paymentId);

      if ((otherDeductions || 0) > 0) {
        currentRunBal -= otherDeductions;
        db.prepare(`INSERT INTO ledger (employee_id, type, amount, running_balance, date, month, year, notes, reference_id) VALUES (?, 'DEDUCTION', ?, ?, ?, ?, ?, ?, ?)`).run(employeeId, -otherDeductions, currentRunBal, paymentDate, month, year, `Other Deductions for ${month}/${year}`, paymentId);
      }

      return paymentId;
    });

    try {
      const paymentId = transaction();
      logActivity('Payroll', 'Processed', `Processed salary for ${employee.name} (${month}/${year})`, null, `Net Paid: ₹${(paidAmount/100).toFixed(2)}, Mode: ${mode}`);
      return { success: true, paymentId };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Delete Payment ───────────────────────────────────────────────────────
  ipcMain.handle('payments:delete', async (_, { id, operatorId, userRole }) => {
    const db = getDB();
    const setting = db.prepare("SELECT value FROM settings WHERE key = 'hr_access_financials'").get();
    const canAccess = userRole === 'admin' || (userRole === 'hr' && setting && setting.value === '1');
    if (!canAccess) return { success: false, error: 'Unauthorized.' };
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
    if (!payment) return { success: false, error: 'Payment not found.' };
    const employee = db.prepare('SELECT balance, name FROM employees WHERE id = ?').get(payment.employee_id);

    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM payments WHERE id = ?').run(id);
      db.prepare("DELETE FROM expenses WHERE payment_id = ? AND category IN ('Food', 'Travel')").run(id);
      db.prepare('UPDATE expenses SET payment_id = NULL WHERE payment_id = ?').run(id);
      db.prepare('UPDATE room_food_expenses SET payment_id = NULL WHERE payment_id = ?').run(id);
      
      // Revert paid bonuses for this month back to approved
      const p = db.prepare('SELECT month, year, employee_id FROM payments WHERE id = ?').get(id);
      if (p) {
        db.prepare('UPDATE bonus_recommendations SET status = "Approved" WHERE employee_id = ? AND month = ? AND year = ? AND status = "Paid"').run(p.employee_id, p.month, p.year);
      }
      
      // Clean up all ledger entries related to this payment (Salary, Payment, and Deductions)
      db.prepare("DELETE FROM ledger WHERE reference_id = ? AND type IN ('SALARY', 'PAYMENT', 'DEDUCTION')").run(id);
      
      // Recalculate the true balance from remaining ledger history
      const ledgerSum = db.prepare('SELECT SUM(amount) as total FROM ledger WHERE employee_id = ?').get(payment.employee_id).total || 0;
      db.prepare('UPDATE employees SET balance = ? WHERE id = ?').run(ledgerSum, payment.employee_id);
    });

    try {
      transaction();
      logActivity('Payroll', 'Deleted', `Deleted payment record for ${employee?.name || 'ID '+payment.employee_id} (${payment.month}/${payment.year})`);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Get Ledger ───────────────────────────────────────────────────────────
  ipcMain.handle('ledger:get', async (_, employeeId) => {
    const db = getDB();
    const history = db.prepare(`SELECT * FROM ledger WHERE employee_id = ? ORDER BY date DESC, id DESC`).all(employeeId);
    return { success: true, history };
  });

};
