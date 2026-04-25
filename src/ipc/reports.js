/**
 * LocalPayroll - Reports IPC Handlers
 * Dashboard stats, PDF payslips, monthly reports, Excel exports.
 */

const { getDB } = require('../database/db');
const { generatePayslipPdf, generateMonthlyReportPdf } = require('../utils/pdf');
const { generateMonthlyExcel, generateEmployeeExcel, generateDailyAttendanceExcel, generateAttendanceRangeExcel } = require('../utils/excel');
const { dialog } = require('electron');
const path = require('path');
const fs = require('fs');

module.exports = function registerReportHandlers(ipcMain, getMainWindow) {

  // ── Dashboard Statistics ───────────────────────────────────────────────────
  ipcMain.handle('reports:dashboard', async () => {
    const db = getDB();
    const now = new Date();
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

    // Remaining Salary (approx: Sum of gross salaries for employees not paid this month)
    const salaryRemainingToPay = db.prepare(`
      SELECT COALESCE(SUM(salary), 0) as total FROM employees 
      WHERE status = 'active' AND id NOT IN (
        SELECT employee_id FROM payments WHERE month = ? AND year = ? AND status = 'paid'
      )
    `).get(month, year).total;

    // Outstanding Advances (Total ever given - Total ever deducted)
    const totalAdvancesGiven = db.prepare(`SELECT COALESCE(SUM(amount), 0) as n FROM advances`).get().n;
    const totalAdvancesDeducted = db.prepare(`SELECT COALESCE(SUM(advance_deducted), 0) as n FROM payments`).get().n;
    const outstandingAdvances = totalAdvancesGiven - totalAdvancesDeducted;

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
    const today = now.toISOString().split('T')[0]; // local today in YYYY-MM-DD (rough logic, safe enough)
    const todayAtt = db.prepare(`
      SELECT a.status, a.project_name, e.name
      FROM attendance a JOIN employees e ON e.id = a.employee_id
      WHERE a.date = ?
    `).all(today);

    // Grouping for today
    const presentTodayList = [];
    const absentTodayList = [];
    const projectSums = {};

    todayAtt.forEach(r => {
      if (r.status === 'P' || r.status === 'H') {
        presentTodayList.push(r.name);
      } else if (r.status === 'A') {
        absentTodayList.push(r.name);
      }

      if (r.project_name) {
        projectSums[r.project_name] = (projectSums[r.project_name] || 0) + 1;
      }
    });

    return {
      success: true,
      stats: {
        totalEmployees,
        totalPayroll,
        thisMonthAdvances,
        totalPaidThisMonth,
        salaryRemainingToPay,
        outstandingAdvances,
        pendingCount,
        paidThisMonth: paidCountThisMonth,
        currentMonth: month,
        currentYear: year,
        recentPayments,
        recentAdvances,
        todayAttendance: {
          presentNames: presentTodayList,
          absentNames: absentTodayList,
          projectSums: projectSums
        }
      }
    };
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

};
