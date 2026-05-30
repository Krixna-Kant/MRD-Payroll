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
  ipcMain.handle('reports:dashboard', async (event, params = {}) => {
    try {
      const now = new Date();
      const month = params.month || (now.getMonth() + 1);
      const year  = params.year  || now.getFullYear();
      const db = getDB();
      const today = now.toISOString().split('T')[0];
      const currentHour = now.getHours();

      // 1. Core Counts
      const totalEmployees = db.prepare(`SELECT COUNT(*) as n FROM employees WHERE status = 'active'`).get().n;
      const totalEmployeesTrend = db.prepare(`SELECT COUNT(*) as n FROM employees WHERE created_at >= (strftime('%s', 'now') - 2592000)`).get().n;
      
      // 2. Today's Snapshot
      const todayAtt = db.prepare(`SELECT status FROM attendance WHERE date = ?`).all(today);
      const presentToday = todayAtt.filter(a => a.status === 'P' || a.status === 'H').length;
      const absentToday  = todayAtt.filter(a => a.status === 'A').length;
      const onLeaveToday = db.prepare(`SELECT COUNT(DISTINCT employee_id) as n FROM leaves WHERE status = 'approved' AND from_date <= ? AND to_date >= ?`).get(today, today).n;

      // 3. Financials
      const balanceStats = db.prepare(`
        SELECT 
          COALESCE(SUM(CASE WHEN CAST(balance AS REAL) < 0 THEN ABS(CAST(balance AS REAL)) ELSE 0 END), 0) as total_advances,
          COALESCE(SUM(CASE WHEN CAST(balance AS REAL) > 0 THEN CAST(balance AS REAL) ELSE 0 END), 0) as pending_salary
        FROM employees WHERE status = 'active'
      `).get();
      const outstandingAdvances = balanceStats.total_advances;
      const totalPaidThisMonth = db.prepare(`SELECT COALESCE(SUM(net_paid), 0) as total FROM payments WHERE month = ? AND year = ? AND status = 'paid'`).get(month, year).total;

      // 4. Pending Approvals
      const pendingLeaves = db.prepare(`SELECT COUNT(*) as n FROM leaves WHERE status = 'pending'`).get().n;
      const pendingExpenses = db.prepare(`SELECT COUNT(*) as n FROM expenses WHERE status = 'pending'`).get().n;
      const pendingAdvances = db.prepare(`SELECT COUNT(*) as n FROM advance_requests WHERE status = 'pending'`).get().n;
      const pendingCorrections = db.prepare(`SELECT COUNT(*) as n FROM attendance_corrections WHERE status = 'pending'`).get().n;
      
      const paidCountThisMonth = db.prepare(`SELECT COUNT(*) as n FROM payments WHERE month = ? AND year = ? AND status = 'paid'`).get(month, year).n;
      const pendingPayroll = Math.max(0, totalEmployees - paidCountThisMonth);

      // 5. Attendance Trend (Last 5 Months)
      const attendanceTrend = [];
      for (let i = 4; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const m = d.getMonth() + 1;
        const y = d.getFullYear();
        const mStr = String(m).padStart(2, '0');
        
        const attStats = db.prepare(`
          SELECT 
            SUM(CASE WHEN status IN ('P','H') THEN 1 ELSE 0 END) as present,
            SUM(CASE WHEN status = 'A' THEN 1 ELSE 0 END) as absent
          FROM attendance WHERE (date LIKE ? OR date LIKE ?)
        `).get(`${y}-${mStr}-%`, `%-${mStr}-${y}`);
        
        const leaveCountTrend = db.prepare(`
          SELECT COUNT(DISTINCT employee_id) as n FROM leaves 
          WHERE status = 'approved' AND (from_date LIKE ? OR to_date LIKE ? OR (from_date <= ? AND to_date >= ?))
        `).get(`${y}-${mStr}-%`, `${y}-${mStr}-%`, `${y}-${mStr}-01`, `${y}-${mStr}-28`).n;

        attendanceTrend.push({
          month: d.toLocaleString('default', { month: 'short' }),
          present: attStats.present || 0,
          absent: attStats.absent || 0,
          onLeave: leaveCountTrend || 0
        });
      }

      // 6. Project Status (Top 4)
      const projectStatus = db.prepare(`
        SELECT name, progress, status FROM projects 
        WHERE status IN ('Ongoing', 'Upcoming', 'Delayed')
          AND (project_type IS NULL OR project_type != 'Internal Department')
        ORDER BY progress DESC LIMIT 4
      `).all();

      // 7. Site Reports Summary (Today)
      const ongoingProjectIds = db.prepare(`SELECT id FROM projects WHERE status = 'Ongoing' AND (project_type IS NULL OR project_type != 'Internal Department')`).all().map(p => p.id);
      const submittedTodayCount = db.prepare(`SELECT COUNT(DISTINCT project_id) as n FROM site_reports WHERE date = ?`).get(today).n;
      const siteReportsSummary = {
        submitted: submittedTodayCount,
        pending: Math.max(0, ongoingProjectIds.length - submittedTodayCount),
        overdue: (currentHour >= 19) ? Math.max(0, ongoingProjectIds.length - submittedTodayCount) : 0
      };

      // 8. Documents OCR Summary
      const docsSummary = db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN ocr_status = 'completed' THEN 1 ELSE 0 END) as processed,
          SUM(CASE WHEN ocr_status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN ocr_status = 'failed' THEN 1 ELSE 0 END) as failed
        FROM staff_documents
      `).get() || { total: 0, processed: 0, pending: 0, failed: 0 };

      // 9. Upcoming Birthdays
      const upcomingBirthdays = db.prepare(`
        SELECT name, role, dob 
        FROM employees 
        WHERE strftime('%m-%d', dob) >= strftime('%m-%d', 'now')
        ORDER BY strftime('%m-%d', dob) ASC
        LIMIT 2
      `).all();

      // 10. Alerts Summary (Aggregated)
      const alertsSummary = db.prepare(`
        SELECT module, COUNT(*) as count 
        FROM alerts WHERE is_read = 0 
        GROUP BY module
      `).all();
      const totalUnreadAlerts = alertsSummary.reduce((sum, a) => sum + a.count, 0);

      const stats = {
        totalEmployees,
        totalEmployeesTrend,
        todayAttendance: {
          present: presentToday,
          absent: absentToday,
          onLeave: onLeaveToday,
          total: totalEmployees
        },
        outstandingAdvances,
        totalPaidThisMonth,
        attendanceTrend,
        projectStatus,
        siteReportsSummary,
        docsSummary,
        upcomingBirthdays,
        alertsSummary,
        totalUnreadAlerts,
        pendingApprovals: {
          leaves: pendingLeaves,
          expenses: pendingExpenses,
          advances: pendingAdvances,
          corrections: pendingCorrections,
          payroll: pendingPayroll,
          total: pendingLeaves + pendingExpenses + pendingAdvances + pendingCorrections
        },
        labourCostByProject: db.prepare(`
          SELECT 
            p.name,
            p.progress,
            COALESCE(SUM(CAST(e.salary AS REAL) / 26), 0) as cost
          FROM projects p
          JOIN attendance a ON p.id = a.project_id
          JOIN employees e ON a.employee_id = e.id
          WHERE a.date LIKE ? AND (p.project_type IS NULL OR p.project_type != 'Internal Department')
          GROUP BY p.id
          ORDER BY cost DESC
          LIMIT 5
        `).all(`${year}-${String(month).padStart(2, '0')}-%`),
        currentMonth: month,
        currentYear: year,
        companyName: db.prepare(`SELECT value FROM settings WHERE key = 'company_name'`).get()?.value || 'WorkForce Pro'
      };

      return { success: true, stats };
    } catch (err) {
      console.error('[Reports IPC] Error generating dashboard stats:', err);
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
             a.status, a.in_time AS check_in, a.out_time AS check_out, a.overtime_hours, a.is_sunday_work, a.project_name
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
             a.date, a.status, a.in_time AS check_in, a.out_time AS check_out, a.overtime_hours, a.is_sunday_work, a.project_name
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
      defaultPath: `Calendar_${employee.name.replace(/\s+/g, '_')}_${month}_${year}.pdf`,
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
    
    const records = db.prepare(`
      SELECT e.name, e.role,
             a.status, a.in_time AS check_in, a.out_time AS check_out, a.overtime_hours, a.is_sunday_work, a.project_name
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
             a.status, a.in_time AS check_in, a.out_time AS check_out, a.overtime_hours, a.is_sunday_work, a.project_name
      FROM employees e
      LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = ?
      WHERE e.status = 'active'
        AND (e.joining_date IS NULL OR e.joining_date <= ?)
      ORDER BY e.name ASC
    `).all(date, date);

    if (!records || records.length === 0) return { success: false, error: 'No employees to report.' };

    const companyName = db.prepare(`SELECT value FROM settings WHERE key = 'company_name'`).get()?.value || 'Company Name';
    const summary = extractSummary(records);

    const { app, clipboard, nativeImage } = require('electron');
    const tempDir = app.getPath('temp');
    const tempFilePath = path.join(tempDir, `Daily_Manpower_Report_${date}.png`);

    try {
      await generateManpowerImage(records, date, companyName, tempFilePath);
      
      // Load image and copy to system clipboard
      const img = nativeImage.createFromPath(tempFilePath);
      clipboard.writeImage(img);

      // Clean up temp file
      try {
        fs.unlinkSync(tempFilePath);
      } catch (err) {
        console.error('Failed to delete temp file:', err);
      }

      const [y, m, d] = date.split('-');
      const formattedDate = `${d}-${m}-${y}`;
      const caption = `Daily Manpower Report
Date: ${formattedDate}

Total: ${summary.total}
Present: ${summary.pCount} | Absent: ${summary.aCount} | WO: ${summary.woCount}
OT: ${summary.totalOt} hrs`;

      return { success: true, clipboardCopied: true, caption };
    } catch (err) {
      console.error('[reports:dailyManpowerImage] Error:', err);
      return { success: false, error: err.message };
    }
  });

};
