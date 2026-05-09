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

  // ── Auth ────────────────────────────────────────────────────────────────
  async function login(username, password) {
    return window.electronAPI.login({ username, password });
  }
  async function changePassword(userId, currentPassword, newPassword) {
    return window.electronAPI.changePassword({ userId, currentPassword, newPassword });
  }
  async function getUsers()          { return window.electronAPI.getUsers(); }
  async function createUser(u)       { return window.electronAPI.createUser(u); }
  async function deleteUser(id)      { return window.electronAPI.deleteUser(id); }

  // ── Employees ───────────────────────────────────────────────────────────
  async function getEmployees(filter) { return window.electronAPI.getEmployees(filter); }
  async function getEmployee(id)      { return window.electronAPI.getEmployee(id); }

  async function createEmployee(emp) {
    return window.electronAPI.createEmployee({
      ...emp,
      salary: toPaisa(emp.salary), // ₹ → paisa before storing
      fixedGrossSalary: toPaisa(emp.fixedGrossSalary), 
      balance: toPaisa(emp.balance),
    });
  }
  async function updateEmployee(id, emp) {
    return window.electronAPI.updateEmployee(id, {
      ...emp,
      salary: toPaisa(emp.salary),
      fixedGrossSalary: toPaisa(emp.fixedGrossSalary),
    });
  }
  async function deleteEmployee(id) { return window.electronAPI.deleteEmployee(id); }
  async function updateBalance(data) { 
    return window.electronAPI.updateBalance({
      ...data,
      amount: toPaisa(data.amount)
    }); 
  }
  async function getLedger(id) { return window.electronAPI.getLedger(id); }

  // ── Attendance ──────────────────────────────────────────────────────────
  async function markAttendance(data)              { return window.electronAPI.markAttendance(data); }
  async function getMonthAttendance(id, m, y)       { return window.electronAPI.getMonthAttendance(id, m, y); }
  async function getBulkAttendance(date)            { return window.electronAPI.getBulkAttendance(date); }
  async function getAttendanceSummary(id, m, y)     { return window.electronAPI.getAttendanceSummary(id, m, y); }
  async function exportAttendanceRegister(m, y, fmt){ return window.electronAPI.exportAttendanceRegister(m, y, fmt); }

  // ── Advances ────────────────────────────────────────────────────────────
  async function getAdvances(filter)   { return window.electronAPI.getAdvances(filter); }
  async function getAdvanceSummary(id, m, y) { return window.electronAPI.getAdvanceSummary(id, m, y); }

  async function addAdvance(data) {
    return window.electronAPI.addAdvance({
      ...data,
      amount: toPaisa(data.amount), // ₹ → paisa
    });
  }
  async function deleteAdvance(id) { return window.electronAPI.deleteAdvance(id); }

  // ── Payments ────────────────────────────────────────────────────────────
  async function getPayments(filter)           { return window.electronAPI.getPayments(filter); }
  async function getSalaryCalculation(id, m, y){ return window.electronAPI.getSalaryCalculation(id, m, y); }
  async function calculateAll(m, y)            { return window.electronAPI.calculateAll(m, y); }

  async function createPayment(data) {
    return window.electronAPI.createPayment({
      ...data,
      otherDeductions: toPaisa(data.otherDeductionsRupees || 0),
      foodAllowance: toPaisa(data.foodAllowanceRupees || 0),
      travelAllowance: toPaisa(data.travelAllowanceRupees || 0),
      paidAmount: toPaisa(data.paidAmountRupees || 0),
    });
  }
  async function updatePayment(id, data) { return window.electronAPI.updatePayment(id, data); }
  async function deletePayment(id)       { return window.electronAPI.deletePayment(id); }

  // ── Reports ─────────────────────────────────────────────────────────────
  async function getDashboardStats()         { return window.electronAPI.getDashboardStats(); }
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
  async function getSettings()               { return window.electronAPI.getSettings(); }
  async function saveSettings(data)          { return window.electronAPI.saveSettings(data); }

  // ── Backup ──────────────────────────────────────────────────────────────
  async function exportBackup() { return window.electronAPI.exportBackup(); }
  async function importBackup() { return window.electronAPI.importBackup(); }

  // ── Staff Documents ───────────────────────────────────────────────────────
  async function getStaffDocs(filter) { return window.electronAPI.getStaffDocs(filter); }
  async function uploadStaffDoc(data) { return window.electronAPI.uploadStaffDoc(data); }
  async function deleteStaffDoc(id)   { return window.electronAPI.deleteStaffDoc(id); }
  async function previewStaffDoc(id)  { return window.electronAPI.previewStaffDoc(id); }
  async function runStaffDocOcr(id)   { return window.electronAPI.runStaffDocOcr(id); }
  async function updateStaffDocOcr(data) { return window.electronAPI.updateStaffDocOcr(data); }
  async function mapOcrToProfile(data) { return window.electronAPI.mapOcrToProfile(data); }
  async function exportStaffOcrExcel() { return window.electronAPI.exportStaffOcrExcel(); }

  // ── Leaves ───────────────────────────────────────────────────────────────
  async function getLeaves(filter)      { return window.electronAPI.getLeaves(filter); }
  async function createLeave(data)      { return window.electronAPI.createLeave(data); }
  async function updateLeaveStatus(id, s){ return window.electronAPI.updateLeaveStatus(id, s); }
  async function deleteLeave(id)        { return window.electronAPI.deleteLeave(id); }

  // ── Expenses ─────────────────────────────────────────────────────────────
  async function getExpenses(filter)    { return window.electronAPI.getExpenses(filter); }
  async function createExpense(data) {
    return window.electronAPI.createExpense({
      ...data,
      amount: toPaisa(data.amount)
    });
  }
  async function updateExpenseStatus(id, s){ return window.electronAPI.updateExpenseStatus(id, s); }
  async function deleteExpense(id)        { return window.electronAPI.deleteExpense(id); }
  async function getUnreimbursedExpenses(id){ return window.electronAPI.getUnreimbursedExpenses(id); }

  // ── Projects ─────────────────────────────────────────────────────────────
  async function getProjects(filter)    { return window.electronAPI.getProjects(filter); }
  async function createProject(data)    { return window.electronAPI.createProject(data); }
  async function updateProject(data)    { return window.electronAPI.updateProject(data); }
  async function deleteProject(id)      { return window.electronAPI.deleteProject(id); }
  async function exportProjectCostReport(id){ return window.electronAPI.exportProjectCostReport(id); }

  // ── Site Reports ─────────────────────────────────────────────────────────
  async function getSiteReports(filter) { return window.electronAPI.getSiteReports(filter); }
  async function createSiteReport(data) { return window.electronAPI.createSiteReport(data); }
  async function deleteSiteReport(id)   { return window.electronAPI.deleteSiteReport(id); }

  // ── Audit Logs ───────────────────────────────────────────────────────────
  async function getAuditLogs(filter)   { return window.electronAPI.getAuditLogs(filter); }
  async function exportAuditExcel()     { return window.electronAPI.exportAuditExcel(); }

  // ── Alerts & Reminders ───────────────────────────────────────────────────
  async function getAlerts(filter)      { return window.electronAPI.getAlerts(filter); }
  async function runAlertRules()        { return window.electronAPI.runAlertRules(); }
  async function markAlertRead(id, r)   { return window.electronAPI.markAlertRead(id, r); }
  async function deleteAlert(id)        { return window.electronAPI.deleteAlert(id); }

  // ── Expose on API object ─────────────────────────────────────────────────
  return {
    // Money utils (used by every page)
    toPaisa, toRupees, fmtRupees, fmtRupeesShort,
    // Auth
    login, changePassword, getUsers, createUser, deleteUser,
    // Employees
    getEmployees, getEmployee, createEmployee, updateEmployee, deleteEmployee, updateBalance, getLedger,
    // Attendance
    markAttendance, getMonthAttendance, getBulkAttendance, getAttendanceSummary, exportAttendanceRegister,
    // Advances
    getAdvances, getAdvanceSummary, addAdvance, deleteAdvance,
    // Payments
    getPayments, getSalaryCalculation, calculateAll, createPayment, updatePayment, deletePayment,
    // Reports
    getDashboardStats, exportPayslipPdf, exportMonthlyPdf, exportCalendarPdf, exportMonthlyExcel, exportEmployeeExcel, exportDailyAttendanceExcel, exportDailyManpowerPdf, shareDailyManpowerWhatsApp, exportAttendanceRangeExcel,
    // Utils
    openExternalUrl,
    // Settings
    getSettings, saveSettings,
    // Backup
    exportBackup, importBackup,
    // Staff Documents
    getStaffDocs, uploadStaffDoc, deleteStaffDoc, previewStaffDoc, runStaffDocOcr, updateStaffDocOcr, mapOcrToProfile, exportStaffOcrExcel,
    // New Modules
    getLeaves, createLeave, updateLeaveStatus, deleteLeave,
    getExpenses, createExpense, updateExpenseStatus, deleteExpense, getUnreimbursedExpenses,
    getProjects, createProject, updateProject, deleteProject, exportProjectCostReport,
    getSiteReports, createSiteReport, deleteSiteReport,
    getAuditLogs, exportAuditExcel,
    getAlerts, runAlertRules, markAlertRead, deleteAlert
  };
})();

// Ensure it is globally available via window.API since top-level const doesn't attach to window
window.API = API;
