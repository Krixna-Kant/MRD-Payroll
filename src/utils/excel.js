/**
 * LocalPayroll - Excel Utility
 * Generates formatted .xlsx reports using exceljs.
 * All amounts come in as PAISA — converted to ₹ for display.
 */

const ExcelJS = require('exceljs');

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

function rupees(paisa) {
  return paisa / 100;
}

function fillColor(hex) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: hex.replace('#','FF') } };
}

// ── Monthly Salary Report Excel ───────────────────────────────────────────────
async function generateMonthlyExcel(payments, month, year, outputPath) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LocalPayroll';

  const ws = wb.addWorksheet(`${MONTHS[month - 1]} ${year}`);

  // Title row
  ws.mergeCells('A1:I1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `Monthly Salary Report — ${MONTHS[month - 1]} ${year}`;
  titleCell.font  = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill  = fillColor('#6366f1');
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 36;

  // Header row
  const headers = [
    '#', 'Employee Name', 'Role/Designation', 'Phone',
    'Gross Salary (₹)', 'Advance Deducted (₹)', 'Other Deductions (₹)',
    'Net Paid (₹)', 'Payment Mode', 'Status'
  ];
  const headerRow = ws.addRow(headers);
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = fillColor('#1e1e2e');
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF6366f1' } } };
  });
  ws.getRow(2).height = 24;

  // Column widths
  ws.columns = [
    { key: 'idx',     width: 5  },
    { key: 'name',    width: 22 },
    { key: 'role',    width: 18 },
    { key: 'phone',   width: 14 },
    { key: 'gross',   width: 18 },
    { key: 'advance', width: 20 },
    { key: 'others',  width: 20 },
    { key: 'net',     width: 16 },
    { key: 'mode',    width: 14 },
    { key: 'status',  width: 12 },
  ];

  // Data rows
  let totGross = 0, totAdv = 0, totOther = 0, totNet = 0;
  payments.forEach((p, i) => {
    const row = ws.addRow([
      i + 1,
      p.employee_name,
      p.employee_role || '-',
      p.employee_phone || '-',
      rupees(p.gross_salary),
      rupees(p.advance_deducted),
      rupees(p.other_deductions),
      rupees(p.net_paid),
      p.mode,
      p.status.toUpperCase(),
    ]);

    if (i % 2 === 0) {
      row.eachCell(cell => { cell.fill = fillColor('#f9fafb'); });
    }

    // Color status cell
    const statusCell = row.getCell(10);
    statusCell.fill  = fillColor(p.status === 'paid' ? '#10b981' : '#f59e0b');
    statusCell.font  = { bold: true, color: { argb: 'FFFFFFFF' } };
    statusCell.alignment = { horizontal: 'center' };

    // Right-align currency cells
    [5, 6, 7, 8].forEach(ci => {
      const c = row.getCell(ci);
      c.numFmt = '₹#,##0.00';
      c.alignment = { horizontal: 'right' };
    });

    totGross += p.gross_salary;
    totAdv   += p.advance_deducted;
    totOther += p.other_deductions;
    totNet   += p.net_paid;
  });

  // Totals row
  const totRow = ws.addRow([
    '', 'TOTAL', '', '',
    rupees(totGross), rupees(totAdv), rupees(totOther), rupees(totNet),
    '', `${payments.length} employees`
  ]);
  totRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill  = fillColor('#6366f1');
  });
  [5, 6, 7, 8].forEach(ci => {
    totRow.getCell(ci).numFmt = '₹#,##0.00';
    totRow.getCell(ci).alignment = { horizontal: 'right' };
  });
  ws.getRow(ws.rowCount).height = 24;

  await wb.xlsx.writeFile(outputPath);
}

// ── Employee Detail Excel (payment history + advance history) ─────────────────
async function generateEmployeeExcel(employee, payments, advances, outputPath) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LocalPayroll';

  // ─ Sheet 1: Payment History ─────────────────────────────────────────────────
  const ws1 = wb.addWorksheet('Payment History');

  ws1.mergeCells('A1:G1');
  const t1 = ws1.getCell('A1');
  t1.value = `Payment History — ${employee.name}`;
  t1.font  = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  t1.fill  = fillColor('#6366f1');
  t1.alignment = { horizontal: 'center', vertical: 'middle' };
  ws1.getRow(1).height = 30;

  const ph = ws1.addRow(['Month', 'Year', 'Gross (₹)', 'Advance (₹)', 'Net Paid (₹)', 'Mode', 'Status']);
  ph.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill  = fillColor('#1e1e2e');
    c.alignment = { horizontal: 'center' };
  });

  ws1.columns = [
    { width: 12 }, { width: 8 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 12 }
  ];

  payments.forEach((p, i) => {
    const row = ws1.addRow([
      MONTHS[p.month - 1], p.year,
      rupees(p.gross_salary), rupees(p.advance_deducted), rupees(p.net_paid),
      p.mode, p.status.toUpperCase()
    ]);
    if (i % 2 === 0) row.eachCell(c => { c.fill = fillColor('#f9fafb'); });
    [3, 4, 5].forEach(ci => { row.getCell(ci).numFmt = '₹#,##0.00'; row.getCell(ci).alignment = { horizontal: 'right' }; });
    const sc = row.getCell(7);
    sc.fill = fillColor(p.status === 'paid' ? '#10b981' : '#f59e0b');
    sc.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sc.alignment = { horizontal: 'center' };
  });

  // ─ Sheet 2: Advance History ──────────────────────────────────────────────────
  const ws2 = wb.addWorksheet('Advance History');
  ws2.mergeCells('A1:E1');
  const t2 = ws2.getCell('A1');
  t2.value = `Advance History — ${employee.name}`;
  t2.font  = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  t2.fill  = fillColor('#6366f1');
  t2.alignment = { horizontal: 'center', vertical: 'middle' };
  ws2.getRow(1).height = 30;

  const ah = ws2.addRow(['Date', 'Amount (₹)', 'Mode', 'Month', 'Notes']);
  ah.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill  = fillColor('#1e1e2e');
    c.alignment = { horizontal: 'center' };
  });
  ws2.columns = [{ width: 14 }, { width: 16 }, { width: 12 }, { width: 14 }, { width: 30 }];

  advances.forEach((a, i) => {
    const row = ws2.addRow([
      a.date, rupees(a.amount), a.mode,
      a.month ? `${MONTHS[a.month - 1]} ${a.year}` : '-',
      a.notes || '-'
    ]);
    if (i % 2 === 0) row.eachCell(c => { c.fill = fillColor('#f9fafb'); });
    row.getCell(2).numFmt = '₹#,##0.00';
    row.getCell(2).alignment = { horizontal: 'right' };
  });

  await wb.xlsx.writeFile(outputPath);
}

module.exports = { generateMonthlyExcel, generateEmployeeExcel };
