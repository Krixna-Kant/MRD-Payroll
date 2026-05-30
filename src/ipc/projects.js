const { ipcMain } = require('electron');
const { getDB } = require('../database/db');

module.exports = function registerProjectHandlers() {
  
  // ── Projects CRUD ─────────────────────────────────────────────────────────

  ipcMain.handle('projects:get', async (_, filter = {}) => {
    console.log('[Projects IPC] projects:get called with filter:', JSON.stringify(filter));
    try {
      const db = getDB();
      
      let countQuery = 'SELECT COUNT(*) as count FROM projects WHERE 1=1';
      const countParams = [];
      if (filter.excludeInternal) {
        countQuery += " AND (project_type IS NULL OR project_type != 'Internal Department')";
      }
      const totalInTable = db.prepare(countQuery).get(...countParams).count;
      console.log(`[Projects IPC] TOTAL projects in table: ${totalInTable}`);

      let query = 'SELECT * FROM projects WHERE 1=1';
      const params = [];

      if (filter.status) {
        query += ' AND status = ?';
        params.push(filter.status);
      }
      
      if (filter.excludeInternal) {
        query += " AND (project_type IS NULL OR project_type != 'Internal Department')";
      }
      
      query += ' ORDER BY created_at DESC';
      
      const projects = db.prepare(query).all(...params);
      console.log(`[Projects IPC] Returning ${projects.length} projects to renderer.`);
      
      // If 'simple' filter is requested, return basic data only (used by dropdowns/Adv module)
      if (filter.simple) {
        return { success: true, projects, totalCount: totalInTable };
      }

      const today = new Date().toISOString().split('T')[0];
      const currentMonthPrefix = new Date().toISOString().slice(0, 7);

      // Aggregating operational data (Optimized SQL version)
      projects.forEach(p => {
        try {
          // 1. Material/Other Expenses
          const basicExp = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE project_id = ?`).get(p.id).total;
          
          const rentExp = db.prepare(`
            SELECT COALESCE(SUM(amount_paid), 0) as total 
            FROM room_landlord_payments rp 
            JOIN rooms r ON rp.room_id = r.id 
            WHERE r.project_id = ? AND rp.status = 'Paid'
          `).get(p.id).total;

          const elecExp = db.prepare(`
            SELECT COALESCE(SUM(total_bill_amount), 0) as total 
            FROM room_electricity_readings re 
            JOIN rooms r ON re.room_id = r.id 
            WHERE r.project_id = ? AND re.payer_type = 'Company' AND re.payment_status = 'Paid'
          `).get(p.id).total;

          const foodLedgerExp = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM room_food_expenses WHERE project_id = ?`).get(p.id).total;

          p.totalExpenses = basicExp + rentExp + elecExp + foodLedgerExp;
          // 2. Active Manpower (Today)
          p.presentToday = db.prepare(`SELECT COUNT(DISTINCT employee_id) as n FROM attendance WHERE project_id = ? AND date = ? AND status IN ('P', 'H')`).get(p.id, today).n;

          // 3. Labor Cost (Sum of daily rate * attendance status weight)
          // Bulk calculation in SQL is much faster than JS iteration
          const costQuery = `
            SELECT 
              SUM(
                (e.salary / 26.0) * 
                (CASE WHEN a.status = 'P' THEN 1.0 WHEN a.status = 'H' THEN 0.5 ELSE 0.0 END) * 
                (CASE WHEN a.is_sunday_work = 1 THEN 2.0 ELSE 1.0 END)
              ) as total,
              SUM(
                CASE WHEN a.date LIKE ? THEN
                  (e.salary / 26.0) * 
                  (CASE WHEN a.status = 'P' THEN 1.0 WHEN a.status = 'H' THEN 0.5 ELSE 0.0 END) * 
                  (CASE WHEN a.is_sunday_work = 1 THEN 2.0 ELSE 1.0 END)
                ELSE 0 END
              ) as monthly
            FROM attendance a
            JOIN employees e ON e.id = a.employee_id
            WHERE a.project_id = ?
          `;
          
          const stats = db.prepare(costQuery).get(currentMonthPrefix + '%', p.id);
          p.laborCost = Math.round(stats.total || 0);
          p.monthlyLaborCost = Math.round(stats.monthly || 0);

          // 4. Total Project Cost
          p.totalCost = p.laborCost + p.totalExpenses;

          // 5. Site Reports Count
          p.reportsCount = db.prepare(`SELECT COUNT(*) as n FROM site_reports WHERE project_id = ?`).get(p.id).n;

          // 6. Night Shift Today
          p.nightShiftToday = db.prepare(`SELECT COUNT(DISTINCT employee_id) as n FROM attendance WHERE project_id = ? AND date = ? AND status IN ('P', 'H') AND extra_shift_type = 'night'`).get(p.id, today).n;

          // 7. Manpower Shortage
          const reqManpower = p.required_manpower || 0;
          p.shortage = Math.max(0, reqManpower - p.presentToday);

        } catch (e) {
          console.error(`[Projects IPC] Error calculating stats for project ${p.id}:`, e);
          p.totalExpenses = 0; p.presentToday = 0; p.laborCost = 0; p.totalCost = 0; p.reportsCount = 0; p.nightShiftToday = 0; p.shortage = 0;
        }
      });

      return { success: true, projects, totalCount: totalInTable };
    } catch (err) {
      console.error('[Projects IPC] Error fetching projects:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('projects:dump', async () => {
    try {
      const db = getDB();
      const allRows = db.prepare('SELECT * FROM projects').all();
      const tableInfo = db.prepare('PRAGMA table_info(projects)').all();
      return { success: true, allRows, tableInfo };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('projects:create', async (_, data) => {
    console.log('[Projects IPC] createProject request:', JSON.stringify(data));
    try {
      const db = getDB();
      const {
        name, clientName, code, siteAddress, startDate, endDate, status,
        supervisorName, contactNumber, revenue, progress, currentStage,
        delayReason, expectedCompletion, notes, createdBy,
        projectType, billingCycle, clientEmail, clientPhone, colorTag, requiredManpower
      } = data;

      const result = db.prepare(`
        INSERT INTO projects (
          name, client_name, code, site_address, start_date, end_date,
          status, supervisor_name, contact_number, revenue, progress,
          current_stage, delay_reason, expected_completion, notes, created_by,
          project_type, billing_cycle, client_email, client_phone, color_tag, required_manpower
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        name, clientName || null, code || null, siteAddress || null, startDate || null, endDate || null,
        status || 'Upcoming', supervisorName || null, contactNumber || null, revenue || 0, progress || 0,
        currentStage || null, delayReason || null, expectedCompletion || null, notes || null, createdBy || null,
        projectType || null, billingCycle || null, clientEmail || null, clientPhone || null, colorTag || null, requiredManpower || 0
      );

      console.log('[Projects IPC] Insert result:', result);

      // Audit Log
      const { logActivity } = require('../utils/audit');
      logActivity('Projects', 'Created', `Created project: ${name}`, null, `Status: ${status || 'Upcoming'}`, createdBy);

      return { success: true, id: result.lastInsertRowid };
    } catch (err) {
      console.error('[Projects IPC] Error creating project:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('projects:update', async (_, data) => {
    console.log('[Projects IPC] updateProject request:', JSON.stringify(data));
    try {
      const db = getDB();
      const {
        id, name, clientName, code, siteAddress, startDate, endDate, status,
        supervisorName, contactNumber, revenue, progress, currentStage,
        delayReason, expectedCompletion, notes, operatorId,
        projectType, billingCycle, clientEmail, clientPhone, colorTag, requiredManpower
      } = data;

      if (!id) throw new Error('Project ID is required for update');

      const result = db.prepare(`
        UPDATE projects SET
          name = COALESCE(?, name),
          client_name = COALESCE(?, client_name),
          code = COALESCE(?, code),
          site_address = COALESCE(?, site_address),
          start_date = COALESCE(?, start_date),
          end_date = COALESCE(?, end_date),
          status = COALESCE(?, status),
          supervisor_name = COALESCE(?, supervisor_name),
          contact_number = COALESCE(?, contact_number),
          revenue = COALESCE(?, revenue),
          progress = COALESCE(?, progress),
          current_stage = COALESCE(?, current_stage),
          delay_reason = COALESCE(?, delay_reason),
          expected_completion = COALESCE(?, expected_completion),
          notes = COALESCE(?, notes),
          project_type = COALESCE(?, project_type),
          billing_cycle = COALESCE(?, billing_cycle),
          client_email = COALESCE(?, client_email),
          client_phone = COALESCE(?, client_phone),
          color_tag = COALESCE(?, color_tag),
          required_manpower = COALESCE(?, required_manpower),
          updated_at = (strftime('%s', 'now'))
        WHERE id = ?
      `).run(
        name, clientName, code, siteAddress, startDate, endDate, status,
        supervisorName, contactNumber, revenue, progress, currentStage,
        delayReason, expectedCompletion, notes,
        projectType, billingCycle, clientEmail, clientPhone, colorTag, requiredManpower,
        id
      );

      console.log('[Projects IPC] Update result:', result);

      // Audit Log
      const { logActivity } = require('../utils/audit');
      logActivity('Projects', 'Updated', `Updated project: ${name}`, null, `Status: ${status}`, operatorId);

      return { success: true, changes: result.changes };
    } catch (err) {
      console.error('[Projects IPC] Error updating project:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('projects:delete', async (_, arg) => {
    try {
      const { id, operatorId } = typeof arg === 'object' ? arg : { id: arg };
      const db = getDB();
      const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(id);
      
      const result = db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
      
      if (project) {
        const { logActivity } = require('../utils/audit');
        logActivity('Projects', 'Deleted', `Deleted project: ${project.name}`, null, null, operatorId);
      }

      return { success: true, changes: result.changes };
    } catch (err) {
      console.error('[Projects IPC] Error deleting project:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Site Reports CRUD ─────────────────────────────────────────────────────

  ipcMain.handle('site_reports:get', async (_, filter = {}) => {
    try {
      const db = getDB();
      let query = `
        SELECT sr.*, p.name as project_name 
        FROM site_reports sr
        LEFT JOIN projects p ON sr.project_id = p.id
        WHERE 1=1
      `;
      const params = [];

      if (filter.projectId) {
        query += ' AND sr.project_id = ?';
        params.push(filter.projectId);
      }
      if (filter.date) {
        query += ' AND sr.date = ?';
        params.push(filter.date);
      }

      query += ' ORDER BY sr.date DESC, sr.created_at DESC';

      const reports = db.prepare(query).all(...params);
      
      // Parse photos JSON
      reports.forEach(r => {
        try {
          r.photos = r.photos ? JSON.parse(r.photos) : [];
        } catch(e) {
          r.photos = [];
        }
      });

      return { success: true, reports };
    } catch (err) {
      console.error('[Projects IPC] Error fetching site reports:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('site_reports:create', async (_, data) => {
    try {
      const db = getDB();
      const {
        projectId, date, supervisorName, workDone, manpowerCount,
        otDetails, issues, materialUsed, photos
      } = data;

      const photosJson = JSON.stringify(photos || []);

      const result = db.prepare(`
        INSERT INTO site_reports (
          project_id, date, supervisor_name, work_done, manpower_count,
          ot_details, issues, material_used, photos
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        projectId, date, supervisorName || null, workDone || null,
        manpowerCount || 0, otDetails || null, issues || null,
        materialUsed || null, photosJson
      );

      // Audit Log
      const { logActivity } = require('../utils/audit');
      const proj = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId);
      // Site reports don't have a createdBy field in the schema yet, but we can pass it from renderer.
      logActivity('Projects', 'Report Submitted', `Site report submitted for ${proj?.name} on ${date}`, null, `Manpower: ${manpowerCount || 0}`, supervisorName);

      return { success: true, id: result.lastInsertRowid };
    } catch (err) {
      console.error('[Projects IPC] Error creating site report:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('site_reports:delete', async (_, id) => {
    try {
      const db = getDB();
      db.prepare(`DELETE FROM site_reports WHERE id = ?`).run(id);
      return { success: true };
    } catch (err) {
      console.error('[Projects IPC] Error deleting site report:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('projects:exportCostReport', async (_, projectId) => {
    try {
      const db = getDB();
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
      if (!project) throw new Error('Project not found');

      const expenses = db.prepare('SELECT * FROM expenses WHERE project_id = ? ORDER BY date DESC').all(projectId);
      
      const attendance = db.prepare(`
        SELECT a.*, e.name, e.role 
        FROM attendance a
        JOIN employees e ON e.id = a.employee_id
        WHERE a.project_id = ?
        ORDER BY a.date DESC
      `).all(projectId);

      const rentPayments = db.prepare(`
        SELECT rp.*, r.room_no 
        FROM room_landlord_payments rp 
        JOIN rooms r ON rp.room_id = r.id 
        WHERE r.project_id = ? AND rp.status = 'Paid'
        ORDER BY rp.payment_date DESC
      `).all(projectId);

      const elecPayments = db.prepare(`
        SELECT re.*, r.room_no 
        FROM room_electricity_readings re 
        JOIN rooms r ON re.room_id = r.id 
        WHERE r.project_id = ? AND re.payer_type = 'Company' AND re.payment_status = 'Paid'
        ORDER BY re.payment_date DESC
      `).all(projectId);

      const { dialog, BrowserWindow } = require('electron');
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      
      const { filePath } = await dialog.showSaveDialog(win, {
        title: 'Save Project Report',
        defaultPath: `Project_Report_${project.name.replace(/\s+/g, '_')}.xlsx`,
        filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
      });

      if (!filePath) return { success: false, error: 'Cancelled.' };

      const { generateProjectCostExcel } = require('../utils/excel');
      const roomFoodExpenses = db.prepare(`
        SELECT rf.*, r.room_no, e.name as employee_name
        FROM room_food_expenses rf
        JOIN rooms r ON r.id = rf.room_id
        LEFT JOIN employees e ON e.id = rf.employee_id
        WHERE rf.project_id = ?
        ORDER BY rf.date DESC
      `).all(projectId);
      await generateProjectCostExcel(project, expenses, attendance, rentPayments, elecPayments, roomFoodExpenses, filePath);
      
      return { success: true, filePath };
    } catch (err) {
      console.error('[Projects IPC] Error exporting project report:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('projects:getDashboardDetails', async (_, { projectId, date }) => {
    try {
      const db = getDB();
      const today = date || new Date().toISOString().split('T')[0];
      
      // 1. Project details
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
      if (!project) throw new Error('Project not found');

      // 2. Deployed staff
      const deployedStaff = db.prepare('SELECT id, name, phone, role, salary FROM employees WHERE project_id = ? AND status = \'active\'').all(projectId);

      // 3. Attendance marked today on this project
      const attendanceToday = db.prepare('SELECT employee_id, status, in_time, out_time, overtime_hours, extra_shift_type FROM attendance WHERE project_id = ? AND date = ?').all(projectId, today);

      // 4. Recent attendance history (last 100 entries)
      const attendanceHistory = db.prepare(`
        SELECT a.*, e.name as employee_name, e.role as employee_role 
        FROM attendance a 
        JOIN employees e ON e.id = a.employee_id 
        WHERE a.project_id = ? 
        ORDER BY a.date DESC, a.id DESC LIMIT 100
      `).all(projectId);

      // 5. Project expenses categories
      const foodExp = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE project_id = ? AND category = \'Food\'').get(projectId).total;
      const travelExp = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE project_id = ? AND category = \'Travel\'').get(projectId).total;
      const otherExp = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE project_id = ? AND category NOT IN (\'Food\', \'Travel\')').get(projectId).total;

      // 6. Project accommodation costs
      const rentExp = db.prepare(`
        SELECT COALESCE(SUM(amount_paid), 0) as total 
        FROM room_landlord_payments rp 
        JOIN rooms r ON rp.room_id = r.id 
        WHERE r.project_id = ? AND rp.status = 'Paid'
      `).get(projectId).total;
      
      const elecExp = db.prepare(`
        SELECT COALESCE(SUM(total_bill_amount), 0) as total 
        FROM room_electricity_readings re 
        JOIN rooms r ON re.room_id = r.id 
        WHERE r.project_id = ? AND re.payer_type = 'Company' AND re.payment_status = 'Paid'
      `).get(projectId).total;

      // 7. Project labor costing (Salary + OT)
      const baseSalaryCost = db.prepare(`
        SELECT SUM(
          (e.salary / 26.0) * 
          (CASE WHEN a.status = 'P' THEN 1.0 WHEN a.status = 'H' THEN 0.5 ELSE 0.0 END) * 
          (CASE WHEN a.is_sunday_work = 1 THEN 2.0 ELSE 1.0 END)
        ) as total 
        FROM attendance a 
        JOIN employees e ON e.id = a.employee_id 
        WHERE a.project_id = ?
      `).get(projectId).total || 0;

      const otCost = db.prepare(`
        SELECT SUM(
          (e.salary / 208.0) * a.overtime_hours
        ) as total 
        FROM attendance a 
        JOIN employees e ON e.id = a.employee_id 
        WHERE a.project_id = ?
      `).get(projectId).total || 0;

      const roomFoodLedgerExp = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM room_food_expenses WHERE project_id = ?').get(projectId).total;

      // 8. Client Billing Invoices
      const invoices = db.prepare('SELECT * FROM project_invoices WHERE project_id = ? ORDER BY invoice_date DESC').all(projectId);

      // 9. Available staff to deploy
      const availableStaff = db.prepare('SELECT id, name, role, phone FROM employees WHERE status = \'active\' AND (project_id IS NULL OR project_id != ?)').all(projectId);

      return {
        success: true,
        details: {
          project,
          deployedStaff,
          attendanceToday,
          attendanceHistory,
          costs: {
            labor: Math.round(baseSalaryCost),
            ot: Math.round(otCost),
            food: foodExp,
            travel: travelExp,
            otherExpenses: otherExp,
            rent: rentExp,
            electricity: elecExp,
            roomFoodLedger: roomFoodLedgerExp
          },
          invoices,
          availableStaff
        }
      };
    } catch (err) {
      console.error('[Projects IPC] Error getting dashboard details:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Project Invoices / Billing CRUD ────────────────────────────────────────

  ipcMain.handle('invoices:get', async (_, filter = {}) => {
    try {
      const db = getDB();
      let query = `SELECT * FROM project_invoices WHERE 1=1`;
      const params = [];
      if (filter.projectId) {
        query += ` AND project_id = ?`;
        params.push(parseInt(filter.projectId));
      }
      query += ` ORDER BY invoice_date DESC, id DESC`;
      const invoices = db.prepare(query).all(...params);
      return { success: true, invoices };
    } catch (err) {
      console.error('[Projects IPC] Error getting invoices:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('invoices:create', async (_, data) => {
    try {
      const db = getDB();
      const { projectId, invoiceNumber, invoiceDate, dueDate, amount, gstAmount, retentionAmount, paymentStatus, paidAmount } = data;
      const result = db.prepare(`
        INSERT INTO project_invoices (
          project_id, invoice_number, invoice_date, due_date, amount, gst_amount, retention_amount, payment_status, paid_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        projectId, invoiceNumber, invoiceDate, dueDate, amount || 0, gstAmount || 0, retentionAmount || 0, paymentStatus || 'Pending', paidAmount || 0
      );
      
      const { logActivity } = require('../utils/audit');
      logActivity('Projects', 'Invoice Created', `Created invoice ${invoiceNumber} for project ID ${projectId}`, null, `Amount: ₹${(amount || 0)/100}`);
      
      return { success: true, id: result.lastInsertRowid };
    } catch (err) {
      console.error('[Projects IPC] Error creating invoice:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('invoices:update', async (_, data) => {
    try {
      const db = getDB();
      const { id, invoiceNumber, invoiceDate, dueDate, amount, gstAmount, retentionAmount, paymentStatus, paidAmount } = data;
      db.prepare(`
        UPDATE project_invoices SET
          invoice_number = COALESCE(?, invoice_number),
          invoice_date = COALESCE(?, invoice_date),
          due_date = COALESCE(?, due_date),
          amount = COALESCE(?, amount),
          gst_amount = COALESCE(?, gst_amount),
          retention_amount = COALESCE(?, retention_amount),
          payment_status = COALESCE(?, payment_status),
          paid_amount = COALESCE(?, paid_amount),
          updated_at = (strftime('%s', 'now'))
        WHERE id = ?
      `).run(
        invoiceNumber, invoiceDate, dueDate, amount, gstAmount, retentionAmount, paymentStatus, paidAmount, id
      );
      
      const { logActivity } = require('../utils/audit');
      logActivity('Projects', 'Invoice Updated', `Updated invoice ID ${id}`, null, null);
      
      return { success: true };
    } catch (err) {
      console.error('[Projects IPC] Error updating invoice:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('invoices:delete', async (_, id) => {
    try {
      const db = getDB();
      db.prepare(`DELETE FROM project_invoices WHERE id = ?`).run(id);
      return { success: true };
    } catch (err) {
      console.error('[Projects IPC] Error deleting invoice:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Manpower Assignment / Transfers ──────────────────────────────────────

  ipcMain.handle('projects:transferManpower', async (_, { employeeIds, targetProjectId, operatorId }) => {
    try {
      const db = getDB();
      const transaction = db.transaction(() => {
        const stmt = db.prepare(`UPDATE employees SET project_id = ? WHERE id = ?`);
        for (const empId of employeeIds) {
          stmt.run(targetProjectId ? parseInt(targetProjectId) : null, parseInt(empId));
        }
      });
      transaction();
      
      const { logActivity } = require('../utils/audit');
      logActivity('Projects', 'Manpower Transfer', `Transferred ${employeeIds.length} staff members to project ID ${targetProjectId}`, null, null, operatorId);
      
      return { success: true };
    } catch (err) {
      console.error('[Projects IPC] Error transferring manpower:', err);
      return { success: false, error: err.message };
    }
  });

};
