/**
 * LocalPayroll - Settings IPC Handlers
 */

const { getDB } = require('../database/db');

module.exports = function registerSettingsHandlers(ipcMain) {
  // ── Get All Settings ──────────────────────────────────────────────────────
  ipcMain.handle('settings:getAll', async () => {
    const db = getDB();
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    return { success: true, settings };
  });

  // ── Get Database Path ─────────────────────────────────────────────────────
  ipcMain.handle('settings:getDbPath', async () => {
    const { getDBPath } = require('../database/db');
    return { success: true, dbPath: getDBPath() };
  });

  // ── Save Settings ─────────────────────────────────────────────────────────
  ipcMain.handle('settings:save', async (_, newSettings) => {
    const db = getDB();
    const transaction = db.transaction((settingsObj) => {
      const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
      for (const [key, value] of Object.entries(settingsObj)) {
        stmt.run(key, value);
      }
    });

    try {
      transaction(newSettings);
      return { success: true };
    } catch (err) {
      console.error('[Settings IPC] Save error:', err);
      return { success: false, error: err.message };
    }
  });
};
