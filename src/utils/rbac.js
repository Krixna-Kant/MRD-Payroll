/**
 * LocalPayroll — RBAC (Role Based Access Control)
 * Central logic for determining if a user has permission to perform an action.
 */

const PERMISSIONS = {
  admin: {
    'employees:delete': true,
    'employees:editSalary': true,
    'attendance:editAll': true,
    'attendance:approveCorrection': true,
    'payroll:access': true,
    'payroll:process': true,
    'payroll:delete': true,
    'leaves:approve': true,
    'advances:delete': true,
    'reports:financial': true,
    'system:settings': true,
    'system:audit': true,
    'system:users': true
  },
  HR: {
    'employees:add': true,
    'employees:editProfile': true,
    'attendance:mark': true, // Handled by 2-day rule in IPC
    'attendance:submitCorrection': true,
    'advances:add': true,
    'documents:manage': true,
    'reports:operational': true, // Attendance, Manpower
    'whatsapp:send': true
  }
};

/**
 * Checks if a user role has a specific permission.
 * @param {string} role 'admin' or 'hr'
 * @param {string} permission The permission key
 * @returns {boolean}
 */
function hasPermission(role, permission) {
  if (role === 'admin') return true; // Admin has everything
  if (!PERMISSIONS[role]) return false;
  return !!PERMISSIONS[role][permission];
}

module.exports = { hasPermission };
