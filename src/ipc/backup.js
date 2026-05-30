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

  function getTimestamp() {
    const now = new Date();
    return now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') + '_' +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');
  }

  function cleanOldBackups(folder) {
    try {
      if (!fs.existsSync(folder)) return;
      const files = fs.readdirSync(folder)
        .filter(f => f.startsWith('LocalPayroll_Backup_') && f.endsWith('.db'))
        .map(f => ({ name: f, path: path.join(folder, f), mtimeMs: fs.statSync(path.join(folder, f)).mtimeMs }));
      
      files.sort((a, b) => a.mtimeMs - b.mtimeMs);
      if (files.length > 10) {
        const toDelete = files.slice(0, files.length - 10);
        for (const f of toDelete) {
          fs.unlinkSync(f.path);
        }
      }
    } catch (e) {}
  }

  // ── Export Backup ──────────────────────────────────────────────────────────
  ipcMain.handle('backup:export', async () => {
    const timestamp = getTimestamp();
    const os = require('os');
    let backupFolder = 'D:\\LocalPayroll_Backups';
    
    // Fallback to Documents if D: drive doesn't exist
    if (!fs.existsSync('D:\\')) {
      const profile = require('os').homedir();
      backupFolder = path.join(profile, 'Documents', 'LocalPayroll_Backups');
    }
    
    if (!fs.existsSync(backupFolder)) {
      fs.mkdirSync(backupFolder, { recursive: true });
    }

    const filePath = path.join(backupFolder, `LocalPayroll_Backup_${timestamp}_${os.hostname()}.db`);

    try {
      const db = getDB();
      await db.backup(filePath);
      cleanOldBackups(backupFolder);
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Export Backup OneDrive ──────────────────────────────────────────────────
  ipcMain.handle('backup:exportOneDrive', async () => {
    const { getOneDrivePath } = require('../utils/syncHelper');
    const oneDrivePath = getOneDrivePath();
    if (!oneDrivePath) return { success: false, error: 'OneDrive not found on this PC.' };

    const backupFolder = path.join(oneDrivePath, 'MRD ERP', 'Backups');
    if (!fs.existsSync(backupFolder)) {
      fs.mkdirSync(backupFolder, { recursive: true });
    }

    const timestamp = getTimestamp();
    const os = require('os');
    const filePath = path.join(backupFolder, `LocalPayroll_Backup_${timestamp}_${os.hostname()}.db`);

    try {
      const db = getDB();
      await db.backup(filePath);
      cleanOldBackups(backupFolder);
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });  // ── Import Backup ──────────────────────────────────────────────────────────
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
    const { getDBPath, closeDB } = require('../database/db');
    const destPath = getDBPath();

    try {
      // Close current DB connection before replacing the file
      closeDB();

      fs.copyFileSync(sourcePath, destPath);
      // Restart is required to re-initialize the DB — instruct renderer to reload
      return { success: true, requiresReload: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

};
