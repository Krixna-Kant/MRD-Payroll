/**
 * LocalPayroll - Database Connection
 * Uses better-sqlite3 for fast, synchronous SQLite access.
 * DB is stored in the OS user-data directory (AppData/Roaming on Windows).
 */

const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

let db = null;

/**
 * Returns the singleton DB instance.
 * Creates and configures it on first call.
 */
function getDB() {
  if (db) return db;

  const dbPath = path.join(app.getPath('userData'), 'payroll.db');
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
 * Close the DB connection gracefully (called on app quit).
 */
function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDB, closeDB };
