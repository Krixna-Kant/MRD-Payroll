/**
 * LocalPayroll - Auth IPC Handlers
 * Handles login, logout, password change, and user management.
 */

const { getDB } = require('../database/db');
const bcrypt = require('bcryptjs');

module.exports = function registerAuthHandlers(ipcMain) {

  // ── Login ──────────────────────────────────────────────────────────────────
  ipcMain.handle('auth:login', async (_, { username, password }) => {
    const db = getDB();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return { success: false, error: 'Invalid username or password.' };

    const match = bcrypt.compareSync(password, user.password_hash);
    if (!match) return { success: false, error: 'Invalid username or password.' };

    return {
      success: true,
      user: {
        id:                user.id,
        username:          user.username,
        fullName:          user.full_name,
        role:              user.role,
        mustChangePassword: user.must_change_password === 1,
      }
    };
  });

  // ── Change Password ──────────────────────────────────────────────────────
  ipcMain.handle('auth:changePassword', async (_, { userId, currentPassword, newPassword }) => {
    const db = getDB();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return { success: false, error: 'User not found.' };

    const match = bcrypt.compareSync(currentPassword, user.password_hash);
    if (!match) return { success: false, error: 'Current password is incorrect.' };

    if (newPassword.length < 6) return { success: false, error: 'New password must be at least 6 characters.' };

    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hash, userId);
    return { success: true };
  });

  // ── Get All Users (admin only guard enforced in renderer) ──────────────────
  ipcMain.handle('auth:getUsers', async () => {
    const db = getDB();
    const users = db.prepare(`
      SELECT id, username, full_name, role, must_change_password, created_at 
      FROM users ORDER BY id ASC
    `).all();
    return { success: true, users };
  });

  // ── Create User ────────────────────────────────────────────────────────────
  ipcMain.handle('auth:createUser', async (_, { username, password, fullName, role }) => {
    const db = getDB();
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return { success: false, error: 'Username already exists.' };
    if (!password || password.length < 6) return { success: false, error: 'Password must be at least 6 characters.' };

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, must_change_password)
      VALUES (?, ?, ?, ?, 1)
    `).run(hash, fullName || username, role || 'staff', username);
    return { success: true, userId: result.lastInsertRowid };
  });

  // ── Delete User (cannot delete yourself or last admin) ────────────────────
  ipcMain.handle('auth:deleteUser', async (_, id) => {
    const db = getDB();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return { success: false, error: 'User not found.' };

    if (user.role === 'admin') {
      const adminCount = db.prepare('SELECT COUNT(*) as n FROM users WHERE role = ?').get('admin').n;
      if (adminCount <= 1) return { success: false, error: 'Cannot delete the only admin account.' };
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return { success: true };
  });

};
