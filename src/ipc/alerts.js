const { getDB } = require('../database/db');

function generateAlert(db, title, message, type, module) {
  // Prevent duplicate alerts on the same day for the same message
  const today = new Date().toISOString().split('T')[0];
  const existing = db.prepare(`SELECT id FROM alerts WHERE title = ? AND message = ? AND created_at LIKE ?`).get(title, message, `${today}%`);
  
  if (!existing) {
    db.prepare(`
      INSERT INTO alerts (title, message, type, module)
      VALUES (?, ?, ?, ?)
    `).run(title, message, type, module);
  }
}

module.exports = function registerAlertHandlers(ipcMain) {

  // ── Manual & Automated Rule Engine ─────────────────────────────────────────
  ipcMain.handle('alerts:runRules', async () => {
    try {
      const db = getDB();
      const today = new Date().toISOString().split('T')[0];
      const currentHour = new Date().getHours();

      // 1. Attendance Alerts
      // a) Late marked - If past 11 AM and no attendance for active employees
      if (currentHour >= 11) {
        const missingAtt = db.prepare(`
          SELECT e.name 
          FROM employees e 
          WHERE e.status = 'active' 
            AND e.id NOT IN (SELECT employee_id FROM attendance WHERE date = ?)
        `).all(today);

        if (missingAtt.length > 0) {
          generateAlert(db, 'Missing Attendance', `${missingAtt.length} employees have not been marked present or absent today.`, 'Warning', 'Attendance');
        }
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
        generateAlert(db, 'Continuous Absence', `${emp.name} has been absent for 3 or more days continuously.`, 'Critical', 'Attendance');
      });

      // 2. Advance Alerts
      // a) High pending advance > 15000
      const highAdvances = db.prepare(`
        SELECT name, balance FROM employees WHERE balance < -1500000 -- In paisa (15000)
      `).all();

      highAdvances.forEach(emp => {
        generateAlert(db, 'High Advance Outstanding', `${emp.name} has a pending advance of ₹${Math.abs(emp.balance)/100}.`, 'Warning', 'Advances');
      });

      // 3. Leave Alerts
      // a) Pending leaves
      const pendingLeaves = db.prepare(`SELECT COUNT(*) as n FROM leaves WHERE status = 'pending'`).get().n;
      if (pendingLeaves > 0) {
        generateAlert(db, 'Pending Leave Approvals', `There are ${pendingLeaves} leave requests waiting for approval.`, 'Info', 'Leaves');
      }

      // 4. Project Alerts
      // a) Delayed projects
      const delayedProjects = db.prepare(`SELECT name FROM projects WHERE status = 'Delayed'`).all();
      delayedProjects.forEach(p => {
        generateAlert(db, 'Project Delayed', `Project '${p.name}' is marked as delayed.`, 'Critical', 'Projects');
      });

      // b) Site report not submitted today for Ongoing projects (Past 6 PM)
      if (currentHour >= 18) {
        const missingReports = db.prepare(`
          SELECT p.name
          FROM projects p
          WHERE p.status = 'Ongoing'
            AND p.id NOT IN (SELECT project_id FROM site_reports WHERE date = ?)
        `).all(today);

        missingReports.forEach(p => {
          generateAlert(db, 'Missing Site Report', `No daily site report submitted for '${p.name}' today.`, 'Warning', 'Projects');
        });
      }

      // 5. Expense Alerts
      // a) Pending expenses
      const pendingExpenses = db.prepare(`SELECT COUNT(*) as n FROM expenses WHERE status = 'pending'`).get().n;
      if (pendingExpenses > 0) {
        generateAlert(db, 'Pending Expense Approvals', `There are ${pendingExpenses} expense claims waiting for approval.`, 'Info', 'Expenses');
      }

      // 6. Staff Document Alerts
      // a) Pending OCR
      const pendingOcr = db.prepare(`SELECT COUNT(*) as n FROM staff_documents WHERE ocr_status = 'pending'`).get().n;
      if (pendingOcr > 0) {
        generateAlert(db, 'Pending OCR Documents', `${pendingOcr} documents are waiting for data extraction.`, 'Info', 'Documents');
      }

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

};
