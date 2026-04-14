/**
 * LocalPayroll - Backup IPC Handlers
 * Export and import the SQLite database file.
 */

const { getDB } = require('../database/db');
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// getWindow is a getter fn: () => BrowserWindow, so we always get the live ref
module.exports = function registerBackupHandlers(ipcMain, getWindow, dialog) {

  // ── Export Backup ──────────────────────────────────────────────────────────
  ipcMain.handle('backup:export', async () => {
    const dbPath = path.join(app.getPath('userData'), 'payroll.db');
    const timestamp = new Date().toISOString().slice(0, 10);

    const { filePath } = await dialog.showSaveDialog(getWindow(), {
      title: 'Export Database Backup',
      defaultPath: `LocalPayroll_Backup_${timestamp}.db`,
      filters: [
        { name: 'LocalPayroll Backup', extensions: ['db'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (!filePath) return { success: false, error: 'Cancelled.' };

    try {
      // Use SQLite backup API (safe even with open connections)
      const db = getDB();
      await db.backup(filePath);
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Import Backup ──────────────────────────────────────────────────────────
  // WARNING: This replaces all current data. Show a confirmation dialog first in the renderer.
  ipcMain.handle('backup:import', async () => {
    const { filePaths } = await dialog.showOpenDialog(getWindow(), {
      title: 'Import Database Backup',
      filters: [
        { name: 'LocalPayroll Backup', extensions: ['db'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (!filePaths || filePaths.length === 0) return { success: false, error: 'Cancelled.' };

    const sourcePath = filePaths[0];
    const destPath = path.join(app.getPath('userData'), 'payroll.db');

    try {
      // Close current DB connection before replacing the file
      const { closeDB } = require('../database/db');
      closeDB();

      fs.copyFileSync(sourcePath, destPath);
      // Restart is required to re-initialize the DB — instruct renderer to reload
      return { success: true, requiresReload: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

};
