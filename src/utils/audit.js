const os = require('os');
const { getDB } = require('../database/db');

function logActivity(moduleName, action, description, oldValue = null, newValue = null, user = null) {
  try {
    const db = getDB();
    const userId = user ? user.id : null;
    const userName = user ? user.name : 'System';
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
