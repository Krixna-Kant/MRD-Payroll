/**
 * LocalPayroll - Preload Script
 * Exposes a safe, curated API to the renderer via contextBridge.
 * The renderer ONLY has access to what is explicitly listed here.
 */

const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {

  // ── Authentication ────────────────────────────────────────────────────────
  login:          (creds)        => ipcRenderer.invoke('auth:login', creds),
  logout:         (data)         => ipcRenderer.invoke('auth:logout', data),
  heartbeat:      (data)         => ipcRenderer.invoke('auth:heartbeat', data),
  changePassword: (data)         => ipcRenderer.invoke('auth:changePassword', data),
  getUsers:       ()             => ipcRenderer.invoke('auth:getUsers'),
  createUser:     (user)         => ipcRenderer.invoke('auth:createUser', user),
  deleteUser:     (id)           => ipcRenderer.invoke('auth:deleteUser', id),

  // ── Employees ─────────────────────────────────────────────────────────────
  getEmployees:   (filter)       => ipcRenderer.invoke('employees:getAll', filter),
  getEmployee:    (id)           => ipcRenderer.invoke('employees:getOne', id),
  createEmployee: (emp)          => ipcRenderer.invoke('employees:create', emp),
  updateEmployee: (id, emp, role) => ipcRenderer.invoke('employees:update', id, emp, role),
  deleteEmployee: (id, role)      => ipcRenderer.invoke('employees:delete', id, role),
  updateBalance:  (data)         => ipcRenderer.invoke('employees:updateBalance', data),
  getLedger:      (empId)        => ipcRenderer.invoke('ledger:get', empId),
  checkDuplicate: (data)         => ipcRenderer.invoke('employees:checkDuplicate', data),
  runInlineOcr:   (data)         => ipcRenderer.invoke('employees:runInlineOcr', data),

  // ── Attendance ────────────────────────────────────────────────────────────
  markAttendance:        (data)              => ipcRenderer.invoke('attendance:mark', data),
  getMonthAttendance:    (empId, month, year)=> ipcRenderer.invoke('attendance:monthly', empId, month, year),
  getBulkAttendance:     (date)              => ipcRenderer.invoke('attendance:bulk', date),
  getAttendanceSummary:  (empId, month, year)=> ipcRenderer.invoke('attendance:summary', empId, month, year),
  exportAttendanceRegister:(month, year, format)=> ipcRenderer.invoke('attendance:exportRegister', month, year, format),
  finalizeAttendance:    (data)              => ipcRenderer.invoke('attendance:finalize', data),
  unfinalizeAttendance:  (data)              => ipcRenderer.invoke('attendance:unfinalize', data),
  checkPendingFinalization:(data)            => ipcRenderer.invoke('attendance:checkPendingFinalization', data),
  getPendingPastAttendance:(days)            => ipcRenderer.invoke('attendance:getPendingPast', days),
  
  // Correction Flow
  submitCorrection:       (data)             => ipcRenderer.invoke('attendance:submitCorrection', data),
  getPendingCorrections:  ()                 => ipcRenderer.invoke('attendance:getPendingCorrections'),
  resolveCorrection:      (data)             => ipcRenderer.invoke('attendance:resolveCorrection', data),
  
  // Correction Flow
  submitCorrection:       (data)             => ipcRenderer.invoke('attendance:submitCorrection', data),
  getPendingCorrections:  ()                 => ipcRenderer.invoke('attendance:getPendingCorrections'),
  resolveCorrection:      (data)             => ipcRenderer.invoke('attendance:resolveCorrection', data),

  // ── Advances ──────────────────────────────────────────────────────────────
  getAdvances:             (filter)       => ipcRenderer.invoke('advances:get', filter),
  addAdvance:              (data)         => ipcRenderer.invoke('advances:add', data),
  deleteAdvance:           (id)           => ipcRenderer.invoke('advances:delete', id),
  getAdvanceSummary:       (empId, month, year) => ipcRenderer.invoke('advances:summary', empId, month, year),
  getAdvanceEmployeeSummaries: (filter)   => ipcRenderer.invoke('advances:employeeSummaries', filter),
  getAdvanceEmployeeLedger:    (empId, filter) => ipcRenderer.invoke('advances:employeeLedger', empId, filter),
  exportAdvanceLedgerExcel:    (empId)    => ipcRenderer.invoke('advances:exportLedgerExcel', empId),
  createAdvanceRequest:        (data)     => ipcRenderer.invoke('advances:createRequest', data),
  getAdvanceRequests:          (filter, role) => ipcRenderer.invoke('advances:getRequests', filter, role),
  updateAdvanceRequestStatus:  (data)     => ipcRenderer.invoke('advances:updateRequestStatus', data),
  deleteAdvanceRequest:        (data)     => ipcRenderer.invoke('advances:deleteRequest', data),

  // ── Payments ──────────────────────────────────────────────────────────────
  getPayments:         (filter, role)  => ipcRenderer.invoke('payments:get', filter, role),
  getSalaryCalculation:(empId, month, year, role) => ipcRenderer.invoke('payments:calculate', empId, month, year, role),
  calculateAll:        (month, year, role) => ipcRenderer.invoke('payments:calculateAll', month, year, role),
  createPayment:       (data)    => ipcRenderer.invoke('payments:create', data),
  updatePayment:       (id, data)=> ipcRenderer.invoke('payments:update', id, data),
  deletePayment:       (data)    => ipcRenderer.invoke('payments:delete', data),
  auditPayroll:        (month, year, role) => ipcRenderer.invoke('payments:auditPayroll', month, year, role),

  // ── Reports / Exports ─────────────────────────────────────────────────────
  getDashboardStats:    (params)             => ipcRenderer.invoke('reports:dashboard', params),
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
  getDbPath:            ()                   => ipcRenderer.invoke('settings:getDbPath'),

  // ── Backup ────────────────────────────────────────────────────────────────
  exportBackup:   ()             => ipcRenderer.invoke('backup:export'),
  exportBackupOneDrive: ()       => ipcRenderer.invoke('backup:exportOneDrive'),
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
  compileStaffDocs: (data)       => ipcRenderer.invoke('staffDocs:compileAll', data),

  // ── Leaves ────────────────────────────────────────────────────────────────
  getLeaves:      (filter)       => ipcRenderer.invoke('leaves:getAll', filter),
  createLeave:    (data)         => ipcRenderer.invoke('leaves:create', data),
  updateLeaveStatus: (id, status)=> ipcRenderer.invoke('leaves:updateStatus', id, status),
  deleteLeave:    (id)           => ipcRenderer.invoke('leaves:delete', id),

  // ── Expenses ──────────────────────────────────────────────────────────────
  getExpenses:    (filter, role) => ipcRenderer.invoke('expenses:getAll', filter, role),
  createExpense:  (data)         => ipcRenderer.invoke('expenses:create', data),
  updateExpenseStatus: (id, status)=> ipcRenderer.invoke('expenses:updateStatus', id, status),
  deleteExpense:  (id)           => ipcRenderer.invoke('expenses:delete', id),
  getUnreimbursedExpenses: (empId) => ipcRenderer.invoke('expenses:getUnreimbursed', empId),

  // ── Accommodation ─────────────────────────────────────────────────────────
  getRooms:               (filter)       => ipcRenderer.invoke('accommodation:getRooms', filter),
  createRoom:             (data)         => ipcRenderer.invoke('accommodation:createRoom', data),
  updateRoom:             (id, data)     => ipcRenderer.invoke('accommodation:updateRoom', { id, data }),
  deleteRoom:             (id)           => ipcRenderer.invoke('accommodation:deleteRoom', id),
  getAllocations:         (filter)       => ipcRenderer.invoke('accommodation:getAllocations', filter),
  allocateRoom:           (data)         => ipcRenderer.invoke('accommodation:allocateRoom', data),
  deallocateRoom:         (id, checkOutDate) => ipcRenderer.invoke('accommodation:deallocateRoom', { id, checkOutDate }),
  getLandlordPayments:    (roomId)       => ipcRenderer.invoke('accommodation:getLandlordPayments', roomId),
  payLandlordRent:        (data)         => ipcRenderer.invoke('accommodation:payLandlordRent', data),
  deleteLandlordPayment:  (id)           => ipcRenderer.invoke('accommodation:deleteLandlordPayment', id),
  getElectricityReadings: (roomId)       => ipcRenderer.invoke('accommodation:getElectricityReadings', roomId),
  saveElectricityReading: (data)         => ipcRenderer.invoke('accommodation:saveElectricityReading', data),
  deleteElectricityReading: (id)         => ipcRenderer.invoke('accommodation:deleteElectricityReading', id),
  getRoomFoodExpenses:    (filter)       => ipcRenderer.invoke('accommodation:getFoodExpenses', filter),
  createRoomFoodExpense:  (data)         => ipcRenderer.invoke('accommodation:createFoodExpense', data),
  deleteRoomFoodExpense:  (id)           => ipcRenderer.invoke('accommodation:deleteFoodExpense', id),

  // ── Projects ──────────────────────────────────────────────────────────────
  getProjects:    (filter)       => ipcRenderer.invoke('projects:get', filter),
  createProject:  (data)         => ipcRenderer.invoke('projects:create', data),
  updateProject:  (data)         => ipcRenderer.invoke('projects:update', data),
  deleteProject:  (id)           => ipcRenderer.invoke('projects:delete', id),
  exportProjectCostReport: (id)  => ipcRenderer.invoke('projects:exportCostReport', id),
  getProjectDashboardDetails: (data) => ipcRenderer.invoke('projects:getDashboardDetails', data),
  getInvoices:    (filter)       => ipcRenderer.invoke('invoices:get', filter),
  createInvoice:  (data)         => ipcRenderer.invoke('invoices:create', data),
  updateInvoice:  (data)         => ipcRenderer.invoke('invoices:update', data),
  deleteInvoice:  (id)           => ipcRenderer.invoke('invoices:delete', id),
  transferManpower:(data)        => ipcRenderer.invoke('projects:transferManpower', data),

  // ── Assets ────────────────────────────────────────────────────────────────
  getAssets:           (filter)       => ipcRenderer.invoke('assets:get', filter),
  createAsset:         (data)         => ipcRenderer.invoke('assets:create', data),
  updateAsset:         (data)         => ipcRenderer.invoke('assets:update', data),
  deleteAsset:         (id)           => ipcRenderer.invoke('assets:delete', id),
  assignAsset:         (data)         => ipcRenderer.invoke('assets:assign', data),
  retrieveAsset:       (data)         => ipcRenderer.invoke('assets:retrieve', data),
  startAssetMaintenance: (data)       => ipcRenderer.invoke('assets:maintenance:start', data),
  completeAssetMaintenance: (data)    => ipcRenderer.invoke('assets:maintenance:complete', data),
  getAssetHistory:     (id)           => ipcRenderer.invoke('assets:history:get', id),

  // ── Site Reports ──────────────────────────────────────────────────────────
  getSiteReports:    (filter)    => ipcRenderer.invoke('site_reports:get', filter),
  createSiteReport:  (data)      => ipcRenderer.invoke('site_reports:create', data),
  deleteSiteReport:  (id)        => ipcRenderer.invoke('site_reports:delete', id),

  // ── Audit Logs ────────────────────────────────────────────────────────────
  getAuditLogs:      (filter, role) => ipcRenderer.invoke('audit:getLogs', filter, role),
  exportAuditExcel:  ()          => ipcRenderer.invoke('audit:exportExcel'),

  // ── Alerts & Reminders ────────────────────────────────────────────────────
  getAlerts:         (filter)    => ipcRenderer.invoke('alerts:get', filter),
  runAlertRules:     ()          => ipcRenderer.invoke('alerts:runRules'),
  markAlertRead:     (id, read)  => ipcRenderer.invoke('alerts:markRead', id, read),
  deleteAlert:       (id)        => ipcRenderer.invoke('alerts:delete', id),
  createAlert:       (data)      => ipcRenderer.invoke('alerts:create', data),
  
  // ── Workforce Connect (Chat) ──────────────────────────────────────────────
  getRecentChats:    (userId)    => ipcRenderer.invoke('chats:getRecent', userId),
  getChatMessages:   (data)      => ipcRenderer.invoke('chats:getMessages', data),
  sendChatMessage:   (chatId, senderId, content) => ipcRenderer.invoke('chats:send', { chatId, senderId, content }),
  startPrivateChat:  (userId, targetId) => ipcRenderer.invoke('chats:startPrivate', { userId, targetId }),
  getChatUsers:      (userId)    => ipcRenderer.invoke('chats:getUsers', userId),
  updatePresence:    (userId)    => ipcRenderer.invoke('chats:updatePresence', userId),
  getProjectChat:    (data)      => ipcRenderer.invoke('chats:getProjectChat', data),

  // ── Automated Performance Bonus Engine ───────────────────────────────────────
  calculateScores:       (data)  => ipcRenderer.invoke('engine:calculateScores', data),
  generateRecommendations: (data)=> ipcRenderer.invoke('engine:generateRecommendations', data),
  approveBonus:          (data)  => ipcRenderer.invoke('engine:approveBonus', data),
  getRecommendations:    (data)  => ipcRenderer.invoke('engine:getRecommendations', data),
  deleteRecommendation:  (data)  => ipcRenderer.invoke('engine:deleteRecommendation', data),
  getEmployeeHistory:    (empId) => ipcRenderer.invoke('engine:getEmployeeHistory', empId),
  getEligibilityStats:   (data)  => ipcRenderer.invoke('engine:getEligibilityStats', data),

  // ── Sync / Safe Exit ───────────────────────────────────────────────────────
  startSync:      ()             => ipcRenderer.invoke('sync:start'),
  getSyncStatus:  ()             => ipcRenderer.invoke('sync:status'),
  checkStartupSync:()            => ipcRenderer.invoke('sync:checkStartupSync'),
  forceCloseApp:  ()             => ipcRenderer.invoke('sync:forceClose'),
  openOneDrive:   ()             => ipcRenderer.invoke('sync:openOneDrive'),
  onTriggerSyncClose: (callback) => ipcRenderer.on('trigger-sync-close', callback),

});
