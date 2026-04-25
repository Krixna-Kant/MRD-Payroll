/**
 * LocalPayroll - Preload Script
 * Exposes a safe, curated API to the renderer via contextBridge.
 * The renderer ONLY has access to what is explicitly listed here.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {

  // ── Authentication ────────────────────────────────────────────────────────
  login:          (creds)        => ipcRenderer.invoke('auth:login', creds),
  logout:         ()             => ipcRenderer.invoke('auth:logout'),
  changePassword: (data)         => ipcRenderer.invoke('auth:changePassword', data),
  getUsers:       ()             => ipcRenderer.invoke('auth:getUsers'),
  createUser:     (user)         => ipcRenderer.invoke('auth:createUser', user),
  deleteUser:     (id)           => ipcRenderer.invoke('auth:deleteUser', id),

  // ── Employees ─────────────────────────────────────────────────────────────
  getEmployees:   (filter)       => ipcRenderer.invoke('employees:getAll', filter),
  getEmployee:    (id)           => ipcRenderer.invoke('employees:getOne', id),
  createEmployee: (emp)          => ipcRenderer.invoke('employees:create', emp),
  updateEmployee: (id, emp)      => ipcRenderer.invoke('employees:update', id, emp),
  deleteEmployee: (id)           => ipcRenderer.invoke('employees:delete', id),

  // ── Attendance ────────────────────────────────────────────────────────────
  markAttendance:        (data)              => ipcRenderer.invoke('attendance:mark', data),
  getMonthAttendance:    (empId, month, year)=> ipcRenderer.invoke('attendance:monthly', empId, month, year),
  getBulkAttendance:     (date)              => ipcRenderer.invoke('attendance:bulk', date),
  getAttendanceSummary:  (empId, month, year)=> ipcRenderer.invoke('attendance:summary', empId, month, year),

  // ── Advances ──────────────────────────────────────────────────────────────
  getAdvances:    (filter)       => ipcRenderer.invoke('advances:get', filter),
  addAdvance:     (data)         => ipcRenderer.invoke('advances:add', data),
  deleteAdvance:  (id)           => ipcRenderer.invoke('advances:delete', id),
  getAdvanceSummary: (empId, month, year) => ipcRenderer.invoke('advances:summary', empId, month, year),

  // ── Payments ──────────────────────────────────────────────────────────────
  getPayments:         (filter)  => ipcRenderer.invoke('payments:get', filter),
  getSalaryCalculation:(empId, month, year) => ipcRenderer.invoke('payments:calculate', empId, month, year),
  calculateAll:        (month, year) => ipcRenderer.invoke('payments:calculateAll', month, year),
  createPayment:       (data)    => ipcRenderer.invoke('payments:create', data),
  updatePayment:       (id, data)=> ipcRenderer.invoke('payments:update', id, data),
  deletePayment:       (id)      => ipcRenderer.invoke('payments:delete', id),

  // ── Reports / Exports ─────────────────────────────────────────────────────
  getDashboardStats:    ()                   => ipcRenderer.invoke('reports:dashboard'),
  exportPayslipPdf:     (paymentId)          => ipcRenderer.invoke('reports:payslipPdf', paymentId),
  exportMonthlyPdf:     (month, year)        => ipcRenderer.invoke('reports:monthlyPdf', month, year),
  exportMonthlyExcel:   (month, year)        => ipcRenderer.invoke('reports:monthlyExcel', month, year),
  exportEmployeeExcel:  (empId)              => ipcRenderer.invoke('reports:employeeExcel', empId),
  exportDailyAttendanceExcel: (date)         => ipcRenderer.invoke('reports:dailyAttendanceExcel', date),
  exportAttendanceRangeExcel: (params)       => ipcRenderer.invoke('reports:attendanceRangeExcel', params),

  // ── Settings ──────────────────────────────────────────────────────────────
  getSettings:          ()                   => ipcRenderer.invoke('settings:getAll'),
  saveSettings:         (data)               => ipcRenderer.invoke('settings:save', data),

  // ── Backup ────────────────────────────────────────────────────────────────
  exportBackup:   ()             => ipcRenderer.invoke('backup:export'),
  importBackup:   ()             => ipcRenderer.invoke('backup:import'),

});
