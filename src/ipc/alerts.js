const { getDB } = require('../database/db');

function generateAlert(db, title, message, type, module, user_id = null, due_date = null) {
  // Prevent duplicate alerts on the same day for the same message (only for auto-generated ones)
  if (!due_date) {
    const today = new Date().toISOString().split('T')[0];
    const existing = db.prepare(`SELECT id FROM alerts WHERE title = ? AND message = ? AND created_at LIKE ?`).get(title, message, `${today}%`);
    if (existing) return;
  }
  
  db.prepare(`
    INSERT INTO alerts (title, message, type, module, user_id, due_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(title, message, type, module, user_id, due_date);
}

function registerAlertHandlers(ipcMain) {

  // ── Create Manual Alert ───────────────────────────────────────────────────
  ipcMain.handle('alerts:create', async (_, data) => {
    try {
      const db = getDB();
      generateAlert(db, data.title, data.message, data.type, data.module, data.user_id, data.due_date);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Manual & Automated Rule Engine ─────────────────────────────────────────
  ipcMain.handle('alerts:runRules', async () => {
    try {
      const db = getDB();
      const today = new Date().toISOString().split('T')[0];
      const currentHour = new Date().getHours();

      // a) Missing Attendance - If past 11 AM and no attendance for active employees (Skip Sundays)
      if (currentHour >= 11 && new Date().getDay() !== 0) {
        const missingAtt = db.prepare(`
          SELECT e.name 
          FROM employees e 
          WHERE e.status = 'active' 
            AND e.id NOT IN (SELECT employee_id FROM attendance WHERE date = ?)
        `).all(today);

        if (missingAtt.length > 0) {
          generateAlert(db, 'Missing Attendance', `${missingAtt.length} active employees have not been marked present or absent today.`, 'Critical', 'Attendance');
        }
      }

      // a.2) Missing Past Attendance (Scan past 4 days)
      const pastDaysToScan = 4;
      for (let i = 1; i <= pastDaysToScan; i++) {
        const checkDate = new Date();
        checkDate.setDate(checkDate.getDate() - i);
        // Correct timezone offset logic for alert scanning
        const tzOffset = checkDate.getTimezoneOffset() * 60000;
        const dateStr = new Date(checkDate.getTime() - tzOffset).toISOString().split('T')[0];
        
        // Skip Sundays so employees are not alerted or auto-marked absent for their weekly off
        if (checkDate.getDay() === 0) continue;

        const missingPastAtt = db.prepare(`
          SELECT e.id, e.name 
          FROM employees e 
          WHERE e.status = 'active' 
            AND e.id NOT IN (SELECT employee_id FROM attendance WHERE date = ?)
        `).all(dateStr);

        if (missingPastAtt.length > 0) {
          const names = missingPastAtt.map(emp => emp.name).join(', ');
          
          if (i >= 2) {
            // Unmarked for 2+ days: Auto-mark as Absent
            const { logActivity } = require('../utils/audit');
            let autoMarkedCount = 0;
            
            for (const emp of missingPastAtt) {
              // Check if they are on approved leave
              const leave = db.prepare(`
                SELECT id FROM leaves 
                WHERE employee_id = ? 
                  AND status = 'approved' 
                  AND ? BETWEEN from_date AND to_date
              `).get(emp.id, dateStr);

              if (!leave) {
                db.prepare(`
                  INSERT INTO attendance (employee_id, date, status, notes, marked_by, is_finalized)
                  VALUES (?, ?, 'A', 'AUTO ABSENT (Unmarked Timeout)', NULL, 1)
                `).run(emp.id, dateStr);
                
                logActivity('Attendance', 'Auto-Marked', `System auto-marked ${emp.name} as Absent for ${dateStr} due to 2-day unmarked timeout rule.`, null, 'A');
                autoMarkedCount++;
              }
            }

            if (autoMarkedCount > 0) {
              generateAlert(
                db, 
                'Auto-Absent Triggered', 
                `Attendance for ${dateStr} was left pending for 2+ days. ${autoMarkedCount} staff members were auto-marked as Absent.`, 
                'Warning', 
                'Attendance'
              );
            }
          } else {
            // Just pending for 1 day: Alert them
            generateAlert(
              db, 
              'Past Attendance Pending', 
              `Attendance for ${dateStr} is missing for ${missingPastAtt.length} staff members: ${names}.`, 
              'Critical', 
              'Attendance'
            );
          }
        }
      }

      // c) Pending Corrections
      const pendingCorrections = db.prepare(`SELECT COUNT(*) as n FROM attendance_corrections WHERE status = 'pending'`).get().n;
      if (pendingCorrections > 0) {
        generateAlert(db, 'Attendance Corrections', `${pendingCorrections} staff members have submitted attendance correction requests.`, 'Warning', 'Attendance');
      }

      // b) 3 Days Absent continuously
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const str3DaysAgo = threeDaysAgo.toISOString().split('T')[0];
      
      const continuousAbsents = db.prepare(`
        SELECT e.name, COUNT(a.id) as absent_count
        FROM employees e
        JOIN attendance a ON e.id = a.employee_id
        WHERE a.status = 'A' AND a.date >= ? AND a.date <= ?
        GROUP BY e.id
        HAVING absent_count >= 3
      `).all(str3DaysAgo, today);

      continuousAbsents.forEach(emp => {
        generateAlert(db, 'Critical Absence', `${emp.name} has been absent for 3+ days continuously. Please check.`, 'Critical', 'Attendance');
      });

      // 2. Advance Alerts
      // a) High pending advance > 15000
      const highAdvances = db.prepare(`
        SELECT name, balance FROM employees WHERE balance < -1500000 -- In paisa (15000)
      `).all();

      highAdvances.forEach(emp => {
        generateAlert(db, 'High Advance Outstanding', `${emp.name} has an outstanding advance of ₹${Math.abs(emp.balance)/100}.`, 'Warning', 'Advances');
      });

      // 3. Leave Alerts
      const pendingLeaves = db.prepare(`SELECT COUNT(*) as n FROM leaves WHERE status = 'pending'`).get().n;
      if (pendingLeaves > 0) {
        generateAlert(db, 'Pending Leave Requests', `${pendingLeaves} leave requests are waiting for approval.`, 'Info', 'Leaves');
      }

      // 4. Project Alerts
      // a) Delayed projects
      const delayedProjects = db.prepare(`SELECT name FROM projects WHERE status = 'Delayed'`).all();
      delayedProjects.forEach(p => {
        generateAlert(db, 'Project Overdue/Delayed', `Project '${p.name}' is marked as delayed or past its deadline.`, 'Critical', 'Projects');
      });

      // b) Missing Site Report (Past 7 PM)
      if (currentHour >= 19) {
        const missingReports = db.prepare(`
          SELECT p.name
          FROM projects p
          WHERE p.status = 'Ongoing'
            AND (p.project_type IS NULL OR p.project_type != 'Internal Department')
            AND p.id NOT IN (SELECT project_id FROM site_reports WHERE date = ?)
        `).all(today);

        missingReports.forEach(p => {
          generateAlert(db, 'Site Report Missing', `Daily progress report for '${p.name}' was not submitted today.`, 'Warning', 'Projects');
        });
      }

      // 5. Expense Alerts
      const pendingExpenses = db.prepare(`SELECT COUNT(*) as n FROM expenses WHERE status = 'pending'`).get().n;
      if (pendingExpenses > 0) {
        generateAlert(db, 'Pending Expense Approvals', `${pendingExpenses} expense claims need review.`, 'Info', 'Expenses');
      }

      // 6. Staff Document Alerts
      const pendingOcr = db.prepare(`SELECT COUNT(*) as n FROM staff_documents WHERE ocr_status = 'pending'`).get().n;
      if (pendingOcr > 0) {
        generateAlert(db, 'Document OCR Pending', `${pendingOcr} staff documents are waiting for data processing.`, 'Info', 'Documents');
      }
      
      // 7. Birthday Reminders (System Function)
      const bdayToday = db.prepare(`
        SELECT name FROM employees 
        WHERE strftime('%m-%d', dob) = strftime('%m-%d', 'now')
      `).all();
      bdayToday.forEach(emp => {
        generateAlert(db, '🎉 Birthday Reminder', `Today is ${emp.name}'s birthday! Wish them a great day.`, 'Success', 'Employees');
      });

      return { success: true };
    } catch (err) {
      console.error('[Alerts IPC] Error running rules:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Fetch Alerts ──────────────────────────────────────────────────────────
  ipcMain.handle('alerts:get', async (_, filter = {}) => {
    try {
      const db = getDB();
      let query = 'SELECT * FROM alerts WHERE 1=1';
      const params = [];

      if (filter.module) {
        query += ' AND module = ?';
        params.push(filter.module);
      }
      if (filter.priority) {
        query += ' AND type = ?';
        params.push(filter.priority);
      }
      if (typeof filter.isRead !== 'undefined') {
        query += ' AND is_read = ?';
        params.push(filter.isRead ? 1 : 0);
      }

      query += ' ORDER BY created_at DESC LIMIT 200';
      const alerts = db.prepare(query).all(...params);

      // Get Summary
      const summary = db.prepare(`
        SELECT 
          SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unreadCount,
          SUM(CASE WHEN is_read = 0 AND type = 'Critical' THEN 1 ELSE 0 END) as criticalCount
        FROM alerts
      `).get() || { unreadCount: 0, criticalCount: 0 };

      // Pending Approvals count (Leaves + Expenses + Advance Requests + Attendance Corrections)
      const pendingLeaves = db.prepare(`SELECT COUNT(*) as n FROM leaves WHERE status = 'pending'`).get().n;
      const pendingExpenses = db.prepare(`SELECT COUNT(*) as n FROM expenses WHERE status = 'pending'`).get().n;
      const pendingAdvances = db.prepare(`SELECT COUNT(*) as n FROM advance_requests WHERE status = 'pending'`).get().n;
      const pendingAtt = db.prepare(`SELECT COUNT(*) as n FROM attendance_corrections WHERE status = 'pending'`).get().n;
      summary.pendingApprovals = pendingLeaves + pendingExpenses + pendingAdvances + pendingAtt;

      // Auto Resolved Today (Read alerts today)
      const today = new Date().toISOString().split('T')[0];
      summary.resolvedToday = db.prepare(`SELECT COUNT(*) as n FROM alerts WHERE is_read = 1 AND created_at LIKE ?`).get(`${today}%`).n;

      return { success: true, alerts, summary };
    } catch (err) {
      console.error('[Alerts IPC] Error fetching alerts:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Mark Read / Unread ────────────────────────────────────────────────────
  ipcMain.handle('alerts:markRead', async (_, id, isRead) => {
    try {
      const db = getDB();
      if (id === 'all') {
        db.prepare('UPDATE alerts SET is_read = 1').run();
      } else {
        db.prepare('UPDATE alerts SET is_read = ? WHERE id = ?').run(isRead ? 1 : 0, id);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Delete ────────────────────────────────────────────────────────────────
  ipcMain.handle('alerts:delete', async (_, id) => {
    try {
      const db = getDB();
      if (id === 'all') {
        db.prepare('DELETE FROM alerts').run();
      } else {
        db.prepare('DELETE FROM alerts WHERE id = ?').run(id);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = {
  registerAlertHandlers,
  generateAlert
};
