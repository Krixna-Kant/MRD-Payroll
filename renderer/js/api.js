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

  // ── Attendance ──────────────────────────────────────────────────────────
  async function markAttendance(data)              { return window.electronAPI.markAttendance(data); }
  async function getMonthAttendance(id, m, y)       { return window.electronAPI.getMonthAttendance(id, m, y); }
  async function getBulkAttendance(date)            { return window.electronAPI.getBulkAttendance(date); }
  async function getAttendanceSummary(id, m, y)     { return window.electronAPI.getAttendanceSummary(id, m, y); }

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
  async function exportMonthlyExcel(m, y)    { return window.electronAPI.exportMonthlyExcel(m, y); }
  async function exportEmployeeExcel(empId)  { return window.electronAPI.exportEmployeeExcel(empId); }
  async function exportDailyAttendanceExcel(date) { return window.electronAPI.exportDailyAttendanceExcel(date); }
  async function exportAttendanceRangeExcel(params) { return window.electronAPI.exportAttendanceRangeExcel(params); }

  // ── Settings ────────────────────────────────────────────────────────────
  async function getSettings()               { return window.electronAPI.getSettings(); }
  async function saveSettings(data)          { return window.electronAPI.saveSettings(data); }

  // ── Backup ──────────────────────────────────────────────────────────────
  async function exportBackup() { return window.electronAPI.exportBackup(); }
  async function importBackup() { return window.electronAPI.importBackup(); }

  // ── Expose on API object ─────────────────────────────────────────────────
  return {
    // Money utils (used by every page)
    toPaisa, toRupees, fmtRupees, fmtRupeesShort,
    // Auth
    login, changePassword, getUsers, createUser, deleteUser,
    // Employees
    getEmployees, getEmployee, createEmployee, updateEmployee, deleteEmployee,
    // Attendance
    markAttendance, getMonthAttendance, getBulkAttendance, getAttendanceSummary,
    // Advances
    getAdvances, getAdvanceSummary, addAdvance, deleteAdvance,
    // Payments
    getPayments, getSalaryCalculation, calculateAll, createPayment, updatePayment, deletePayment,
    // Reports
    getDashboardStats, exportPayslipPdf, exportMonthlyPdf, exportMonthlyExcel, exportEmployeeExcel, exportDailyAttendanceExcel, exportAttendanceRangeExcel,
    // Settings
    getSettings, saveSettings,
    // Backup
    exportBackup, importBackup,
  };
})();
