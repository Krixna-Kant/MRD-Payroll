/**
 * LocalPayroll - Employees IPC Handlers
 * Full CRUD for employees. Salary stored as PAISA (integer).
 */

const { getDB }         = require('../database/db');
const { logActivity }   = require('../utils/audit');
const path              = require('path');
const fs                = require('fs');
const { app }           = require('electron');
const { createWorker }  = require('tesseract.js');

module.exports = function registerEmployeeHandlers(ipcMain) {

  // ── Get All Employees (with optional search filter) ───────────────────────
  ipcMain.handle('employees:getAll', async (_, filter = {}) => {
    const db = getDB();
    let query = `SELECT * FROM employees WHERE 1=1`;
    const params = [];

    if (filter.search) {
      query += ` AND (name LIKE ? OR phone LIKE ?)`;
      params.push(`%${filter.search}%`, `%${filter.search}%`);
    }
    if (filter.status) {
      query += ` AND status = ?`;
      params.push(filter.status);
    }
    if (filter.projectId !== undefined) {
      if (filter.projectId === null || filter.projectId === 'null') {
        query += ` AND project_id IS NULL`;
      } else {
        query += ` AND project_id = ?`;
        params.push(parseInt(filter.projectId));
      }
    }

    query += ` ORDER BY name ASC`;
    const employees = db.prepare(query).all(...params);
    return { success: true, employees };
  });

  // ── Get Single Employee ───────────────────────────────────────────────────
  ipcMain.handle('employees:getOne', async (_, id) => {
    const db = getDB();
    const employee = db.prepare(`
      SELECT *, 
             (SELECT COALESCE(SUM(amount), 0) FROM advances WHERE employee_id = e.id) as total_advances,
             balance
      FROM employees e
      WHERE id = ?
    `).get(id);
    if (!employee) return { success: false, error: 'Employee not found.' };
    return { success: true, employee };
  });

  // ── Create Employee ───────────────────────────────────────────────────────
  // salary comes in as PAISA from the renderer (renderer converts ₹ → paisa before calling)
  ipcMain.handle('employees:create', async (_, data) => {
    const db = getDB();
    const {
      name, phone, role, salary, joiningDate, notes, balance,
      aadhaar_no, pan_no, dob, gender, address,
      bank_name, account_no, ifsc_code, account_holder_name, father_name
    } = data;
    
    if (!name || !name.trim()) return { success: false, error: 'Employee name is required.' };

    const transaction = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO employees (
          name, phone, role, salary, joining_date, notes, balance,
          aadhaar_no, pan_no, dob, gender, address,
          bank_name, account_no, ifsc_code, account_holder_name, father_name
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        name.trim(), phone || null, role || null, salary || 0, joiningDate || null, notes || null, balance || 0,
        aadhaar_no || null, pan_no || null, dob || null, gender || null, address || null,
        bank_name || null, account_no || null, ifsc_code || null, account_holder_name || null, father_name || null
      );

      const empId = result.lastInsertRowid;

      if (balance !== 0) {
        db.prepare(`
          INSERT INTO ledger (employee_id, type, amount, running_balance, date, notes)
          VALUES (?, 'OPENING', ?, ?, ?, ?)
        `).run(empId, balance, balance, new Date().toISOString().split('T')[0], 'Opening Balance at creation');
      }

      return empId;
    });

    try {
      const employeeId = transaction();
      logActivity('Employees', 'Created', `Added new employee: ${name}`, null, `Role: ${role}, Salary: ${salary}`);
      return { success: true, employeeId };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Duplicate Field Check ──────────────────────────────────────────────────
  ipcMain.handle('employees:checkDuplicate', async (_, { field, value, excludeId }) => {
    if (!value || !value.trim()) return { success: true, duplicate: false };
    const db = getDB();
    const col = { aadhaar_no: 'aadhaar_no', pan_no: 'pan_no', account_no: 'account_no' }[field];
    if (!col) return { success: true, duplicate: false };
    let q = `SELECT id, name FROM employees WHERE ${col} = ? AND ${col} IS NOT NULL AND ${col} != ''`;
    const params = [value.trim()];
    if (excludeId) { q += ` AND id != ?`; params.push(excludeId); }
    const row = db.prepare(q).get(...params);
    return { success: true, duplicate: !!row, employeeName: row?.name || null };
  });

  // ── Inline OCR (used from Add/Edit Employee form) ──────────────────────────
  ipcMain.handle('employees:runInlineOcr', async (_, { filePath, docType }) => {
    let worker = null;
    try {
      if (!fs.existsSync(filePath)) throw new Error('File not found.');
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.pdf') throw new Error('PDF OCR not supported inline. Please upload an image (JPG/PNG).');

      worker = await createWorker('eng');
      const { data } = await worker.recognize(filePath);
      await worker.terminate();

      const text = data.text || '';
      const words = data.words || [];

      // Compute per-word confidence as a map of matched values
      const avgConf = words.length ? Math.round(words.reduce((s, w) => s + (w.confidence || 0), 0) / words.length) : 0;

      const extracted = parseInlineOcrText(text, docType);
      extracted._confidence = avgConf;
      extracted._rawText   = text;

      return { success: true, extracted, confidence: avgConf };
    } catch (err) {
      if (worker) { try { await worker.terminate(); } catch(_) {} }
      return { success: false, error: err.message };
    }
  });

  function parseInlineOcrText(text, docType) {
    const data = {};
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);

    if (docType === 'Aadhaar Card') {
      // Aadhaar Number: XXXX XXXX XXXX
      const m = text.match(/(\d{4}\s?\d{4}\s?\d{4})/);
      if (m) data.aadhaar_no = m[1].replace(/\s/g, ' ').trim();

      // DOB: DD/MM/YYYY or DD-MM-YYYY
      const dob = text.match(/(?:DOB|Date of Birth)[^\d]*(\d{2}[\/-]\d{2}[\/-]\d{4})/i);
      if (dob) data.dob = dob[1].replace(/-/g, '/');
      else {
        const dob2 = text.match(/(\d{2}[\/-]\d{2}[\/-]\d{4})/);
        if (dob2) data.dob = dob2[1].replace(/-/g, '/');
      }

      // Gender
      if (/\bFEMALE\b/i.test(text)) data.gender = 'Female';
      else if (/\bMALE\b/i.test(text)) data.gender = 'Male';

      // Name: usually 2nd or 3rd non-header line on Aadhaar
      const skipKeywords = /aadhaar|adhaar|government|india|uid|unique|enrollment|dob|date|birth|male|female|year|address|\d/i;
      const nameLines = lines.filter(l => !skipKeywords.test(l) && l.length > 3 && l.length < 60);
      if (nameLines.length > 0) data.name = nameLines[0];

      // Address: look for lines after 'Address' keyword
      const addrIdx = lines.findIndex(l => /^address/i.test(l));
      if (addrIdx !== -1 && addrIdx < lines.length - 1) {
        data.address = lines.slice(addrIdx + 1, addrIdx + 5).join(', ');
      }

    } else if (docType === 'PAN Card') {
      // PAN Number: AAAAA9999A
      const pan = text.match(/[A-Z]{5}\d{4}[A-Z]{1}/i);
      if (pan) data.pan_no = pan[0].toUpperCase();

      // DOB on PAN
      const dob = text.match(/(?:Date of Birth|DOB)[^\d]*(\d{2}\/\d{2}\/\d{4})/i)
                || text.match(/(\d{2}\/\d{2}\/\d{4})/);
      if (dob) data.dob = dob[1];

      // Name and Father name heuristic (lines after PAN keyword)
      const panIdx = lines.findIndex(l => /[A-Z]{5}\d{4}[A-Z]{1}/.test(l));
      const skipPan = /income tax|permanent|account|number|pan|card|govt|india|\d{4}/i;
      const nameLines = lines.filter((l, i) => i !== panIdx && !skipPan.test(l) && l.length > 3 && l.length < 60);
      if (nameLines.length > 0) data.name = nameLines[0];
      if (nameLines.length > 1) data.father_name = nameLines[1];

    } else if (docType === 'Passbook' || docType === 'Cancelled Cheque') {
      // Account Number (9-18 digits)
      const acc = text.match(/(?:A\/C|Account|Acc)[^\d]*(\d{9,18})/i) || text.match(/(\d{9,18})/);
      if (acc) data.account_no = acc[1];

      // IFSC Code: 4 letters + 0 + 6 alphanumeric
      const ifsc = text.match(/[A-Z]{4}0[A-Z0-9]{6}/i);
      if (ifsc) data.ifsc_code = ifsc[0].toUpperCase();

      // Bank Name: first recognizable line
      const bankKeywords = /bank|sbi|hdfc|icici|axis|kotak|union|canara|punjab|ucb|gramin|cooperative/i;
      const bankLine = lines.find(l => bankKeywords.test(l) && l.length < 60);
      if (bankLine) data.bank_name = bankLine;

      // Account Holder: line before account number
      const accIdx = lines.findIndex(l => acc && l.includes(acc[1]));
      if (accIdx > 0) {
        const skipLine = /bank|branch|ifsc|micr|\d{6,}/i;
        for (let i = accIdx - 1; i >= 0; i--) {
          if (!skipLine.test(lines[i]) && lines[i].length > 3) {
            data.account_holder_name = lines[i];
            break;
          }
        }
      }

    } else if (docType === 'Driving License') {
      // DL number: state code + pattern
      const dl = text.match(/[A-Z]{2}\d{2}\s?\d{4}\d{7}/i) || text.match(/[A-Z]{2}-\d{13}/i);
      if (dl) data.dl_number = dl[0].toUpperCase();

      const dob = text.match(/(?:DOB|D\.O\.B|Date of Birth)[^\d]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i)
                || text.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4})/);
      if (dob) data.dob = dob[1].replace(/-/g, '/');

      if (/\bF\b|FEMALE/i.test(text)) data.gender = 'Female';
      else if (/\bM\b|MALE/i.test(text)) data.gender = 'Male';

      const skipKw = /driving|license|motor|vehicle|rto|state|date|dob|\d/i;
      const nameLines = lines.filter(l => !skipKw.test(l) && l.length > 3 && l.length < 60);
      if (nameLines.length > 0) data.name = nameLines[0];
      if (nameLines.length > 1) data.address = nameLines.slice(1, 4).join(', ');

    } else if (docType === 'Voter ID') {
      if (/\bFEMALE\b/i.test(text)) data.gender = 'Female';
      else if (/\bMALE\b/i.test(text)) data.gender = 'Male';

      const skipKw = /election|commission|india|voter|epic|electors|photo|identity|\d/i;
      const nameLines = lines.filter(l => !skipKw.test(l) && l.length > 3 && l.length < 60);
      if (nameLines.length > 0) data.name = nameLines[0];
    }

    return data;
  }

  // ── Update Employee Balance (Manual Adjustment) ───────────────────────────
  ipcMain.handle('employees:updateBalance', async (_, { employeeId, amount, notes }) => {
    const db = getDB();
    const employee = db.prepare('SELECT id, balance FROM employees WHERE id = ?').get(employeeId);
    if (!employee) return { success: false, error: 'Employee not found.' };

    const newBalance = employee.balance + amount;
    
    const transaction = db.transaction(() => {
      db.prepare('UPDATE employees SET balance = ? WHERE id = ?').run(newBalance, employeeId);
      
      db.prepare(`
        INSERT INTO ledger (employee_id, type, amount, running_balance, date, notes)
        VALUES (?, 'ADJUSTMENT', ?, ?, ?, ?)
      `).run(employeeId, amount, newBalance, new Date().toISOString().split('T')[0], notes || 'Manual Balance Adjustment');
    });

    try {
      transaction();
      return { success: true, newBalance };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Update Employee ───────────────────────────────────────────────────────
  ipcMain.handle('employees:update', async (_, id, emp, userRole) => {
    const db = getDB();
    const existing = db.prepare('SELECT id, salary, fixed_gross_salary, name FROM employees WHERE id = ?').get(id);
    if (!existing) return { success: false, error: 'Employee not found.' };

    // RBAC: HR cannot edit salary fields unless hr_edit_salary is enabled
    let finalSalary = emp.salary;
    let finalFixedGross = emp.fixedGrossSalary;
    
    if (userRole === 'hr') {
      const hrEditSalarySetting = db.prepare("SELECT value FROM settings WHERE key = 'hr_edit_salary'").get();
      if (!hrEditSalarySetting || hrEditSalarySetting.value !== '1') {
        finalSalary = existing.salary; // Force use existing value
        finalFixedGross = existing.fixed_gross_salary;
      }
    }

    db.prepare(`
      UPDATE employees
      SET name = ?, phone = ?, role = ?, salary = ?, fixed_gross_salary = ?, joining_date = ?,
          status = ?, notes = ?,
          aadhaar_no = ?, pan_no = ?, dob = ?, gender = ?, address = ?,
          bank_name = ?, account_no = ?, ifsc_code = ?, account_holder_name = ?, father_name = ?,
          updated_at = strftime('%s', 'now')
      WHERE id = ?
    `).run(
      emp.name.trim(),
      emp.phone                || null,
      emp.role                 || null,
      finalSalary,
      finalFixedGross,
      emp.joiningDate          || null,
      emp.status               || 'active',
      emp.notes                || null,
      emp.aadhaar_no           || null,
      emp.pan_no               || null,
      emp.dob                  || null,
      emp.gender               || null,
      emp.address              || null,
      emp.bank_name            || null,
      emp.account_no           || null,
      emp.ifsc_code            || null,
      emp.account_holder_name  || null,
      emp.father_name          || null,
      id
    );
    logActivity('Employees', 'Updated', `Updated details for ${existing.name}`, null, `Role: ${emp.role}, Status: ${emp.status}`);
    return { success: true };
  });

  // ── Delete Employee ────────────────────────────────────────────────────────
  ipcMain.handle('employees:delete', async (_, id, userRole) => {
    const db = getDB();
    const hrDeleteAccessSetting = db.prepare("SELECT value FROM settings WHERE key = 'hr_delete_access'").get();
    const canDelete = userRole === 'admin' || (userRole === 'hr' && hrDeleteAccessSetting && hrDeleteAccessSetting.value === '1');
    if (!canDelete) return { success: false, error: 'Unauthorized: Only Administrators (or HR with delete permissions) can permanently delete employees.' };
    const existing = db.prepare('SELECT name FROM employees WHERE id = ?').get(id);
    if (!existing) return { success: false, error: 'Employee not found.' };

    db.prepare('DELETE FROM employees WHERE id = ?').run(id);
    logActivity('Employees', 'Deleted', `Deleted employee: ${existing.name}`);
    return { success: true };
  });

};
