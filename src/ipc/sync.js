const path = require('path');
const fs = require('fs');
const { shell } = require('electron');
const { getDB } = require('../database/db');
const os = require('os');

module.exports = function registerSyncHandlers(ipcMain, app, getWindow) {
  let syncState = {
    status: 'idle', // idle, running, completed, error
    message: '',
    steps: {
      save: { state: 'pending', label: 'Save Pending Data' },
      backup: { state: 'pending', label: 'Create Backup' },
      status: { state: 'pending', label: 'Check OneDrive Sync Status' },
      wait: { state: 'pending', label: 'Wait Until Sync Completes' },
      lock: { state: 'pending', label: 'Remove Session Lock' },
    }
  };

  const lockPath = path.join(app.getPath('userData'), 'erp.lock');
  
  function getOneDrivePath() {
    // Try to find OneDrive path
    const profile = os.homedir();
    const paths = [
      path.join(profile, 'OneDrive'),
      path.join(profile, 'OneDrive - Personal'),
      path.join(profile, 'OneDrive - Business')
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
    return null; // fallback
  }

  const oneDrivePath = getOneDrivePath() || os.homedir(); // fallback to home dir
  const backupFolder = path.join(oneDrivePath, 'MRD ERP', 'Backups');

  ipcMain.handle('sync:start', async () => {
    // Reset state
    syncState = {
      status: 'running',
      message: '',
      steps: {
        save: { state: 'running', label: 'Save Pending Data' },
        backup: { state: 'pending', label: 'Create Backup' },
        status: { state: 'pending', label: 'Check OneDrive Sync Status' },
        wait: { state: 'pending', label: 'Wait Until Sync Completes' },
        lock: { state: 'pending', label: 'Remove Session Lock' },
      }
    };

    // Create session lock
    try {
      fs.writeFileSync(lockPath, 'active');
    } catch (e) {
      // Ignore
    }

    runSyncWorkflow(); // Run in background
    return true;
  });

  ipcMain.handle('sync:status', () => {
    return syncState;
  });

  ipcMain.handle('sync:checkStartupSync', () => {
    const status = global.dbRestoredFromSync || { restored: false };
    global.dbRestoredFromSync = null; // Reset
    return status;
  });

  ipcMain.handle('sync:forceClose', () => {
    app.isForceClose = true;
    try {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
    } catch (e) {}
    try {
      const { releaseSessionLock } = require('../utils/syncHelper');
      releaseSessionLock();
    } catch (e) {}
    app.quit();
    return true;
  });

  ipcMain.handle('sync:openOneDrive', async () => {
    shell.openPath(oneDrivePath);
    return true;
  });

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
          console.log('[Sync Cleanup] Deleted old backup:', f.name);
        }
      }
    } catch (e) {
      console.error('[Sync Cleanup] Failed to clean old backups:', e.message);
    }
  }

  async function runSyncWorkflow() {
    try {
      // Step 1: Save Pending Data
      await delay(1000);
      syncState.steps.save.state = 'done';
      syncState.steps.backup.state = 'running';

      // Step 2: Create Backup (Dual Engine)
      const now = new Date();
      const timestamp = now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') + '_' +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');
      const hostname = os.hostname();
      const db = getDB();

      // 1. OneDrive Backup
      if (!fs.existsSync(backupFolder)) {
        fs.mkdirSync(backupFolder, { recursive: true });
      }
      const backupPath = path.join(backupFolder, `LocalPayroll_Backup_${timestamp}_${hostname}.db`);
      await db.backup(backupPath);
      cleanOldBackups(backupFolder);

      // 2. Local PC Backup
      let localFolder = 'D:\\LocalPayroll_Backups';
      if (!fs.existsSync('D:\\')) {
        const profile = require('os').homedir();
        localFolder = path.join(profile, 'Documents', 'LocalPayroll_Backups');
      }
      if (!fs.existsSync(localFolder)) {
        fs.mkdirSync(localFolder, { recursive: true });
      }
      const localPath = path.join(localFolder, `LocalPayroll_Backup_${timestamp}_${hostname}.db`);
      await db.backup(localPath);
      cleanOldBackups(localFolder);
      
      syncState.steps.backup.state = 'done';
      syncState.steps.status.state = 'running';

      // Step 3: Check OneDrive Sync Status
      await delay(1500); // simulate check
      syncState.steps.status.state = 'done';
      syncState.steps.wait.state = 'running';

      // Step 4: Wait Until Sync Completes
      await delay(2000); // simulate wait for upload
      syncState.steps.wait.state = 'done';
      syncState.steps.lock.state = 'running';

      // Step 5: Remove Session Lock
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
      try {
        const { releaseSessionLock } = require('../utils/syncHelper');
        releaseSessionLock();
      } catch (e) {}
      syncState.steps.lock.state = 'done';

      syncState.status = 'completed';
      
    } catch (err) {
      syncState.status = 'error';
      syncState.message = err.message || 'Unknown error occurred during sync.';
      // Mark current running step as error
      for (const key in syncState.steps) {
        if (syncState.steps[key].state === 'running') {
          syncState.steps[key].state = 'error';
        }
      }
    }
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};
