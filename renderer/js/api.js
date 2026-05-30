/**
 * LocalPayroll — API Layer (renderer-side)
 * Thin wrappers around window.electronAPI with consistent error handling.
 * All ₹ ↔ paisa conversion happens HERE for the entire renderer.
 */

const API = (() => {

  // ── Money helpers (centralised) ─────────────────────────────────────────
  function toPaisa(rupees)  { return Math.round(parseFloat(rupees || 0) * 100); }
  function toRupees(paisa)  { return (paisa || 0) / 100; }
  function fmtRupees(paisa) {
    const r = (paisa || 0) / 100;
    return '₹' + r.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtRupeesShort(paisa) {
    const r = (paisa || 0) / 100;
    if (r >= 100000) return '₹' + (r / 100000).toFixed(1) + 'L';
    if (r >= 1000)   return '₹' + (r / 1000).toFixed(1) + 'K';
    return '₹' + r.toFixed(0);
  }

  // ── INTERNAL HELPER: Inject role into data ──────────────────────────────
  function withRole(data = {}) {
    const user = AppState.get('user');
    return { ...data, userRole: user?.role, operatorId: user?.id };
  }

  // ── Auth ────────────────────────────────────────────────────────────────
  async function login(username, password) {
    return window.electronAPI.login({ username, password });
  }
  async function heartbeat(data) {
    return window.electronAPI.heartbeat(data);
  }
  async function logout(data) {
    return window.electronAPI.logout(data);
  }
  async function changePassword(userId, currentPassword, newPassword) {
    return window.electronAPI.changePassword({ userId, currentPassword, newPassword });
  }
  async function getUsers()          { return window.electronAPI.getUsers(AppState.get('user')?.role); }
  async function createUser(u)       { return window.electronAPI.createUser(withRole(u)); }
  async function deleteUser(id)      { return window.electronAPI.deleteUser(id, AppState.get('user')?.role); }

  // ── Employees ───────────────────────────────────────────────────────────
  async function getEmployees(filter) { return window.electronAPI.getEmployees(filter); }
  async function getEmployee(id)      { return window.electronAPI.getEmployee(id); }

  async function createEmployee(emp) {
    return window.electronAPI.createEmployee(withRole({
      ...emp,
      salary: toPaisa(emp.salary), // ₹ → paisa before storing
      fixedGrossSalary: toPaisa(emp.fixedGrossSalary), 
      balance: toPaisa(emp.balance),
    }));
  }
  async function updateEmployee(id, emp) {
    return window.electronAPI.updateEmployee(id, {
      ...emp,
      salary: toPaisa(emp.salary),
      fixedGrossSalary: toPaisa(emp.fixedGrossSalary),
    }, AppState.get('user')?.role);
  }
  async function deleteEmployee(id) { return window.electronAPI.deleteEmployee(id, AppState.get('user')?.role); }
  async function updateBalance(data) { 
    return window.electronAPI.updateBalance(withRole({
      ...data,
      amount: toPaisa(data.amount)
    })); 
  }
  async function getLedger(id) { return window.electronAPI.getLedger(id); }
  async function checkDuplicateEmployee(field, value, excludeId) {
    return window.electronAPI.checkDuplicate({ field, value, excludeId });
  }
  async function runInlineOcr(filePath, docType) {
    return window.electronAPI.runInlineOcr({ filePath, docType });
  }

  // ── Attendance ──────────────────────────────────────────────────────────
  async function markAttendance(data)              { return window.electronAPI.markAttendance(withRole(data)); }
  async function getMonthAttendance(id, m, y)       { return window.electronAPI.getMonthAttendance(id, m, y); }
  async function getBulkAttendance(date)            { return window.electronAPI.getBulkAttendance(date); }
  async function getAttendanceSummary(id, m, y)     { return window.electronAPI.getAttendanceSummary(id, m, y); }
  async function exportAttendanceRegister(m, y, fmt){ return window.electronAPI.exportAttendanceRegister(m, y, fmt); }
  async function finalizeAttendance(params)        { return window.electronAPI.finalizeAttendance(params); }
  async function unfinalizeAttendance(params)      { return window.electronAPI.unfinalizeAttendance(params); }
  async function checkPendingFinalization(date)    { return window.electronAPI.checkPendingFinalization({ date }); }
  async function getPendingPastAttendance(days)    { return window.electronAPI.getPendingPastAttendance(days); }
  
  // Correction Flow
  async function submitAttendanceCorrection(data)  { return window.electronAPI.submitCorrection(withRole(data)); }
  async function getPendingCorrections()           { return window.electronAPI.getPendingCorrections(); }
  async function resolveCorrection(id, action)     { return window.electronAPI.resolveCorrection({ id, action, resolvedBy: AppState.get('user')?.id }); }

  // ── Advances ────────────────────────────────────────────────────────────
  async function getAdvances(filter)   { return window.electronAPI.getAdvances(filter); }
  async function getAdvanceSummary(id, m, y) { return window.electronAPI.getAdvanceSummary(id, m, y); }
  async function getAdvanceEmployeeSummaries(filter) { return window.electronAPI.getAdvanceEmployeeSummaries(filter); }
  async function getAdvanceEmployeeLedger(empId, filter) { return window.electronAPI.getAdvanceEmployeeLedger(empId, filter); }
  async function exportAdvanceLedgerExcel(id){ return window.electronAPI.exportAdvanceLedgerExcel(id); }
  
  // New Advance Workflow
  async function createAdvanceRequest(data) {
    return window.electronAPI.createAdvanceRequest(withRole({
      ...data,
      requestedAmount: toPaisa(data.requestedAmount)
    }));
  }
  async function getAdvanceRequests(filter) {
    return window.electronAPI.getAdvanceRequests(filter, AppState.get('user')?.role);
  }
  async function updateAdvanceRequestStatus(data) {
    return window.electronAPI.updateAdvanceRequestStatus(withRole({
      ...data,
      approvedAmount: data.approvedAmount ? toPaisa(data.approvedAmount) : null
    }));
  }

  async function deleteAdvanceRequest(data) {
    return window.electronAPI.deleteAdvanceRequest(withRole(data));
  }

  async function addAdvance(data) {
    return window.electronAPI.addAdvance(withRole({
      ...data,
      amount: toPaisa(data.amount), // ₹ → paisa
    }));
  }
  async function deleteAdvance(arg) { 
    const id = typeof arg === 'object' ? arg.id : arg;
    return window.electronAPI.deleteAdvance(withRole({ id })); 
  }

  // ── Payments ────────────────────────────────────────────────────────────
  async function getPayments(filter)           { return window.electronAPI.getPayments(filter, AppState.get('user')?.role); }
  async function getSalaryCalculation(id, m, y){ return window.electronAPI.getSalaryCalculation(id, m, y, AppState.get('user')?.role); }
  async function calculateAll(m, y)            { return window.electronAPI.calculateAll(m, y, AppState.get('user')?.role); }

  async function createPayment(data) {
    return window.electronAPI.createPayment(withRole({
      ...data,
      otherDeductions: toPaisa(data.otherDeductionsRupees || 0),
      foodAllowance: toPaisa(data.foodAllowanceRupees || 0),
      travelAllowance: toPaisa(data.travelAllowanceRupees || 0),
      paidAmount: toPaisa(data.paidAmountRupees || 0),
    }));
  }
  async function updatePayment(id, data) { return window.electronAPI.updatePayment(id, withRole(data)); }
  async function deletePayment(id) { 
    return window.electronAPI.deletePayment(withRole({ id })); 
  }
  async function auditPayroll(m, y) { return window.electronAPI.auditPayroll(m, y, AppState.get('user')?.role); }

  // ── Reports ─────────────────────────────────────────────────────────────
  async function getDashboardStats(params)  { return window.electronAPI.getDashboardStats(params); }
  async function exportPayslipPdf(id)        { return window.electronAPI.exportPayslipPdf(id); }
  async function exportMonthlyPdf(m, y)      { return window.electronAPI.exportMonthlyPdf(m, y); }
  async function exportCalendarPdf(id, m, y) { return window.electronAPI.exportCalendarPdf(id, m, y); }
  async function exportMonthlyExcel(m, y)    { return window.electronAPI.exportMonthlyExcel(m, y); }
  async function exportEmployeeExcel(empId)  { return window.electronAPI.exportEmployeeExcel(empId); }
  async function exportDailyAttendanceExcel(date) { return window.electronAPI.exportDailyAttendanceExcel(date); }
  async function exportDailyManpowerPdf(date) { return window.electronAPI.exportDailyManpowerPdf(date); }
  async function shareDailyManpowerWhatsApp(date) { return window.electronAPI.shareDailyManpowerWhatsApp(date); }
  async function exportAttendanceRangeExcel(params) { return window.electronAPI.exportAttendanceRangeExcel(params); }

  // ── Utils ───────────────────────────────────────────────────────────────
  async function openExternalUrl(url)        { return window.electronAPI.openExternalUrl(url); }

  // ── Settings ────────────────────────────────────────────────────────────
  async function getSettings()               { return window.electronAPI.getSettings(AppState.get('user')?.role); }
  async function saveSettings(data)          { return window.electronAPI.saveSettings(withRole(data)); }
  async function getDbPath()                 { return window.electronAPI.getDbPath(); }

  // ── Backup ──────────────────────────────────────────────────────────────
  async function exportBackup() { return window.electronAPI.exportBackup(AppState.get('user')?.role); }
  async function exportBackupOneDrive() { return window.electronAPI.exportBackupOneDrive(); }
  async function importBackup() { return window.electronAPI.importBackup(AppState.get('user')?.role); }

  // ── Staff Documents ───────────────────────────────────────────────────────
  async function getStaffDocs(filter) { return window.electronAPI.getStaffDocs(filter); }
  async function uploadStaffDoc(data) { return window.electronAPI.uploadStaffDoc(withRole(data)); }
  async function deleteStaffDoc(id)   { return window.electronAPI.deleteStaffDoc(id, AppState.get('user')?.role); }
  async function previewStaffDoc(id)  { return window.electronAPI.previewStaffDoc(id); }
  async function runStaffDocOcr(id)   { return window.electronAPI.runStaffDocOcr(id); }
  async function updateStaffDocOcr(data) { return window.electronAPI.updateStaffDocOcr(withRole(data)); }
  async function mapOcrToProfile(data) { return window.electronAPI.mapOcrToProfile(withRole(data)); }
  async function exportStaffOcrExcel() { return window.electronAPI.exportStaffOcrExcel(); }
  async function compileStaffDocs(data) { return window.electronAPI.compileStaffDocs(withRole(data)); }

  // ── Leaves ───────────────────────────────────────────────────────────────
  async function getLeaves(filter)      { return window.electronAPI.getLeaves(filter); }
  async function getLeaveStats(empId, y){ return window.electronAPI.getLeaveStats({ employeeId: empId, year: y }); }
  async function createLeave(data)      { return window.electronAPI.createLeave(withRole(data)); }
  async function updateLeaveStatus(id, s){ return window.electronAPI.updateLeaveStatus({ id, status: s, operatorId: AppState.get('user')?.id, userRole: AppState.get('user')?.role }); }
  async function deleteLeave(arg) { 
    const id = typeof arg === 'object' ? arg.id : arg;
    return window.electronAPI.deleteLeave(withRole({ id })); 
  }

  // ── Expenses ─────────────────────────────────────────────────────────────
  async function getExpenses(filter)    { return window.electronAPI.getExpenses(filter, AppState.get('user')?.role); }
  async function createExpense(data) {
    return window.electronAPI.createExpense(withRole({
      ...data,
      amount: toPaisa(data.amount)
    }));
  }
  async function updateExpenseStatus(arg, statusIfPositional){ 
    const id = typeof arg === 'object' ? arg.id : arg;
    const status = typeof arg === 'object' ? arg.status : statusIfPositional;
    return window.electronAPI.updateExpenseStatus(withRole({ id, status })); 
  }
  async function deleteExpense(id) { 
    return window.electronAPI.deleteExpense(withRole({ id })); 
  }
  async function getUnreimbursedExpenses(id){ return window.electronAPI.getUnreimbursedExpenses(id); }

  // ── Projects ─────────────────────────────────────────────────────────────
  async function getProjects(filter)    { return window.electronAPI.getProjects(filter); }
  async function createProject(data)    { return window.electronAPI.createProject(withRole(data)); }
  async function updateProject(data)    { return window.electronAPI.updateProject(withRole(data)); }
  async function deleteProject(id)      { return window.electronAPI.deleteProject(id, AppState.get('user')?.role); }
  async function exportProjectCostReport(id){ return window.electronAPI.exportProjectCostReport(id); }
  async function getProjectDashboardDetails(data) { return window.electronAPI.getProjectDashboardDetails(data); }
  async function getInvoices(filter)    { return window.electronAPI.getInvoices(filter); }
  async function createInvoice(data)    { return window.electronAPI.createInvoice(withRole({
    ...data,
    amount: toPaisa(data.amount),
    gstAmount: toPaisa(data.gstAmount),
    retentionAmount: toPaisa(data.retentionAmount),
    paidAmount: toPaisa(data.paidAmount)
  })); }
  async function updateInvoice(data)    { return window.electronAPI.updateInvoice(withRole({
    ...data,
    amount: data.amount !== undefined ? toPaisa(data.amount) : undefined,
    gstAmount: data.gstAmount !== undefined ? toPaisa(data.gstAmount) : undefined,
    retentionAmount: data.retentionAmount !== undefined ? toPaisa(data.retentionAmount) : undefined,
    paidAmount: data.paidAmount !== undefined ? toPaisa(data.paidAmount) : undefined
  })); }
  async function deleteInvoice(id)      { return window.electronAPI.deleteInvoice(id); }
  async function transferManpower(data) { return window.electronAPI.transferManpower(withRole(data)); }

  // ── Site Reports ─────────────────────────────────────────────────────────
  async function getSiteReports(filter) { return window.electronAPI.getSiteReports(filter); }
  async function createSiteReport(data) { return window.electronAPI.createSiteReport(withRole(data)); }
  async function deleteSiteReport(id)   { return window.electronAPI.deleteSiteReport(id, AppState.get('user')?.role); }

  // ── Audit Logs ───────────────────────────────────────────────────────────
  async function getAuditLogs(filter)   { return window.electronAPI.getAuditLogs(filter, AppState.get('user')?.role); }
  async function exportAuditExcel()     { return window.electronAPI.exportAuditExcel(AppState.get('user')?.role); }

  // ── Accommodation ───────────────────────────────────────────────────────
  async function getRooms(filter) { return window.electronAPI.getRooms(filter); }
  async function createRoom(data) {
    return window.electronAPI.createRoom({
      ...data,
      monthlyRent: toPaisa(data.monthlyRent)
    });
  }
  async function updateRoom(id, data) {
    return window.electronAPI.updateRoom(id, {
      ...data,
      monthlyRent: toPaisa(data.monthlyRent)
    });
  }
  async function deleteRoom(id) { return window.electronAPI.deleteRoom(id); }
  async function getRoomAllocations(filter) { return window.electronAPI.getAllocations(filter); }
  async function allocateRoom(data) {
    return window.electronAPI.allocateRoom({
      ...data,
      fixedDeductionAmount: toPaisa(data.fixedDeductionAmount)
    });
  }
  async function deallocateRoom(id, checkOutDate) { return window.electronAPI.deallocateRoom(id, checkOutDate); }
  async function getLandlordPayments(roomId) { return window.electronAPI.getLandlordPayments(roomId); }
  async function payLandlordRent(data) {
    return window.electronAPI.payLandlordRent({
      ...data,
      amountPaid: toPaisa(data.amountPaid)
    });
  }
  async function deleteLandlordPayment(id) { return window.electronAPI.deleteLandlordPayment(id); }
  async function getElectricityReadings(roomId) { return window.electronAPI.getElectricityReadings(roomId); }
  async function saveElectricityReading(data) {
    return window.electronAPI.saveElectricityReading({
      ...data,
      ratePerUnit: toPaisa(data.ratePerUnit),
      fixedCharges: toPaisa(data.fixedCharges)
    });
  }
  async function deleteElectricityReading(id) { return window.electronAPI.deleteElectricityReading(id); }
  async function getRoomFoodExpenses(filter) { return window.electronAPI.getRoomFoodExpenses(filter); }
  async function createRoomFoodExpense(data) {
    return window.electronAPI.createRoomFoodExpense({
      ...data,
      amount: toPaisa(data.amount)
    });
  }
  async function deleteRoomFoodExpense(id) { return window.electronAPI.deleteRoomFoodExpense(id); }

  // ── Alerts & Reminders ───────────────────────────────────────────────────
  async function getAlerts(filter)      { return window.electronAPI.getAlerts(filter); }
  async function runAlertRules()        { return window.electronAPI.runAlertRules(); }
  async function markAlertRead(id, r)   { return window.electronAPI.markAlertRead(id, r); }
  async function deleteAlert(id)        { return window.electronAPI.deleteAlert(id); }
  async function createAlert(data)      { return window.electronAPI.createAlert(data); }

  // ── Assets ──────────────────────────────────────────────────────────────
  async function getAssets(filter) { return window.electronAPI.getAssets(filter); }
  async function createAsset(data) {
    return window.electronAPI.createAsset({
      ...data,
      purchaseCost: toPaisa(data.purchaseCost)
    });
  }
  async function updateAsset(data) {
    return window.electronAPI.updateAsset({
      ...data,
      purchaseCost: toPaisa(data.purchaseCost)
    });
  }
  async function deleteAsset(id) { return window.electronAPI.deleteAsset(id); }
  async function assignAsset(data) { return window.electronAPI.assignAsset(data); }
  async function retrieveAsset(data) { return window.electronAPI.retrieveAsset(data); }
  async function startAssetMaintenance(data) { return window.electronAPI.startAssetMaintenance(data); }
  async function completeAssetMaintenance(data) {
    return window.electronAPI.completeAssetMaintenance({
      ...data,
      cost: toPaisa(data.cost)
    });
  }
  async function getAssetHistory(id) { return window.electronAPI.getAssetHistory(id); }

  // ── Sync / Safe Exit ─────────────────────────────────────────────────────
  async function startSync()         { return window.electronAPI.startSync(); }
  async function getSyncStatus()     { return window.electronAPI.getSyncStatus(); }
  async function checkStartupSync()  { return window.electronAPI.checkStartupSync(); }
  async function forceCloseApp()     { return window.electronAPI.forceCloseApp(); }
  async function openOneDrive()      { return window.electronAPI.openOneDrive(); }
  function onTriggerSyncClose(cb)    { return window.electronAPI.onTriggerSyncClose(cb); }

  // ── Expose on API object ─────────────────────────────────────────────────
  return {
    // Money utils (used by every page)
    toPaisa, toRupees, fmtRupees, fmtRupeesShort,
    // Auth
    login, logout, heartbeat, changePassword, getUsers, createUser, deleteUser,
    // Employees
    getEmployees, getEmployee, createEmployee, updateEmployee, deleteEmployee, updateBalance, getLedger,
    checkDuplicateEmployee, runInlineOcr,
    // Attendance
    markAttendance, getMonthAttendance, getBulkAttendance, getAttendanceSummary, exportAttendanceRegister,
    finalizeAttendance, unfinalizeAttendance, checkPendingFinalization, getPendingPastAttendance,
    submitAttendanceCorrection, getPendingCorrections, resolveCorrection,
    // Advances
    getAdvances, getAdvanceSummary, addAdvance, deleteAdvance,
    getAdvanceEmployeeSummaries, getAdvanceEmployeeLedger, exportAdvanceLedgerExcel,
    createAdvanceRequest, getAdvanceRequests, updateAdvanceRequestStatus, deleteAdvanceRequest,
    // Payments
    getPayments, getSalaryCalculation, calculateAll, createPayment, updatePayment, deletePayment, auditPayroll,
    // Reports
    getDashboardStats, exportPayslipPdf, exportMonthlyPdf, exportCalendarPdf, exportMonthlyExcel, exportEmployeeExcel, exportDailyAttendanceExcel, exportDailyManpowerPdf, shareDailyManpowerWhatsApp, exportAttendanceRangeExcel,
    // Utils
    openExternalUrl,
    // Settings
    getSettings, saveSettings, getDbPath,
    // Backup
    exportBackup, exportBackupOneDrive, importBackup,
    // Staff Documents
    getStaffDocs, uploadStaffDoc, deleteStaffDoc, previewStaffDoc, runStaffDocOcr, updateStaffDocOcr, mapOcrToProfile, exportStaffOcrExcel, compileStaffDocs,
    // New Modules
    getLeaves, createLeave, updateLeaveStatus, deleteLeave,
    getExpenses, createExpense, updateExpenseStatus, deleteExpense, getUnreimbursedExpenses,
    getProjects, createProject, updateProject, deleteProject, exportProjectCostReport, getProjectDashboardDetails,
    getInvoices, createInvoice, updateInvoice, deleteInvoice, transferManpower,
    getSiteReports, createSiteReport, deleteSiteReport,
    getAuditLogs, exportAuditExcel,
    getAlerts, runAlertRules, markAlertRead, deleteAlert, createAlert,
    startSync, getSyncStatus, checkStartupSync, forceCloseApp, openOneDrive, onTriggerSyncClose,
    // Accommodation
    getRooms, createRoom, updateRoom, deleteRoom, getRoomAllocations, allocateRoom, deallocateRoom,
    getLandlordPayments, payLandlordRent, deleteLandlordPayment, getElectricityReadings, saveElectricityReading, deleteElectricityReading,
    getRoomFoodExpenses, createRoomFoodExpense, deleteRoomFoodExpense,
    // Assets
    getAssets, createAsset, updateAsset, deleteAsset, assignAsset, retrieveAsset, startAssetMaintenance, completeAssetMaintenance, getAssetHistory
  };
})();

// Ensure it is globally available via window.API since top-level const doesn't attach to window
window.API = API;
