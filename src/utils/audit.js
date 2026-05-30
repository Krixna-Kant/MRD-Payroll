const os = require('os');
const { getDB } = require('../database/db');

function logActivity(moduleName, action, description, oldValue = null, newValue = null, user = null) {
  try {
    const db = getDB();
    let userId = null;
    let userName = 'System';

    if (user) {
      if (typeof user === 'object') {
        userId = user.id || null;
        userName = user.fullName || user.full_name || user.username || user.name || 'System';
      } else if (typeof user === 'number') {
        userId = user;
        // Try to fetch name if we only have ID
        try {
          const u = db.prepare('SELECT full_name, username FROM users WHERE id = ?').get(user);
          if (u) userName = u.full_name || u.username || 'User ' + user;
        } catch (e) {}
      } else if (typeof user === 'string') {
        userName = user;
        // Try to fetch ID if we only have username
        try {
          const u = db.prepare('SELECT id FROM users WHERE username = ? OR full_name = ?').get(user, user);
          if (u) userId = u.id;
        } catch (e) {}
      }
    }
    const deviceInfo = `${os.hostname()} - ${os.platform()} ${os.release()}`;

    db.prepare(`
      INSERT INTO activity_logs (user_id, user_name, module, action, old_value, new_value, description, device_info)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, userName, moduleName, action, oldValue || null, newValue || null, description, deviceInfo);
  } catch (err) {
    console.error('[Audit Log Error]:', err.message);
  }
}

module.exports = { logActivity };
