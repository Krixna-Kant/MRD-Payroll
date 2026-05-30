const os = require('os');
const path = require('path');
const fs = require('fs');
const { resolveDbPath } = require('../database/db');

let heartbeatInterval = null;

/**
 * Searches for standard OneDrive directory paths on the user's system.
 */
function getOneDrivePath() {
  const profile = os.homedir();
  const paths = [
    path.join(profile, 'OneDrive'),
    path.join(profile, 'OneDrive - Personal'),
    path.join(profile, 'OneDrive - Business')
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Scan OneDrive backups, find the newest file, and auto-restore it if it's newer than the local DB.
 */
function autoRestoreFromOneDrive() {
  try {
    const oneDrive = getOneDrivePath();
    if (!oneDrive) {
      console.log('[Sync] OneDrive not detected. Skipping auto-restore.');
      return;
    }

    const backupFolder = path.join(oneDrive, 'MRD ERP', 'Backups');
    if (!fs.existsSync(backupFolder)) {
      console.log('[Sync] OneDrive backup folder not found. Skipping auto-restore.');
      return;
    }

    const files = fs.readdirSync(backupFolder)
      .filter(f => f.startsWith('LocalPayroll_Backup_') && f.endsWith('.db'))
      .map(f => {
        const filePath = path.join(backupFolder, f);
        const stat = fs.statSync(filePath);
        return {
          name: f,
          path: filePath,
          mtimeMs: stat.mtimeMs,
          atime: stat.atime,
          mtime: stat.mtime
        };
      });

    if (files.length === 0) {
      console.log('[Sync] No OneDrive backups found. Skipping auto-restore.');
      return;
    }

    // Sort by modification time in milliseconds descending (newest first)
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const latestBackup = files[0];
    const latestBackupPath = latestBackup.path;
    const latestBackupName = latestBackup.name;

    const localDbPath = resolveDbPath();
    const localExist = fs.existsSync(localDbPath);
    const localStat = localExist ? fs.statSync(localDbPath) : null;

    // Parse creator host from filename: LocalPayroll_Backup_YYYYMMDD_HHMMSS_HOSTNAME.db
    const parts = latestBackupName.replace('.db', '').split('_');
    const backupHost = parts[4] || ''; // Extract hostname if present
    const currentHost = os.hostname();
    
    // If backupHost is empty (old backup format), we assume it's from another PC to be safe.
    // Otherwise, check if it was created by a different PC.
    const isFromOtherPC = !backupHost || (backupHost !== currentHost);

    let shouldRestore = false;
    if (!localExist) {
      shouldRestore = true;
      console.log('[Sync] Local database missing. Restoring latest OneDrive backup.');
    } else if (isFromOtherPC && (latestBackup.mtimeMs > localStat.mtimeMs + 2000)) {
      shouldRestore = true;
      console.log(`[Sync] Newer database backup found from PC: ${backupHost || 'unknown'} (OneDrive: ${latestBackup.mtime.toLocaleString('en-IN')}).`);
    }

    if (shouldRestore) {
      console.log(`[Sync] Restoring OneDrive backup: ${latestBackupName}...`);
      
      const localDir = path.dirname(localDbPath);
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }

      // Copy database backup
      fs.copyFileSync(latestBackupPath, localDbPath);

      // Crucial: Set local file modification time to match the backup file exactly.
      fs.utimesSync(localDbPath, latestBackup.atime, latestBackup.mtime);

      // Set global flag to notify renderer upon launch
      global.dbRestoredFromSync = {
        restored: true,
        filename: latestBackupName,
        mtime: latestBackup.mtime.toLocaleString('en-IN')
      };

      console.log('[Sync] Database auto-restore completed successfully.');
    } else {
      console.log('[Sync] Local database is up to date (no newer backups from other PCs).');
    }
  } catch (err) {
    console.error('[Sync] Error during auto-restore:', err);
  }
}

/**
 * Writes or updates the session lock file.
 */
function writeLock(lockFilePath) {
  const data = {
    computer: os.hostname(),
    pid: process.pid,
    timestamp: Date.now()
  };
  fs.writeFileSync(lockFilePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Starts the heartbeat timer to refresh the lock file every 30 seconds.
 */
function startHeartbeat(lockFilePath) {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    try {
      writeLock(lockFilePath);
    } catch (err) {
      console.error('[Sync] Failed to update session lock heartbeat:', err);
    }
  }, 30000);
}

/**
 * Checks for an active session lock on OneDrive.
 * If locked, presents warning prompt.
 * If proceed, writes lock and starts heartbeat.
 */
function acquireSessionLock(app, dialog) {
  try {
    const oneDrive = getOneDrivePath();
    if (!oneDrive) {
      console.log('[Sync] OneDrive not found. Skipping lock acquisition.');
      return true;
    }

    const mrdDir = path.join(oneDrive, 'MRD ERP');
    if (!fs.existsSync(mrdDir)) {
      fs.mkdirSync(mrdDir, { recursive: true });
    }

    const lockFilePath = path.join(mrdDir, 'session.lock');

    if (fs.existsSync(lockFilePath)) {
      try {
        const lockContent = fs.readFileSync(lockFilePath, 'utf8');
        const lockData = JSON.parse(lockContent);

        const timeDiff = Math.abs(Date.now() - lockData.timestamp);
        const isDifferentInstance = (lockData.computer !== os.hostname()) || (lockData.pid !== process.pid);

        // Lock is active if updated within the last 30 minutes (handles clock drift and Sync delays)
        if (isDifferentInstance && timeDiff < 1800000) {
          const minutesAgo = Math.round(timeDiff / 60000) || 1;
          const detailLocation = lockData.computer === os.hostname()
            ? 'in another window on this PC'
            : `on computer "${lockData.computer}"`;

          const choice = dialog.showMessageBoxSync({
            type: 'warning',
            buttons: ['Exit App', 'Force Open (Risk of Data Loss)'],
            defaultId: 0,
            title: 'Database Locked',
            message: 'Another instance of LocalPayroll is active.',
            detail: `The application is running ${detailLocation} (last active: ${minutesAgo}m ago).\n\nRunning multiple sessions concurrently can corrupt your database. Please close the other session before opening it here.`
          });

          if (choice === 0) {
            console.log('[Sync] User chose to exit due to active lock.');
            app.quit();
            process.exit(0);
          }
        }
      } catch (e) {
        console.warn('[Sync] Failed to read lock file (may be empty or corrupt):', e.message);
      }
    }

    // Acquire lock and start heartbeat
    writeLock(lockFilePath);
    startHeartbeat(lockFilePath);
    console.log('[Sync] Session lock acquired.');
    return true;
  } catch (err) {
    console.error('[Sync] Error acquiring session lock:', err);
    return true; // Let user launch even if lock folder check fails
  }
}

/**
 * Releases the session lock on OneDrive if it belongs to this PC and process.
 */
function releaseSessionLock() {
  try {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }

    const oneDrive = getOneDrivePath();
    if (!oneDrive) return;

    const lockFilePath = path.join(oneDrive, 'MRD ERP', 'session.lock');
    if (fs.existsSync(lockFilePath)) {
      try {
        const lockContent = fs.readFileSync(lockFilePath, 'utf8');
        const lockData = JSON.parse(lockContent);
        if (lockData.computer === os.hostname() && lockData.pid === process.pid) {
          fs.unlinkSync(lockFilePath);
          console.log('[Sync] Session lock deleted.');
        }
      } catch (e) {
        // Fallback: delete lock anyway
        fs.unlinkSync(lockFilePath);
        console.log('[Sync] Deleted lock on cleanup fallback.');
      }
    }
  } catch (err) {
    console.error('[Sync] Error releasing session lock:', err);
  }
}

module.exports = {
  getOneDrivePath,
  autoRestoreFromOneDrive,
  acquireSessionLock,
  releaseSessionLock
};
