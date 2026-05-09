/**
 * LocalPayroll - Preload Script
 * Exposes a safe, curated API to the renderer via contextBridge.
 * The renderer ONLY has access to what is explicitly listed here.
 */

const { contextBridge, ipcRenderer, shell } = require('electron');

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
  updateBalance:  (data)         => ipcRenderer.invoke('employees:updateBalance', data),
  getLedger:      (empId)        => ipcRenderer.invoke('ledger:get', empId),

  // ── Attendance ────────────────────────────────────────────────────────────
  markAttendance:        (data)              => ipcRenderer.invoke('attendance:mark', data),
  getMonthAttendance:    (empId, month, year)=> ipcRenderer.invoke('attendance:monthly', empId, month, year),
  getBulkAttendance:     (date)              => ipcRenderer.invoke('attendance:bulk', date),
  getAttendanceSummary:  (empId, month, year)=> ipcRenderer.invoke('attendance:summary', empId, month, year),
  exportAttendanceRegister:(month, year, format)=> ipcRenderer.invoke('attendance:exportRegister', month, year, format),

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
  exportCalendarPdf:    (empId, month, year) => ipcRenderer.invoke('reports:calendarPdf', empId, month, year),
  exportMonthlyExcel:   (month, year)        => ipcRenderer.invoke('reports:monthlyExcel', month, year),
  exportEmployeeExcel:  (empId)              => ipcRenderer.invoke('reports:employeeExcel', empId),
  exportDailyAttendanceExcel: (date)         => ipcRenderer.invoke('reports:dailyAttendanceExcel', date),
  exportDailyManpowerPdf:     (date)         => ipcRenderer.invoke('reports:dailyManpowerPdf', date),
  shareDailyManpowerWhatsApp: (date)         => ipcRenderer.invoke('reports:dailyManpowerImage', date),
  exportAttendanceRangeExcel: (params)       => ipcRenderer.invoke('reports:attendanceRangeExcel', params),
  
  // ── Utils ─────────────────────────────────────────────────────────────────
  openExternalUrl:      (url)                => shell.openExternal(url),

  // ── Settings ──────────────────────────────────────────────────────────────
  getSettings:          ()                   => ipcRenderer.invoke('settings:getAll'),
  saveSettings:         (data)               => ipcRenderer.invoke('settings:save', data),

  // ── Backup ────────────────────────────────────────────────────────────────
  exportBackup:   ()             => ipcRenderer.invoke('backup:export'),
  importBackup:   ()             => ipcRenderer.invoke('backup:import'),

  // ── Staff Documents ───────────────────────────────────────────────────────
  getStaffDocs:   (filter)       => ipcRenderer.invoke('staffDocs:getAll', filter),
  uploadStaffDoc: (data)         => ipcRenderer.invoke('staffDocs:upload', data),
  deleteStaffDoc: (id)           => ipcRenderer.invoke('staffDocs:delete', id),
  previewStaffDoc:(id)           => ipcRenderer.invoke('staffDocs:preview', id),
  runStaffDocOcr: (id)           => ipcRenderer.invoke('staffDocs:runOcr', id),
  updateStaffDocOcr: (data)      => ipcRenderer.invoke('staffDocs:updateOcrData', data),
  mapOcrToProfile:(data)         => ipcRenderer.invoke('staffDocs:mapToProfile', data),
  exportStaffOcrExcel: ()        => ipcRenderer.invoke('staffDocs:exportOcrExcel'),

  // ── Leaves ────────────────────────────────────────────────────────────────
  getLeaves:      (filter)       => ipcRenderer.invoke('leaves:getAll', filter),
  createLeave:    (data)         => ipcRenderer.invoke('leaves:create', data),
  updateLeaveStatus: (id, status)=> ipcRenderer.invoke('leaves:updateStatus', id, status),
  deleteLeave:    (id)           => ipcRenderer.invoke('leaves:delete', id),

  // ── Expenses ──────────────────────────────────────────────────────────────
  getExpenses:    (filter)       => ipcRenderer.invoke('expenses:getAll', filter),
  createExpense:  (data)         => ipcRenderer.invoke('expenses:create', data),
  updateExpenseStatus: (id, status)=> ipcRenderer.invoke('expenses:updateStatus', id, status),
  deleteExpense:  (id)           => ipcRenderer.invoke('expenses:delete', id),
  getUnreimbursedExpenses: (empId) => ipcRenderer.invoke('expenses:getUnreimbursed', empId),

  // ── Projects ──────────────────────────────────────────────────────────────
  getProjects:    (filter)       => ipcRenderer.invoke('projects:get', filter),
  createProject:  (data)         => ipcRenderer.invoke('projects:create', data),
  updateProject:  (data)         => ipcRenderer.invoke('projects:update', data),
  deleteProject:  (id)           => ipcRenderer.invoke('projects:delete', id),
  exportProjectCostReport: (id)  => ipcRenderer.invoke('projects:exportCostReport', id),

  // ── Site Reports ──────────────────────────────────────────────────────────
  getSiteReports:    (filter)    => ipcRenderer.invoke('site_reports:get', filter),
  createSiteReport:  (data)      => ipcRenderer.invoke('site_reports:create', data),
  deleteSiteReport:  (id)        => ipcRenderer.invoke('site_reports:delete', id),

  // ── Audit Logs ────────────────────────────────────────────────────────────
  getAuditLogs:      (filter)    => ipcRenderer.invoke('audit:getLogs', filter),
  exportAuditExcel:  ()          => ipcRenderer.invoke('audit:exportExcel'),

  // ── Alerts & Reminders ────────────────────────────────────────────────────
  getAlerts:         (filter)    => ipcRenderer.invoke('alerts:get', filter),
  runAlertRules:     ()          => ipcRenderer.invoke('alerts:runRules'),
  markAlertRead:     (id, read)  => ipcRenderer.invoke('alerts:markRead', id, read),
  deleteAlert:       (id)        => ipcRenderer.invoke('alerts:delete', id),

});
