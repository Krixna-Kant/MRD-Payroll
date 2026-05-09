const { ipcMain, dialog, shell, app } = require('electron');
const path = require('path');
const fs = require('fs');
const { getDB } = require('../database/db');
const ExcelJS = require('exceljs');
const { createWorker } = require('tesseract.js');

module.exports = (ipcMain) => {
  const db = getDB();
  const docsDir = path.join(app.getPath('userData'), 'StaffDocuments');

  // Ensure base directory exists
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  // ─── List documents for an employee ───────────────────────────────────────
  ipcMain.handle('staffDocs:getAll', async (event, { employeeId }) => {
    try {
      let query = `
        SELECT sd.*, e.name as employee_name 
        FROM staff_documents sd
        JOIN employees e ON sd.employee_id = e.id
      `;
      let params = [];

      if (employeeId) {
        query += ` WHERE sd.employee_id = ?`;
        params.push(employeeId);
      }

      query += ` ORDER BY sd.upload_date DESC`;
      const docs = db.prepare(query).all(...params);
      
      return { success: true, docs };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Upload document ───────────────────────────────────────────────────────
  ipcMain.handle('staffDocs:upload', async (event, { employeeId, category, docType, filePath, expiryDate }) => {
    try {
      const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(employeeId);
      if (!emp) throw new Error('Employee not found');

      const safeName = emp.name.replace(/[^a-z0-9]/gi, '_');
      const empDir = path.join(docsDir, `${safeName}_${employeeId}`);
      
      if (!fs.existsSync(empDir)) {
        fs.mkdirSync(empDir, { recursive: true });
      }

      const ext = path.extname(filePath);
      const fileName = `${docType.replace(/[^a-z0-9]/gi, '_')}${ext}`;
      const destPath = path.join(empDir, fileName);

      // Copy file
      fs.copyFileSync(filePath, destPath);

      const stats = fs.statSync(destPath);
      const today = new Date().toISOString().split('T')[0];

      const stmt = db.prepare(`
        INSERT INTO staff_documents (
          employee_id, document_name, document_type, category, 
          file_path, file_size, upload_date, expiry_date, ocr_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        employeeId, fileName, docType, category,
        destPath, stats.size, today, expiryDate || null, 'pending'
      );

      // Audit Log
      const { logActivity } = require('../utils/audit');
      logActivity('Documents', 'Uploaded', `Uploaded ${docType} for ${emp.name}`, null, `File: ${fileName}`);

      return { success: true, docId: result.lastInsertRowid };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Delete document ───────────────────────────────────────────────────────
  ipcMain.handle('staffDocs:delete', async (event, docId) => {
    try {
      const doc = db.prepare('SELECT sd.*, e.name as employee_name FROM staff_documents sd JOIN employees e ON e.id = sd.employee_id WHERE sd.id = ?').get(docId);
      if (doc && fs.existsSync(doc.file_path)) {
        fs.unlinkSync(doc.file_path);
      }
      db.prepare('DELETE FROM staff_documents WHERE id = ?').run(docId);

      // Audit Log
      if (doc) {
        const { logActivity } = require('../utils/audit');
        logActivity('Documents', 'Deleted', `Deleted ${doc.document_type} for ${doc.employee_name}`, `File: ${doc.document_name}`, null);
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Preview / Open ────────────────────────────────────────────────────────
  ipcMain.handle('staffDocs:preview', async (event, docId) => {
    try {
      const doc = db.prepare('SELECT file_path FROM staff_documents WHERE id = ?').get(docId);
      if (!doc || !fs.existsSync(doc.file_path)) throw new Error('File not found');
      
      // For images/PDFs, we can return the file protocol URL or just open it
      // The renderer will use the path to display in <img> or <iframe>
      return { success: true, filePath: doc.file_path };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── OCR Processing ────────────────────────────────────────────────────────
  ipcMain.handle('staffDocs:runOcr', async (event, docId) => {
    let worker = null;
    try {
      const doc = db.prepare('SELECT * FROM staff_documents WHERE id = ?').get(docId);
      if (!doc || !fs.existsSync(doc.file_path)) throw new Error('File not found');

      // Update status to processing
      db.prepare("UPDATE staff_documents SET ocr_status = 'processing' WHERE id = ?").run(docId);

      // Images only for now (Tesseract supports some PDFs but it's complex)
      const ext = path.extname(doc.file_path).toLowerCase();
      if (ext === '.pdf') {
        throw new Error('OCR for PDF not supported yet. Please upload an image.');
      }

      worker = await createWorker('eng'); // Default to English, can add 'hin' if needed
      const { data: { text } } = await worker.recognize(doc.file_path);
      
      // Simple extraction logic (can be refined with Regex for Aadhaar/PAN)
      const extracted = parseOcrText(text, doc.document_type);
      
      db.prepare("UPDATE staff_documents SET ocr_status = 'completed', ocr_data = ? WHERE id = ?")
        .run(JSON.stringify(extracted), docId);

      await worker.terminate();
      return { success: true, extracted };
    } catch (err) {
      if (worker) await worker.terminate();
      db.prepare("UPDATE staff_documents SET ocr_status = 'failed' WHERE id = ?").run(docId);
      return { success: false, error: err.message };
    }
  });

  // ─── Manual Data Update ────────────────────────────────────────────────────
  ipcMain.handle('staffDocs:updateOcrData', async (event, { docId, ocrData }) => {
    try {
      db.prepare("UPDATE staff_documents SET ocr_data = ?, ocr_status = 'completed' WHERE id = ?")
        .run(JSON.stringify(ocrData), docId);
        
      // Audit Log
      const { logActivity } = require('../utils/audit');
      const doc = db.prepare('SELECT document_type, employee_id FROM staff_documents WHERE id = ?').get(docId);
      const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(doc.employee_id);
      logActivity('Documents', 'OCR Updated', `Manually updated OCR for ${doc.document_type} of ${emp?.name}`, null, `Doc ID: ${docId}`);

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Map OCR Data to Employee ──────────────────────────────────────────────
  ipcMain.handle('staffDocs:mapToProfile', async (event, { employeeId, data }) => {
    try {
      const fields = [];
      const values = [];
      
      // Filter out empty values
      for (const [key, val] of Object.entries(data)) {
        if (val) {
          fields.push(`${key} = ?`);
          values.push(val);
        }
      }

      if (fields.length === 0) return { success: true };

      values.push(employeeId);
      db.prepare(`UPDATE employees SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Export OCR Data to Excel ──────────────────────────────────────────────
  ipcMain.handle('staffDocs:exportOcrExcel', async (event) => {
    try {
      const { filePath } = await dialog.showSaveDialog({
        title: 'Export Staff Documents Data',
        defaultPath: path.join(app.getPath('downloads'), 'Staff_Documents_Data.xlsx'),
        filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
      });

      if (!filePath) return { success: false, error: 'Cancelled.' };

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Staff OCR Data');

      sheet.columns = [
        { header: 'Employee Name', key: 'name', width: 25 },
        { header: 'Aadhaar Number', key: 'aadhaar_no', width: 20 },
        { header: 'PAN Number', key: 'pan_no', width: 20 },
        { header: 'DOB', key: 'dob', width: 15 },
        { header: 'Bank Name', key: 'bank_name', width: 20 },
        { header: 'Account Number', key: 'account_no', width: 20 },
        { header: 'IFSC', key: 'ifsc_code', width: 15 },
        { header: 'Upload Date', key: 'upload_date', width: 15 }
      ];

      // Styling
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      const rows = db.prepare(`
        SELECT e.name, e.aadhaar_no, e.pan_no, e.dob, e.bank_name, e.account_no, e.ifsc_code,
               (SELECT MAX(upload_date) FROM staff_documents WHERE employee_id = e.id) as upload_date
        FROM employees e
        WHERE e.id IN (SELECT DISTINCT employee_id FROM staff_documents)
      `).all();

      sheet.addRows(rows);

      // Add borders
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      });

      await workbook.xlsx.writeFile(filePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Helper: Parse OCR Text ────────────────────────────────────────────────
  function parseOcrText(text, docType) {
    const data = {};
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    if (docType === 'Aadhaar Card') {
      // Aadhaar: 12 digits XXXX XXXX XXXX
      const aadhaarMatch = text.match(/\d{4}\s\d{4}\s\d{4}/);
      if (aadhaarMatch) data.aadhaar_no = aadhaarMatch[0];
      
      // DOB: DD/MM/YYYY
      const dobMatch = text.match(/\d{2}\/\d{2}\/\d{4}/);
      if (dobMatch) data.dob = dobMatch[0];

      // Gender
      if (text.toLowerCase().includes('male')) data.gender = 'Male';
      else if (text.toLowerCase().includes('female')) data.gender = 'Female';
    } 
    else if (docType === 'PAN Card') {
      // PAN: 10 chars, 5 letters, 4 digits, 1 letter
      const panMatch = text.match(/[A-Z]{5}\d{4}[A-Z]{1}/i);
      if (panMatch) data.pan_no = panMatch[0].toUpperCase();
    }
    else if (docType === 'Passbook' || docType === 'Cancelled Cheque') {
      // Account Number (usually 9-18 digits)
      const accMatch = text.match(/\d{9,18}/);
      if (accMatch) data.account_no = accMatch[0];

      // IFSC (4 letters, 0, 6 alphanumeric)
      const ifscMatch = text.match(/[A-Z]{4}0[A-Z0-9]{6}/i);
      if (ifscMatch) data.ifsc_code = ifscMatch[0].toUpperCase();
    }

    // Try to find a name (usually top lines, excluding common headers)
    // This is very rudimentary and often requires specific template matching
    // for better accuracy.
    return data;
  }
};
