const { getDB } = require('../database/db');
const { dialog, BrowserWindow } = require('electron');
const ExcelJS = require('exceljs');

module.exports = function registerAuditHandlers(ipcMain) {
  ipcMain.handle('audit:getLogs', async (_, filter = {}) => {
    try {
      const db = getDB();
      let query = 'SELECT * FROM activity_logs WHERE 1=1';
      const params = [];

      if (filter.module) {
        query += ' AND module = ?';
        params.push(filter.module);
      }
      if (filter.user_name) {
        query += ' AND user_name LIKE ?';
        params.push(`%${filter.user_name}%`);
      }
      if (filter.action) {
        query += ' AND action LIKE ?';
        params.push(`%${filter.action}%`);
      }
      
      query += ' ORDER BY timestamp DESC LIMIT 500'; // Add limit to avoid performance hits
      const logs = db.prepare(query).all(...params);
      return { success: true, logs };
    } catch (err) {
      console.error('[Audit IPC] Error fetching logs:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('audit:delete', async (_, id) => {
    try {
      const db = getDB();
      db.prepare('DELETE FROM activity_logs WHERE id = ?').run(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

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
