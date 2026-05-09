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
    'Gross Salary (₹)', 'Food Allow. (₹)', 'Travel Allow. (₹)', 'Advance Deducted (₹)', 'Other Deductions (₹)',
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
    { key: 'gross',   width: 16 },
    { key: 'food',    width: 16 },
    { key: 'travel',  width: 16 },
    { key: 'advance', width: 18 },
    { key: 'others',  width: 18 },
    { key: 'net',     width: 16 },
    { key: 'mode',    width: 14 },
    { key: 'status',  width: 12 },
  ];

  // Data rows
  let totGross = 0, totFood = 0, totTravel = 0, totAdv = 0, totOther = 0, totNet = 0;
  payments.forEach((p, i) => {
    const row = ws.addRow([
      i + 1,
      p.employee_name,
      p.employee_role || '-',
      p.employee_phone || '-',
      rupees(p.gross_salary),
      rupees(p.food_allowance || 0),
      rupees(p.travel_allowance || 0),
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
    const statusCell = row.getCell(12);
    statusCell.fill  = fillColor(p.status === 'paid' ? '#10b981' : '#f59e0b');
    statusCell.font  = { bold: true, color: { argb: 'FFFFFFFF' } };
    statusCell.alignment = { horizontal: 'center' };

    // Right-align currency cells
    [5, 6, 7, 8, 9, 10].forEach(ci => {
      const c = row.getCell(ci);
      c.numFmt = '₹#,##0.00';
      c.alignment = { horizontal: 'right' };
    });

    totGross += p.gross_salary;
    totFood  += (p.food_allowance || 0);
    totTravel+= (p.travel_allowance || 0);
    totAdv   += p.advance_deducted;
    totOther += p.other_deductions;
    totNet   += p.net_paid;
  });

  // Totals row
  const totRow = ws.addRow([
    '', 'TOTAL', '', '',
    rupees(totGross), rupees(totFood), rupees(totTravel), rupees(totAdv), rupees(totOther), rupees(totNet),
    '', `${payments.length} employees`
  ]);
  totRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill  = fillColor('#6366f1');
  });
  [5, 6, 7, 8, 9, 10].forEach(ci => {
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

// ── Daily Attendance Excel ───────────────────────────────────────────────
async function generateDailyAttendanceExcel(records, date, outputPath) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LocalPayroll';

  const ws = wb.addWorksheet(`Attendance ${date}`);

  ws.mergeCells('A1:I1');
  const t1 = ws.getCell('A1');
  t1.value = `Daily Attendance Report — ${date}`;
  t1.font  = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  t1.fill  = fillColor('#6366f1');
  t1.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  const ph = ws.addRow(['#', 'Employee Name', 'Role', 'Project', 'Status', 'In Time', 'Out Time', 'OT (hrs)', 'Sunday?']);
  ph.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill  = fillColor('#1e1e2e');
    c.alignment = { horizontal: 'center' };
  });

  ws.columns = [
    { width: 6 }, { width: 22 }, { width: 14 }, { width: 14 }, 
    { width: 10 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 10 }
  ];

  records.forEach((r, i) => {
    const row = ws.addRow([
      i + 1,
      r.name,
      r.role || '-',
      r.project_name || '-',
      r.status || '-',
      r.check_in || '-',
      r.check_out || '-',
      r.overtime_hours || 0,
      r.is_sunday_work ? 'Yes' : 'No'
    ]);
    if (i % 2 === 0) row.eachCell(c => { c.fill = fillColor('#f9fafb'); });

    const sc = row.getCell(5);
    if(r.status === 'P') sc.fill = fillColor('#10b981'); // success
    else if(r.status === 'A') sc.fill = fillColor('#ef4444'); // danger
    else if(r.status === 'H') sc.fill = fillColor('#f59e0b'); // warning

    sc.font = { bold: true, color: { argb: r.status ? 'FFFFFFFF' : 'FF000000' } };
    sc.alignment = { horizontal: 'center' };
    row.getCell(6).alignment = { horizontal: 'center' };
    row.getCell(7).alignment = { horizontal: 'center' };
    row.getCell(8).alignment = { horizontal: 'center' };
    row.getCell(9).alignment = { horizontal: 'center' };
  });

  await wb.xlsx.writeFile(outputPath);
}

async function generateAttendanceRangeExcel(records, startDate, endDate, outputPath) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LocalPayroll';

  const ws = wb.addWorksheet('Attendance Report');

  ws.mergeCells('A1:J1');
  const t1 = ws.getCell('A1');
  t1.value = `Attendance Report — ${startDate} to ${endDate}`;
  t1.font  = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  t1.fill  = fillColor('#6366f1');
  t1.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  const ph = ws.addRow(['#', 'Date', 'Employee Name', 'Role', 'Project', 'Status', 'In Time', 'Out Time', 'OT (hrs)', 'Sunday?']);
  ph.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill  = fillColor('#1e1e2e');
    c.alignment = { horizontal: 'center' };
  });

  ws.columns = [
    { width: 6 }, { width: 14 }, { width: 22 }, { width: 14 }, { width: 14 }, 
    { width: 10 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 10 }
  ];

  records.forEach((r, i) => {
    // Skip if date is before joining date
    if (r.date && r.joining_date && r.date < r.joining_date) return;

    const row = ws.addRow([
      i + 1,
      r.date || '-',
      r.name,
      r.role || '-',
      r.project_name || '-',
      r.status || 'Not Marked',
      r.check_in || '-',
      r.check_out || '-',
      r.overtime_hours || 0,
      r.is_sunday_work ? 'Yes' : 'No'
    ]);
    if (i % 2 === 0) row.eachCell(c => { c.fill = fillColor('#f9fafb'); });

    const sc = row.getCell(6);
    if(r.status === 'P') sc.fill = fillColor('#10b981'); // success
    else if(r.status === 'A') sc.fill = fillColor('#ef4444'); // danger
    else if(r.status === 'H') sc.fill = fillColor('#f59e0b'); // warning

    sc.font = { bold: true, color: { argb: r.status ? 'FFFFFFFF' : 'FF000000' } };
    sc.alignment = { horizontal: 'center' };
    [2, 6, 7, 8, 9, 10].forEach(ci => {
       row.getCell(ci).alignment = { horizontal: 'center' };
    });
  });

  await wb.xlsx.writeFile(outputPath);
}

// ── Monthly Attendance Register (Grid Layout) ──────────────────────────────
async function generateAttendanceRegisterExcel(data, month, year, outputPath) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LocalPayroll';
  const ws = wb.addWorksheet(`Register ${MONTHS[month - 1]} ${year}`);

  // Freeze first 2 columns and first 2 rows
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];

  const daysInMonth = new Date(year, month, 0).getDate();
  const dateColumns = [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month - 1, d);
    dateColumns.push({
      day: dayNames[dateObj.getDay()],
      dateStr: String(d).padStart(2, '0'),
      isSun: dateObj.getDay() === 0,
      fullDate: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    });
  }

  // Row 1: Day Headers
  const row1 = ['EMP. Name', 'Designation'];
  dateColumns.forEach(c => row1.push(c.day));
  row1.push('Total Days', 'Present', 'WO', 'HD', 'Absent', 'Half', 'Total', 'Total OT');

  // Row 2: Date Headers
  const row2 = ['', ''];
  dateColumns.forEach(c => row2.push(c.dateStr));
  row2.push('', '', '', '', '', '', '', '');

  const hr1 = ws.addRow(row1);
  const hr2 = ws.addRow(row2);

  // Merge headers for fixed columns and summary columns
  ws.mergeCells('A1:A2'); // EMP. Name
  ws.mergeCells('B1:B2'); // Designation
  
  const sumStartCol = 2 + daysInMonth + 1; // 1-indexed
  for (let i = 0; i < 8; i++) {
    const colLetter = ws.getColumn(sumStartCol + i).letter;
    ws.mergeCells(`${colLetter}1:${colLetter}2`);
  }

  // Header Styling
  [hr1, hr2].forEach(row => {
    row.eachCell((cell, colNumber) => {
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' }
      };
      
      // Default header background: yellow
      cell.fill = fillColor('#facc15'); 

      // If this column is a Sunday date column, make it red with white text
      if (colNumber > 2 && colNumber <= 2 + daysInMonth) {
        const dateColIndex = colNumber - 3;
        if (dateColumns[dateColIndex].isSun) {
          cell.fill = fillColor('#dc2626');
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        }
      }
    });
  });

  // Set Column Widths
  ws.getColumn(1).width = 20;
  ws.getColumn(2).width = 15;
  for (let i = 1; i <= daysInMonth; i++) {
    ws.getColumn(2 + i).width = 8;
  }
  for (let i = 0; i < 8; i++) {
    ws.getColumn(sumStartCol + i).width = 10;
  }

  // Group records by employee
  const recordMap = {};
  data.records.forEach(r => {
    if (!recordMap[r.employee_id]) recordMap[r.employee_id] = {};
    recordMap[r.employee_id][r.date] = r;
  });

  // Add Data Rows
  data.employees.forEach(emp => {
    const empData = recordMap[emp.id] || {};
    
    const row1 = [emp.name, emp.role || ''];
    const row2 = ['', 'Project'];
    const row3 = ['', 'OT (Hrs)'];

    let pCount = 0, aCount = 0, hCount = 0, woCount = 0, totalOt = 0;

    dateColumns.forEach(c => {
      let rData = empData[c.fullDate];
      let status = rData ? rData.status : '';
      let proj = rData && rData.project_name ? rData.project_name : '';
      let ot = rData && rData.overtime_hours > 0 ? rData.overtime_hours : '';
      
      row1.push(status);
      row2.push(proj);
      row3.push(ot);
      
      if (status === 'P') pCount++;
      else if (status === 'A') aCount++;
      else if (status === 'H') hCount++;
      else if (status === 'WO') woCount++;
      
      if (rData && rData.overtime_hours > 0) totalOt += rData.overtime_hours;
    });

    const totalPayable = pCount + woCount + (hCount * 0.5);
    
    // Add summaries
    row1.push(daysInMonth, pCount, woCount, hCount, aCount, 0, totalPayable, totalOt);
    
    for(let i=0; i<8; i++) {
        row2.push('');
        row3.push('');
    }

    const r1 = ws.addRow(row1);
    const r2 = ws.addRow(row2);
    const r3 = ws.addRow(row3);
    
    // Merge EMP. Name and summaries vertically
    ws.mergeCells(r1.number, 1, r3.number, 1);
    
    for (let i = 0; i < 8; i++) {
        ws.mergeCells(r1.number, sumStartCol + i, r3.number, sumStartCol + i);
    }
    
    // Style Data Rows
    [r1, r2, r3].forEach((row, idx) => {
      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin' }, left: { style: 'thin' },
          bottom: { style: 'thin' }, right: { style: 'thin' }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        
        if (colNumber > 2 && colNumber <= 2 + daysInMonth) {
          const isSun = dateColumns[colNumber - 3].isSun;
          if (isSun) {
            cell.fill = fillColor('#dc2626');
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          } else if (idx === 0) { // Only style status on the first row
            const val = cell.value;
            if (val === 'P') {
              cell.fill = fillColor('#dcfce7'); // Light Green
              cell.font = { color: { argb: 'FF166534' } }; // Dark Green
            } else if (val === 'A') {
              cell.fill = fillColor('#fee2e2'); // Light Red
              cell.font = { color: { argb: 'FF991b1b' } }; // Dark Red
            } else if (val === 'H') {
              cell.fill = fillColor('#fef9c3'); // Light Yellow
              cell.font = { color: { argb: 'FF854d0e' } }; // Dark Yellow
            } else if (val === 'WO') {
              cell.fill = fillColor('#dc2626'); // Red
              cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            }
          } else if (idx === 1) {
            // Project row font size slightly smaller
            cell.font = { size: 10 };
          }
        }
      });
    });
    
    // Left-align name
    r1.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    
    // Sub-row label styling
    r2.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };
    r2.getCell(2).font = { italic: true, color: { argb: 'FF666666' } };
    r3.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };
    r3.getCell(2).font = { italic: true, color: { argb: 'FF666666' } };
  });

  await wb.xlsx.writeFile(outputPath);
}

// ── Project Cost & Profitability Excel ──────────────────────────────────────
async function generateProjectCostExcel(project, expenses, attendance, outputPath) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LocalPayroll';
  const ws = wb.addWorksheet('Project Report');

  ws.mergeCells('A1:E1');
  const t1 = ws.getCell('A1');
  t1.value = `Project Cost & Profitability Report — ${project.name}`;
  t1.font  = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  t1.fill  = fillColor('#6366f1');
  t1.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  ws.addRow([]);
  ws.addRow(['Client Name', project.client_name || 'N/A']);
  ws.addRow(['Project Code', project.code || 'N/A']);
  ws.addRow(['Status', project.status]);
  ws.addRow(['Expected Revenue (₹)', rupees(project.revenue || 0)]);
  ws.addRow([]);

  ws.addRow(['Expense Category', 'Amount (₹)', 'Date', 'Remarks', 'Status']);
  ws.getRow(8).font = { bold: true };
  let totExp = 0;
  expenses.forEach(e => {
    ws.addRow([e.category, rupees(e.amount), e.date, e.remarks || '-', e.status]);
    if (e.status === 'approved') totExp += e.amount;
  });
  ws.addRow(['TOTAL APPROVED EXPENSES', rupees(totExp), '', '', '']).font = { bold: true };
  
  ws.addRow([]);
  ws.addRow(['Labor / Manpower Summary']);
  ws.getRow(ws.rowCount).font = { bold: true };
  ws.addRow(['Date', 'Employee', 'Role', 'Status', 'OT (hrs)']);
  ws.getRow(ws.rowCount).font = { bold: true };

  attendance.forEach(a => {
    ws.addRow([a.date, a.name, a.role || '-', a.status || '-', a.overtime_hours || 0]);
  });

  ws.columns = [
    { width: 20 }, { width: 20 }, { width: 15 }, { width: 20 }, { width: 15 }
  ];

  await wb.xlsx.writeFile(outputPath);
}

module.exports = { 
  generateMonthlyExcel, 
  generateEmployeeExcel, 
  generateDailyAttendanceExcel,
  generateAttendanceRangeExcel,
  generateAttendanceRegisterExcel,
  generateProjectCostExcel
};
