const { ipcMain } = require('electron');
const { getDB } = require('../database/db');

module.exports = function registerProjectHandlers() {
  
  // ── Projects CRUD ─────────────────────────────────────────────────────────

  ipcMain.handle('projects:get', async (_, filter = {}) => {
    try {
      const db = getDB();
      let query = 'SELECT * FROM projects WHERE 1=1';
      const params = [];

      if (filter.status) {
        query += ' AND status = ?';
        params.push(filter.status);
      }
      
      query += ' ORDER BY created_at DESC';
      
      const projects = db.prepare(query).all(...params);
      
      // Calculate derived fields (e.g. current man power, expense cost)
      projects.forEach(p => {
        p.totalExpenses = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE project_id = ?`).get(p.id).total;
        
        // Count distinct employees present today at this project
        const today = new Date().toISOString().split('T')[0];
        p.presentToday = db.prepare(`SELECT COUNT(DISTINCT employee_id) as n FROM attendance WHERE project_id = ? AND date = ? AND status IN ('P', 'H')`).get(p.id, today).n;
      });

      return { success: true, projects };
    } catch (err) {
      console.error('[Projects IPC] Error fetching projects:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('projects:create', async (_, data) => {
    try {
      const db = getDB();
      const {
        name, clientName, code, siteAddress, startDate, endDate, status,
        supervisorName, contactNumber, revenue, progress, currentStage,
        delayReason, expectedCompletion, notes, createdBy
      } = data;

      const result = db.prepare(`
        INSERT INTO projects (
          name, client_name, code, site_address, start_date, end_date,
          status, supervisor_name, contact_number, revenue, progress,
          current_stage, delay_reason, expected_completion, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        name, clientName || null, code || null, siteAddress || null, startDate || null, endDate || null,
        status || 'Upcoming', supervisorName || null, contactNumber || null, revenue || 0, progress || 0,
        currentStage || null, delayReason || null, expectedCompletion || null, notes || null, createdBy || null
      );

      // Audit Log
      const { logActivity } = require('../utils/audit');
      logActivity('Projects', 'Created', `Created project: ${name}`, null, `Status: ${status || 'Upcoming'}`);

      return { success: true, id: result.lastInsertRowid };
    } catch (err) {
      console.error('[Projects IPC] Error creating project:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('projects:update', async (_, data) => {
    try {
      const db = getDB();
      const {
        id, name, clientName, code, siteAddress, startDate, endDate, status,
        supervisorName, contactNumber, revenue, progress, currentStage,
        delayReason, expectedCompletion, notes
      } = data;

      db.prepare(`
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
          updated_at = (strftime('%s', 'now'))
        WHERE id = ?
      `).run(
        name, clientName, code, siteAddress, startDate, endDate, status,
        supervisorName, contactNumber, revenue, progress, currentStage,
        delayReason, expectedCompletion, notes, id
      );

      // Audit Log
      const { logActivity } = require('../utils/audit');
      logActivity('Projects', 'Updated', `Updated project: ${name}`, null, `Status: ${status}`);

      return { success: true };
    } catch (err) {
      console.error('[Projects IPC] Error updating project:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('projects:delete', async (_, id) => {
    try {
      const db = getDB();
      db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
      return { success: true };
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
      logActivity('Projects', 'Report Submitted', `Site report submitted for ${proj?.name} on ${date}`, null, `Manpower: ${manpowerCount || 0}`);

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

      const { dialog, BrowserWindow } = require('electron');
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      
      const { filePath } = await dialog.showSaveDialog(win, {
        title: 'Save Project Report',
        defaultPath: `Project_Report_${project.name.replace(/\s+/g, '_')}.xlsx`,
        filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
      });

      if (!filePath) return { success: false, error: 'Cancelled.' };

      const { generateProjectCostExcel } = require('../utils/excel');
      await generateProjectCostExcel(project, expenses, attendance, filePath);
      
      return { success: true, filePath };
    } catch (err) {
      console.error('[Projects IPC] Error exporting project report:', err);
      return { success: false, error: err.message };
    }
  });

};
