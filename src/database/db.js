/**
 * LocalPayroll - Database Connection
 * Uses better-sqlite3 for fast, synchronous SQLite access.
 * DB is stored in the OS user-data directory (AppData/Roaming on Windows).
 */

const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const fs = require('fs');

let db = null;
let currentDbPath = '';

/**
 * Resolves the database file path without opening a connection.
 */
function resolveDbPath() {
  const defaultFolder = app.getPath('userData');
  const defaultPath = path.join(defaultFolder, 'payroll.db');

  // If D: drive is available, store data on D:\LocalPayroll
  if (fs.existsSync('D:\\')) {
    const dFolder = 'D:\\LocalPayroll';
    const dPath = path.join(dFolder, 'payroll.db');

    try {
      if (!fs.existsSync(dFolder)) {
        fs.mkdirSync(dFolder, { recursive: true });
      }

      // Migrate existing DB from AppData to D: drive if it exists there but not on D:
      if (!fs.existsSync(dPath) && fs.existsSync(defaultPath)) {
        console.log('[DB] Migrating database from AppData to D:\\LocalPayroll...');
        fs.copyFileSync(defaultPath, dPath);
      }

      return dPath;
    } catch (err) {
      console.error('[DB] Failed to initialize D: drive storage, falling back to AppData:', err);
      return defaultPath;
    }
  }

  return defaultPath;
}

/**
 * Returns the singleton DB instance.
 * Creates and configures it on first call.
 */
function getDB() {
  if (db) return db;

  const dbPath = resolveDbPath();
  currentDbPath = dbPath;
  console.log('[DB] Connecting to database at:', dbPath);
  db = new Database(dbPath);

  // CRITICAL: Enable foreign key enforcement (SQLite disables it by default)
  db.pragma('foreign_keys = ON');

  // WAL mode: better performance for concurrent reads + writes
  db.pragma('journal_mode = WAL');

  // Auto-checkpoint WAL every 1000 pages
  db.pragma('wal_autocheckpoint = 1000');

  return db;
}

/**
 * Returns the resolved database path.
 */
function getDBPath() {
  if (!currentDbPath) {
    currentDbPath = resolveDbPath();
  }
  return currentDbPath;
}

/**
 * Close the DB connection gracefully (called on app quit).
 */
function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDB, closeDB, getDBPath, resolveDbPath };
