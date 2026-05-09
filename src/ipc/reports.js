/**
 * LocalPayroll - Reports IPC Handlers
 * Dashboard stats, PDF payslips, monthly reports, Excel exports.
 */

const { getDB } = require('../database/db');
const { generatePayslipPdf, generateMonthlyReportPdf } = require('../utils/pdf');
const { generateCalendarPdf } = require('../utils/pdfCalendarHtml');
const { generateManpowerPdf, generateManpowerImage, extractSummary } = require('../utils/pdfManpowerHtml');
const { generateMonthlyExcel, generateEmployeeExcel, generateDailyAttendanceExcel, generateAttendanceRangeExcel } = require('../utils/excel');
const { dialog } = require('electron');
const path = require('path');
const fs = require('fs');

module.exports = function registerReportHandlers(ipcMain, getMainWindow) {

  // ── Dashboard Statistics ───────────────────────────────────────────────────
  ipcMain.handle('reports:dashboard', async () => {
    try {
      const now = new Date();
      const db = getDB();
      const month = now.getMonth() + 1;
      const year  = now.getFullYear();

      const totalEmployees = db.prepare(`SELECT COUNT(*) as n FROM employees WHERE status = 'active'`).get().n;
      const totalPayroll   = db.prepare(`SELECT COALESCE(SUM(salary), 0) as total FROM employees WHERE status = 'active'`).get().total;
      
      // This month's data
      const thisMonthAdvances = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM advances WHERE month = ? AND year = ?
      `).get(month, year).total;

      const totalPaidThisMonth = db.prepare(`
         SELECT COALESCE(SUM(net_paid), 0) as total FROM payments WHERE month = ? AND year = ? AND status = 'paid'
      `).get(month, year).total;

      const paidCountThisMonth = db.prepare(`
        SELECT COUNT(*) as n FROM payments WHERE month = ? AND year = ? AND status = 'paid'
      `).get(month, year).n;

      const pendingCount = totalEmployees - paidCountThisMonth;

      // NEW LEDGER-BASED KPI CALCULATIONS
      const balanceStats = db.prepare(`
        SELECT 
          COALESCE(SUM(CASE WHEN CAST(balance AS REAL) < 0 THEN ABS(CAST(balance AS REAL)) ELSE 0 END), 0) as total_advances,
          COALESCE(SUM(CASE WHEN CAST(balance AS REAL) > 0 THEN CAST(balance AS REAL) ELSE 0 END), 0) as pending_salary,
          COALESCE(SUM(CAST(balance AS REAL)), 0) as net_balance
        FROM employees 
        WHERE status = 'active'
      `).get();

      const outstandingAdvances = balanceStats.total_advances;
      const salaryRemainingToPay = balanceStats.pending_salary;
      const netGlobalBalance    = balanceStats.net_balance;

      // Recent 5 payments
      const recentPayments = db.prepare(`
        SELECT p.*, e.name as employee_name
        FROM payments p JOIN employees e ON e.id = p.employee_id
        ORDER BY p.created_at DESC LIMIT 5
      `).all();

      // Recent 5 advances
      const recentAdvances = db.prepare(`
        SELECT a.*, e.name as employee_name
        FROM advances a JOIN employees e ON e.id = a.employee_id
        ORDER BY a.created_at DESC LIMIT 5
      `).all();

      // Today's Attendance snapshot
      const today = now.toISOString().split('T')[0];
      const todayAtt = db.prepare(`
        SELECT a.status, a.project_name, e.name
        FROM attendance a JOIN employees e ON e.id = a.employee_id
        WHERE a.date = ?
      `).all(today);

      const presentTodayList = [];
      const absentTodayList = [];
      const projectSums = {};

      todayAtt.forEach(r => {
        if (r.status === 'P' || r.status === 'H') presentTodayList.push(r.name);
        else if (r.status === 'A') absentTodayList.push(r.name);
        if (r.project_name) projectSums[r.project_name] = (projectSums[r.project_name] || 0) + 1;
      });

      // Company Name
      const companyName = db.prepare(`SELECT value FROM settings WHERE key = 'company_name'`).get()?.value || 'Our Company';

      // Leaves, Expenses, Projects
      const leavesTodayCount = db.prepare(`SELECT COUNT(DISTINCT employee_id) as n FROM leaves WHERE status = 'approved' AND from_date <= ? AND to_date >= ?`).get(today, today).n;
      const pendingLeavesCount = db.prepare(`SELECT COUNT(*) as n FROM leaves WHERE status = 'pending'`).get().n;
      const todayExpenses = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date = ? AND status = 'approved'`).get(today).total;
      const monthlyExpenses = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date LIKE ? AND status = 'approved'`).get(`${year}-${String(month).padStart(2, '0')}-%`).total;
      const pendingExpensesCount = db.prepare(`SELECT COUNT(*) as n FROM expenses WHERE status = 'pending'`).get().n;
      const activeProjectsCount = db.prepare(`SELECT COUNT(*) as n FROM projects WHERE status IN ('Ongoing', 'Upcoming')`).get().n;
      const delayedProjectsCount = db.prepare(`SELECT COUNT(*) as n FROM projects WHERE status = 'Delayed'`).get().n;

      const recentActivities = db.prepare(`SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 6`).all();
      const alertSummary = db.prepare(`SELECT SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread, SUM(CASE WHEN is_read = 0 AND type = 'Critical' THEN 1 ELSE 0 END) as critical FROM alerts`).get() || { unread: 0, critical: 0 };

      // Labour Cost by Project (This Month)
      const firstDayOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDayOfMonth  = `${year}-${String(month).padStart(2, '0')}-31`;
      
      const laborCostData = db.prepare(`
        SELECT a.project_name, SUM(e.salary / 30.0) as cost
        FROM attendance a
        JOIN employees e ON e.id = a.employee_id
        WHERE a.date >= ? AND a.date <= ? AND a.status IN ('P', 'H')
        GROUP BY a.project_name
        ORDER BY cost DESC
      `).all(firstDayOfMonth, lastDayOfMonth);

      // Monthly Attendance Trends (Last 6 Months)
      const monthlyTrends = [];
      const current = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(current.getFullYear(), current.getMonth() - i, 1);
        const m = d.getMonth() + 1;
        const y = d.getFullYear();
        const mStr = String(m).padStart(2, '0');
        const monthLabel = d.toLocaleString('default', { month: 'short' });
        
        // Match both YYYY-MM and DD-MM-YYYY formats just in case
        const count = db.prepare(`
          SELECT COUNT(*) as n FROM attendance 
          WHERE (date LIKE ? OR date LIKE ?) AND status IN ('P', 'H')
        `).get(`${y}-${mStr}%`, `%-${mStr}-${y}`).n;
        
        monthlyTrends.push({ label: monthLabel, value: count });
      }

      // Breakdown of Outstanding Advances
      const advanceBreakdown = db.prepare(`
        SELECT id, name, CAST(balance AS REAL) as amount
        FROM employees 
        WHERE CAST(balance AS REAL) < 0
        ORDER BY CAST(balance AS REAL) ASC
      `).all().map(e => ({ id: e.id, name: e.name, amount: Math.abs(e.amount) }));
      
      console.log(`[Dashboard IPC] Found ${advanceBreakdown.length} employees with advances. Total KPI: ${balanceStats.total_advances}`);

      console.log('[Reports] Dashboard Stats Generated:', { 
        monthlyTrends, 
        laborCost: laborCostData.length,
        advanceBreakdown: advanceBreakdown.length
      });

      return {
        success: true,
        stats: {
          totalEmployees, totalPayroll, thisMonthAdvances, totalPaidThisMonth,
          salaryRemainingToPay, outstandingAdvances, netGlobalBalance, pendingCount,
          paidThisMonth: paidCountThisMonth, currentMonth: month, currentYear: year,
          recentPayments, recentAdvances, recentActivities, companyName,
          projectsStats: { active: activeProjectsCount, delayed: delayedProjectsCount },
          leavesStats: { today: leavesTodayCount, pending: pendingLeavesCount },
          expensesStats: { today: todayExpenses, monthly: monthlyExpenses, pending: pendingExpensesCount },
          alertStats: alertSummary,
          todayAttendance: { presentNames: presentTodayList, absentNames: absentTodayList, projectSums: projectSums },
          laborCostByProject: laborCostData,
          advanceBreakdown: advanceBreakdown
        }
      };
    } catch (err) {
      console.error('[Reports IPC] Dashboard error:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Generate Payslip PDF ───────────────────────────────────────────────────
  ipcMain.handle('reports:payslipPdf', async (event, paymentId) => {
    const db = getDB();
    const payment = db.prepare(`
      SELECT p.*, e.name as employee_name, e.phone as employee_phone,
             e.role as employee_role, e.joining_date
      FROM payments p JOIN employees e ON e.id = p.employee_id
      WHERE p.id = ?
    `).get(paymentId);

    if (!payment) return { success: false, error: 'Payment not found.' };

    const companyName = db.prepare(`SELECT value FROM settings WHERE key = 'company_name'`).get()?.value || 'My Company';

    const timeTag = new Date().getTime().toString().slice(-4);
    const { filePath } = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Save Payslip',
      defaultPath: `Payslip_${payment.employee_name}_${payment.month}_${payment.year}_${timeTag}.pdf`,
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });

    if (!filePath) return { success: false, error: 'Cancelled.' };

    await generatePayslipPdf(payment, companyName, filePath);
    return { success: true, filePath };
  });

  // ── Generate Monthly Report PDF ────────────────────────────────────────────
  ipcMain.handle('reports:monthlyPdf', async (event, month, year) => {
    const db = getDB();
    const payments = db.prepare(`
      SELECT p.*, e.name as employee_name, e.role as employee_role
      FROM payments p JOIN employees e ON e.id = p.employee_id
      WHERE p.month = ? AND p.year = ?
      ORDER BY e.name ASC
    `).all(month, year);

    const companyName = db.prepare(`SELECT value FROM settings WHERE key = 'company_name'`).get()?.value || 'My Company';

    const { filePath } = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Save Monthly Report',
      defaultPath: `Monthly_Report_${month}_${year}.pdf`,
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });

    if (!filePath) return { success: false, error: 'Cancelled.' };

    await generateMonthlyReportPdf(payments, month, year, companyName, filePath);
    return { success: true, filePath };
  });

  // ── Generate Monthly Excel ─────────────────────────────────────────────────
  ipcMain.handle('reports:monthlyExcel', async (event, month, year) => {
    const db = getDB();
    const data = db.prepare(`
      SELECT p.*, e.name as employee_name, e.phone as employee_phone, e.role as employee_role
      FROM payments p JOIN employees e ON e.id = p.employee_id
      WHERE p.month = ? AND p.year = ?
      ORDER BY e.name ASC
    `).all(month, year);

    const { filePath } = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Save Monthly Excel',
      defaultPath: `Monthly_Report_${month}_${year}.xlsx`,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
    });

    if (!filePath) return { success: false, error: 'Cancelled.' };

    await generateMonthlyExcel(data, month, year, filePath);
    return { success: true, filePath };
  });

  // ── Generate Employee Detail Excel ─────────────────────────────────────────
  ipcMain.handle('reports:employeeExcel', async (event, empId) => {
    const db = getDB();
    const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(empId);
    if (!employee) return { success: false, error: 'Employee not found.' };

    const payments  = db.prepare(`SELECT * FROM payments  WHERE employee_id = ? ORDER BY year DESC, month DESC`).all(empId);
    const advances  = db.prepare(`SELECT * FROM advances  WHERE employee_id = ? ORDER BY date DESC`).all(empId);

    const { filePath } = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Save Employee Report',
      defaultPath: `Employee_${employee.name.replace(/\s+/g, '_')}.xlsx`,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
    });

    if (!filePath) return { success: false, error: 'Cancelled.' };

    await generateEmployeeExcel(employee, payments, advances, filePath);
    return { success: true, filePath };
  });

  // ── Generate Daily Attendance Excel ────────────────────────────────────────
  ipcMain.handle('reports:dailyAttendanceExcel', async (event, date) => {
    const db = getDB();
    const records = db.prepare(`
      SELECT e.id, e.name, e.role, e.joining_date,
             a.status, a.check_in, a.check_out, a.overtime_hours, a.is_sunday_work, a.project_name
      FROM employees e
      LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = ?
      WHERE e.status = 'active'
        AND (e.joining_date IS NULL OR e.joining_date <= ?)
      ORDER BY e.name ASC
    `).all(date, date);

    if (!records || records.length === 0) return { success: false, error: 'No active employees to export.' };

    const { filePath } = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Save Daily Attendance',
      defaultPath: `Attendance_${date}.xlsx`,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
    });

    if (!filePath) return { success: false, error: 'Cancelled.' };

    await generateDailyAttendanceExcel(records, date, filePath);
    return { success: true, filePath };
  });

  // ── Generate Attendance Range Excel ────────────────────────────────────────
  ipcMain.handle('reports:attendanceRangeExcel', async (event, params) => {
    const { startDate, endDate, employeeIds } = params;
    const db = getDB();

    // 1. Fetch relevant records
    const placeholders = employeeIds.map(() => '?').join(',');
    const query = `
      SELECT e.id, e.name, e.role, e.joining_date,
             a.date, a.status, a.check_in, a.check_out, a.overtime_hours, a.is_sunday_work, a.project_name
      FROM employees e
      LEFT JOIN attendance a ON a.employee_id = e.id AND a.date >= ? AND a.date <= ?
      WHERE e.id IN (${placeholders})
      ORDER BY a.date ASC, e.name ASC
    `;
    
    const records = db.prepare(query).all(startDate, endDate, ...employeeIds);

    if (!records || records.length === 0) return { success: false, error: 'No attendance data found for the selected range.' };

    const { filePath } = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Save Attendance Report',
      defaultPath: `Attendance_Report_${startDate}_to_${endDate}.xlsx`,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
    });

    if (!filePath) return { success: false, error: 'Cancelled.' };

    await generateAttendanceRangeExcel(records, startDate, endDate, filePath);
    return { success: true, filePath };
  });

  // ── Generate Calendar PDF ──────────────────────────────────────────────────
  ipcMain.handle('reports:calendarPdf', async (event, empId, month, year) => {
    const db = getDB();
    const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(empId);
    if (!employee) return { success: false, error: 'Employee not found.' };

    const companyName = db.prepare(`SELECT value FROM settings WHERE key = 'company_name'`).get()?.value || 'Company Name';

    const monthStr = String(month).padStart(2, '0');
    const start = `${year}-${monthStr}-01`;
    const end   = `${year}-${monthStr}-31`;

    const records = db.prepare(`
      SELECT * FROM attendance 
      WHERE employee_id = ? AND date >= ? AND date <= ? 
      ORDER BY date ASC
    `).all(empId, start, end);

    const { processMonthlyAttendanceStats } = require('../utils/rules');
    const joiningDate = employee.joining_date;
    const effectiveStart = (joiningDate && joiningDate > start) ? joiningDate : start;
    const summary = processMonthlyAttendanceStats(db, empId, effectiveStart, end);

    const { filePath } = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Save Calendar PDF',
      defaultPath: `Calendar_${employee.name.replace(/\\s+/g, '_')}_${month}_${year}.pdf`,
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });

    if (!filePath) return { success: false, error: 'Cancelled.' };

    try {
      await generateCalendarPdf(employee, records, summary, month, year, companyName, filePath);
      return { success: true, filePath };
    } catch (err) {
      console.error('[reports:calendarPdf] Error:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Generate Daily Manpower PDF ────────────────────────────────────────────
  ipcMain.handle('reports:dailyManpowerPdf', async (event, date) => {
    const db = getDB();
    const reqDate = new Date(date);
    const isSun = reqDate.getDay() === 0;
    
    const records = db.prepare(`
      SELECT e.name, e.role,
             a.status, a.check_in, a.check_out, a.overtime_hours, a.is_sunday_work, a.project_name
      FROM employees e
      LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = ?
      WHERE e.status = 'active'
        AND (e.joining_date IS NULL OR e.joining_date <= ?)
      ORDER BY e.name ASC
    `).all(date, date);

    if (!records || records.length === 0) return { success: false, error: 'No employees to report.' };

    const companyName = db.prepare(`SELECT value FROM settings WHERE key = 'company_name'`).get()?.value || 'Company Name';

    const { filePath } = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Save Daily Manpower PDF',
      defaultPath: `Daily_Manpower_Report_${date}.pdf`,
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });

    if (!filePath) return { success: false, error: 'Cancelled.' };

    try {
      await generateManpowerPdf(records, date, companyName, filePath);
      return { success: true, filePath };
    } catch (err) {
      console.error('[reports:dailyManpowerPdf] Error:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Generate Daily Manpower Image (WhatsApp) ───────────────────────────────
  ipcMain.handle('reports:dailyManpowerImage', async (event, date) => {
    const db = getDB();
    
    const records = db.prepare(`
      SELECT e.name, e.role,
             a.status, a.check_in, a.check_out, a.overtime_hours, a.is_sunday_work, a.project_name
      FROM employees e
      LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = ?
      WHERE e.status = 'active'
        AND (e.joining_date IS NULL OR e.joining_date <= ?)
      ORDER BY e.name ASC
    `).all(date, date);

    if (!records || records.length === 0) return { success: false, error: 'No employees to report.' };

    const companyName = db.prepare(`SELECT value FROM settings WHERE key = 'company_name'`).get()?.value || 'Company Name';
    const summary = extractSummary(records);

    const { filePath } = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Save HD Image for WhatsApp',
      defaultPath: `Daily_Manpower_Report_${date}.png`,
      filters: [{ name: 'Image Files', extensions: ['png'] }]
    });

    if (!filePath) return { success: false, error: 'Cancelled.' };

    try {
      await generateManpowerImage(records, date, companyName, filePath);
      
      const [y, m, d] = date.split('-');
      const formattedDate = `${d}-${m}-${y}`;
      const caption = `Daily Manpower Report
Date: ${formattedDate}

Total: ${summary.total}
Present: ${summary.pCount} | Absent: ${summary.aCount} | WO: ${summary.woCount}
OT: ${summary.totalOt} hrs`;

      return { success: true, filePath, caption };
    } catch (err) {
      console.error('[reports:dailyManpowerImage] Error:', err);
      return { success: false, error: err.message };
    }
  });

};
