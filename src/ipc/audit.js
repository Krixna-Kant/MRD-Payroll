const { getDB } = require('../database/db');
const { dialog, BrowserWindow } = require('electron');
const ExcelJS = require('exceljs');

module.exports = function registerAuditHandlers(ipcMain) {
  ipcMain.handle('audit:getLogs', async (_, filter = {}) => {
    try {
      const db = getDB();
      let query = 'SELECT * FROM activity_logs WHERE 1=1';
      const params = [];

      // 1. Date Range / Specific Date / Month
      if (filter.date) {
        query += ' AND date(timestamp) = ?';
        params.push(filter.date);
      } else if (filter.month && filter.year) {
        const m = String(filter.month).padStart(2, '0');
        query += ' AND timestamp >= ? AND timestamp <= ?';
        params.push(`${filter.year}-${m}-01 00:00:00`, `${filter.year}-${m}-31 23:59:59`);
      } else if (filter.fromDate && filter.toDate) {
        query += ' AND timestamp >= ? AND timestamp <= ?';
        params.push(`${filter.fromDate} 00:00:00`, `${filter.toDate} 23:59:59`);
      }

      // 2. Module
      if (filter.module) {
        query += ' AND module = ?';
        params.push(filter.module);
      }

      // 3. User
      if (filter.user_name) {
        query += ' AND user_name LIKE ?';
        params.push(`%${filter.user_name}%`);
      }

      // 4. Action
      if (filter.action) {
        query += ' AND action = ?';
        params.push(filter.action);
      }

      // 5. Global Search
      if (filter.search) {
        query += ' AND (description LIKE ? OR user_name LIKE ? OR module LIKE ?)';
        const q = `%${filter.search}%`;
        params.push(q, q, q);
      }
      
      query += ' ORDER BY timestamp DESC LIMIT 1000'; 
      const logs = db.prepare(query).all(...params);

      // 6. Stats for the Top Cards
      const stats = {
        total: logs.length,
        payroll: logs.filter(l => l.module === 'Payroll').length,
        attendance: logs.filter(l => l.module === 'Attendance').length,
        critical: logs.filter(l => ['Deleted', 'Rejected'].includes(l.action)).length
      };

      return { success: true, logs, stats };
    } catch (err) {
      console.error('[Audit IPC] Error fetching logs:', err);
      return { success: false, error: err.message };
    }
  });

  // audit:delete removed for security/audit integrity

  ipcMain.handle('audit:exportExcel', async () => {
    try {
      const db = getDB();
      const logs = db.prepare('SELECT * FROM activity_logs ORDER BY timestamp DESC').all();

      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      const { filePath } = await dialog.showSaveDialog(win, {
        title: 'Export Audit Logs',
        defaultPath: 'Activity_Logs.xlsx',
        filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
      });

      if (!filePath) return { success: false, error: 'Cancelled.' };

      const wb = new ExcelJS.Workbook();
      wb.creator = 'LocalPayroll';
      const ws = wb.addWorksheet('Activity Logs');

      ws.addRow(['ID', 'Date/Time', 'User', 'Module', 'Action', 'Description', 'Old Value', 'New Value', 'Device']);
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6366F1' } };

      logs.forEach(l => {
        ws.addRow([
          l.id, l.timestamp, l.user_name, l.module, l.action,
          l.description || '-', l.old_value || '-', l.new_value || '-', l.device_info || '-'
        ]);
      });

      ws.columns = [
        { width: 8 }, { width: 22 }, { width: 15 }, { width: 15 },
        { width: 20 }, { width: 35 }, { width: 20 }, { width: 20 }, { width: 25 }
      ];

      await wb.xlsx.writeFile(filePath);
      return { success: true, filePath };
    } catch (err) {
      console.error('[Audit IPC] Error exporting logs:', err);
      return { success: false, error: err.message };
    }
  });
};
