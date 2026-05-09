/**
 * LocalPayroll - PDF Utility
 * Generates professional payslips and monthly reports using pdfkit.
 * All amounts come in as PAISA — we convert to ₹ only here for display.
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');

/** Convert paisa integer to formatted ₹ string */
function formatRupees(paisa) {
  const rupees = paisa / 100;
  return 'Rs. ' + rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Colors ────────────────────────────────────────────────────────────────────
const C = {
  primary:  '#6366f1',
  dark:     '#1e1e2e',
  gray:     '#6b7280',
  lightGray:'#f3f4f6',
  white:    '#ffffff',
  success:  '#10b981',
  danger:   '#f43f5e',
  text:     '#111827',
};

/**
 * Generate a single-page payslip PDF for an employee.
 */
async function generatePayslipPdf(payment, companyName, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const W = doc.page.width - 100; // usable width

    // ── Header Bar ────────────────────────────────────────────────────────────
    doc.rect(50, 50, W, 70).fill(C.primary);
    doc.fillColor(C.white).fontSize(22).font('Helvetica-Bold')
       .text(companyName, 70, 68);
    doc.fontSize(10).font('Helvetica')
       .text('SALARY SLIP', 70, 94);

    // Period (right-aligned)
    const periodStr = `${MONTHS[payment.month - 1]} ${payment.year}`;
    doc.fontSize(14).font('Helvetica-Bold')
       .text(periodStr, 0, 78, { align: 'right' });

    doc.moveDown(2);

    // ── Employee Info Box ─────────────────────────────────────────────────────
    const infoY = 140;
    doc.rect(50, infoY, W, 80).fill(C.lightGray);
    doc.fillColor(C.text).fontSize(12).font('Helvetica-Bold')
       .text(payment.employee_name, 70, infoY + 14);
    doc.fontSize(10).font('Helvetica').fillColor(C.gray)
       .text(`Designation: ${payment.employee_role || 'N/A'}`, 70, infoY + 32)
       .text(`Phone: ${payment.employee_phone || 'N/A'}`,       70, infoY + 48)
       .text(`Payment Date: ${payment.payment_date || 'N/A'}`,  70, infoY + 64);

    doc.fontSize(10).font('Helvetica').fillColor(C.gray)
       .text(`Payment Mode: ${payment.mode}`, 350, infoY + 32)
       .text(`Status: ${payment.status.toUpperCase()}`,          350, infoY + 48);

    // ── Earnings Table ────────────────────────────────────────────────────────
    const tableY = infoY + 100;
    drawTableHeader(doc, 50, tableY, W, 'EARNINGS & DEDUCTIONS');

    const rows = [
      ['Base Monthly Salary',         formatRupees(payment.gross_salary)],
      ['Attendance (P / H / WO)',     `${payment.present_days || 0} / ${payment.half_days || 0} / ${payment.wo_days || 0}`],
      ['Absent (A)',                  `${payment.absent_days || 0} days`],
      ['Total Effective Days',        `${payment.attendance_days} / ${payment.total_days}`],
      ['Effective Salary',            formatRupees(payment.effective_salary)],
      ['(+) Overtime Amount',         `${formatRupees(payment.overtime_pay || 0)} (${payment.overtime_hours || 0} hrs)`],
      ['(+) Food Allowance',          formatRupees(payment.food_allowance || 0)],
      ['(+) Travel Allowance',        formatRupees(payment.travel_allowance || 0)],
      ['(-) Advance Deducted',       formatRupees(payment.advance_deducted)],
      ['(-) Other Deductions',       formatRupees(payment.other_deductions)],
    ];

    let rowY = tableY + 30;
    rows.forEach((row, i) => {
      if (i % 2 === 0) doc.rect(50, rowY, W, 22).fill('#f9fafb');
      doc.fillColor(C.text).fontSize(10).font('Helvetica')
         .text(row[0], 70, rowY + 6)
         .text(row[1], 0, rowY + 6, { align: 'right' });
      rowY += 22;
    });

    // LEDGER-BASED SUMMARY LOGIC
    const salaryEarned   = payment.salary_earned || 0;
    const openingBalance = payment.opening_balance || 0;
    const otherDed       = payment.other_deductions || 0;
    const netPaid        = payment.net_paid || 0;
    const netPayable     = Math.max(0, openingBalance + salaryEarned - otherDed);
    const closingBalance = openingBalance + salaryEarned - otherDed - netPaid;

    const summaryY = rowY + 15;

    // Box for summary
    doc.rect(50, summaryY, W, 94).fill('#f8fafc');
    doc.rect(50, summaryY, W, 94).lineWidth(0.5).stroke(C.lightGray);

    const drawRow = (label, val, yOff, color = C.text, isBold = false) => {
      doc.fillColor(color).fontSize(10).font(isBold ? 'Helvetica-Bold' : 'Helvetica')
         .text(label, 70, summaryY + yOff)
         .text(formatRupees(val), 50, summaryY + yOff, { align: 'right', width: W - 20 });
    };

    drawRow('OPENING BALANCE',      openingBalance,         12, openingBalance < 0 ? C.danger : (openingBalance > 0 ? C.success : C.gray));
    drawRow('TOTAL SALARY EARNED',  salaryEarned,           28);
    drawRow('OTHER DEDUCTIONS',     otherDed,               44, otherDed > 0 ? C.danger : C.gray);
    
    doc.rect(70, summaryY + 58, W - 40, 0.5).fill(C.lightGray);

    drawRow('NET PAYABLE',          netPayable,             62, C.text, true);
    drawRow('TOTAL PAID SALARY',    netPaid,                78, C.primary, true);

    // Closing balance indicator at the bottom
    const cbLabel = closingBalance < 0 ? 'CLOSING BALANCE (ADVANCE)' : (closingBalance > 0 ? 'CLOSING BALANCE (PENDING)' : 'CLOSING BALANCE (SETTLED)');
    const cbColor = closingBalance < 0 ? C.danger : (closingBalance > 0 ? C.success : C.gray);
    
    doc.fillColor(cbColor).fontSize(10).font('Helvetica-Bold')
       .text(cbLabel, 70, summaryY + 104)
       .text(formatRupees(Math.abs(closingBalance)), 50, summaryY + 104, { align: 'right', width: W - 20 });

    const finalFooterY = summaryY + 140;

    // ── Footer ────────────────────────────────────────────────────────────────
    doc.fillColor(C.gray).fontSize(8).font('Helvetica')
       .text('This is a computer-generated payslip and does not require a signature.', 50, finalFooterY, { align: 'center', width: W });

    if (payment.notes) {
      doc.fillColor(C.gray).fontSize(9)
         .text(`Notes: ${payment.notes}`, 50, finalFooterY + 20);
    }

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

function drawTableHeader(doc, x, y, w, title) {
  doc.rect(x, y, w, 26).fill(C.dark);
  doc.fillColor(C.white).fontSize(10).font('Helvetica-Bold')
     .text(title, x + 20, y + 8);
}

/**
 * Generate a monthly salary report PDF (all employees).
 */
async function generateMonthlyReportPdf(payments, month, year, companyName, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const W = doc.page.width - 80;

    // Header
    doc.rect(40, 40, W, 60).fill(C.primary);
    doc.fillColor(C.white).fontSize(18).font('Helvetica-Bold')
       .text(`${companyName} — Monthly Salary Report`, 60, 55);
    doc.fontSize(11).font('Helvetica')
       .text(`${MONTHS[month - 1]} ${year}`, 60, 78);

    // Table headers
    const cols = [
      { label: 'Employee',      x: 40,  w: 140 },
      { label: 'Earned',        x: 185, w: 90  },
      { label: 'Opening Bal',   x: 280, w: 90  },
      { label: 'Net Payable',   x: 375, w: 95  },
      { label: 'Paid Amount',   x: 475, w: 95  },
      { label: 'Closing Bal',   x: 575, w: 95  },
      { label: 'Mode',          x: 675, w: 55  },
      { label: 'Status',        x: 735, w: 55  },
    ];

    let rowY = 120;
    doc.rect(40, rowY, W, 22).fill(C.dark);
    cols.forEach(col => {
      doc.fillColor(C.white).fontSize(8.5).font('Helvetica-Bold')
         .text(col.label, col.x + 4, rowY + 7, { width: col.w - 4 });
    });

    rowY += 22;
    let totalEarned = 0, totalOpening = 0, totalNetPayable = 0, totalPaid = 0, totalClosing = 0;

    payments.forEach((p, i) => {
      const earned   = p.salary_earned || 0;
      const opening  = p.opening_balance || 0;
      const otherDed = p.other_deductions || 0;
      const paid     = p.net_paid || 0;
      const netPayable = Math.max(0, opening + earned - otherDed);
      const closing    = opening + earned - otherDed - paid;

      if (i % 2 === 0) doc.rect(40, rowY, W, 20).fill('#f9fafb');
      
      const vals = [
        p.employee_name,
        formatRupees(earned),
        formatRupees(opening),
        formatRupees(netPayable),
        formatRupees(paid),
        formatRupees(closing),
        p.mode,
        p.status.toUpperCase(),
      ];

      cols.forEach((col, ci) => {
        let color = C.text;
        if (ci === 2) color = opening < 0 ? C.danger : (opening > 0 ? C.success : C.text);
        if (ci === 5) color = closing < 0 ? C.danger : (closing > 0 ? C.success : C.text);

        doc.fillColor(color).fontSize(8.5).font('Helvetica')
           .text(vals[ci], col.x + 4, rowY + 5, { width: col.w - 4 });
      });

      totalEarned     += earned;
      totalOpening    += opening;
      totalNetPayable += netPayable;
      totalPaid       += paid;
      totalClosing    += closing;

      rowY += 20;

      // New page if needed
      if (rowY > doc.page.height - 80) {
        doc.addPage({ layout: 'landscape' });
        rowY = 40;
      }
    });

    // Totals row
    rowY += 6;
    doc.rect(40, rowY, W, 26).fill(C.primary);
    doc.fillColor(C.white).fontSize(9).font('Helvetica-Bold')
       .text(`TOTALS`, 44, rowY + 8, { width: 140 })
       .text(formatRupees(totalEarned),     185, rowY + 8, { width: 90 })
       .text(formatRupees(totalOpening),    280, rowY + 8, { width: 90 })
       .text(formatRupees(totalNetPayable), 375, rowY + 8, { width: 95 })
       .text(formatRupees(totalPaid),       475, rowY + 8, { width: 95 })
       .text(formatRupees(totalClosing),    575, rowY + 8, { width: 95 });

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

/**
 * Generate an Attendance Register PDF (Grid Layout)
 */
async function generateAttendanceRegisterPdf(data, month, year, outputPath) {
  return new Promise((resolve, reject) => {
    // A3 landscape is ~1190 x 842 points
    const doc = new PDFDocument({ size: 'A3', layout: 'landscape', margin: 25 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const daysInMonth = new Date(year, month, 0).getDate();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Header section
    doc.fontSize(14).font('Helvetica-Bold')
       .text(`Attendance Register — ${MONTHS[month - 1]} ${year}`, 25, 25);
    
    // Grid settings
    let startY = 55;
    let currentY = startY;
    const rowHeight = 16;
    const headerHeight = 24; // 2 lines: Day and Date

    // Column widths
    const colName = 90;
    const colDesig = 60;
    const colDate = 25; // Wider for multi-line text
    const colSum = 22; // For Total Days, P, WO, HD, A, Half
    const colTotal = 35; // Total Payable
    const colTotalOT = 35; // Total OT

    // Compute total width
    const totalWidth = colName + colDesig + (daysInMonth * colDate) + (6 * colSum) + colTotal + colTotalOT;
    const startX = 25;

    // Draw Headers
    doc.rect(startX, currentY, totalWidth, headerHeight).fill('#facc15'); // Yellow bg for header
    doc.fillColor('#000000').fontSize(7).font('Helvetica-Bold');

    // Name & Desig
    doc.text('EMP. Name', startX + 2, currentY + 8, { width: colName, align: 'center' });
    doc.rect(startX, currentY, colName, headerHeight).stroke();
    
    doc.text('Designation', startX + colName + 2, currentY + 8, { width: colDesig, align: 'center' });
    doc.rect(startX + colName, currentY, colDesig, headerHeight).stroke();

    let curX = startX + colName + colDesig;

    const dateCols = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month - 1, d);
      const isSun = dateObj.getDay() === 0;
      const dayName = dayNames[dateObj.getDay()];
      
      dateCols.push({ dayName, d, isSun, x: curX });

      if (isSun) {
        doc.rect(curX, currentY, colDate, headerHeight).fill('#dc2626');
        doc.fillColor('#ffffff');
      } else {
        doc.fillColor('#000000');
      }

      // Draw day and date
      doc.fontSize(6).text(dayName, curX, currentY + 3, { width: colDate, align: 'center' });
      doc.fontSize(7).text(String(d).padStart(2, '0'), curX, currentY + 12, { width: colDate, align: 'center' });
      
      doc.rect(curX, currentY, colDate, headerHeight).stroke();
      curX += colDate;
    }

    doc.fillColor('#000000');

    // Summary Headers
    const sums = ['Total Days', 'Present', 'WO', 'HD', 'Absent', 'Half'];
    sums.forEach(s => {
      doc.fontSize(6).text(s, curX, currentY + 8, { width: colSum, align: 'center' });
      doc.rect(curX, currentY, colSum, headerHeight).stroke();
      curX += colSum;
    });

    // Total Payable
    doc.fontSize(7).text('Total', curX, currentY + 8, { width: colTotal, align: 'center' });
    doc.rect(curX, currentY, colTotal, headerHeight).stroke();
    curX += colTotal;

    // Total OT
    doc.fontSize(7).text('Total OT', curX, currentY + 8, { width: colTotalOT, align: 'center' });
    doc.rect(curX, currentY, colTotalOT, headerHeight).stroke();

    currentY += headerHeight;

    // Group records by employee
    const recordMap = {};
    data.records.forEach(r => {
      if (!recordMap[r.employee_id]) recordMap[r.employee_id] = {};
      recordMap[r.employee_id][r.date] = r;
    });

    doc.lineWidth(0.5);

    data.employees.forEach((emp, i) => {
      if (currentY + rowHeight > doc.page.height - 25) {
        doc.addPage({ layout: 'landscape', margin: 25 });
        currentY = 25;
      }

      const empData = recordMap[emp.id] || {};
      let pCount = 0, aCount = 0, hCount = 0, woCount = 0, totalOt = 0;

      // Total height for this employee's block
      const blockHeight = rowHeight * 3;

      // Draw Row Outline for the whole block
      doc.rect(startX, currentY, totalWidth, blockHeight).stroke();

      // Name (Merged 3 rows)
      doc.fillColor('#000000').fontSize(7).font('Helvetica');
      doc.text(emp.name, startX + 2, currentY + (blockHeight / 2) - 4, { width: colName - 4, align: 'center', ellipsis: true });
      doc.rect(startX, currentY, colName, blockHeight).stroke();

      // Designation / Project / OT (3 rows)
      doc.rect(startX + colName, currentY, colDesig, rowHeight).stroke();
      doc.text(emp.role || '', startX + colName + 2, currentY + 4, { width: colDesig - 4, align: 'center', ellipsis: true });

      doc.rect(startX + colName, currentY + rowHeight, colDesig, rowHeight).stroke();
      doc.fillColor('#666666').font('Helvetica-Oblique');
      doc.text('Project', startX + colName + 2, currentY + rowHeight + 4, { width: colDesig - 4, align: 'right' });

      doc.rect(startX + colName, currentY + rowHeight * 2, colDesig, rowHeight).stroke();
      doc.text('OT (Hrs)', startX + colName + 2, currentY + rowHeight * 2 + 4, { width: colDesig - 4, align: 'right' });

      doc.font('Helvetica');

      let rowX = startX + colName + colDesig;

      // Dates
      dateCols.forEach(c => {
        const fullDate = `${year}-${String(month).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`;
        const rData = empData[fullDate];
        const status = rData ? rData.status : '';
        const proj = rData && rData.project_name ? rData.project_name : '';
        const ot = rData && rData.overtime_hours > 0 ? rData.overtime_hours.toString() : '';
        
        if (status === 'P') pCount++;
        else if (status === 'A') aCount++;
        else if (status === 'H') hCount++;
        else if (status === 'WO') woCount++;

        // Status Row Background & Color
        let bg = '#ffffff';
        let fg = '#000000';
        let isBold = false;
        if (c.isSun) {
          bg = '#dc2626'; fg = '#ffffff'; isBold = true;
        } else if (status === 'P') {
          bg = '#dcfce7'; fg = '#166534';
        } else if (status === 'A') {
          bg = '#fee2e2'; fg = '#991b1b';
        } else if (status === 'H') {
          bg = '#fef9c3'; fg = '#854d0e';
        } else if (status === 'WO') {
          bg = '#dc2626'; fg = '#ffffff'; isBold = true;
        }

        // Draw Status Row
        doc.rect(rowX, currentY, colDate, rowHeight).fillAndStroke(bg, '#000000');
        if (isBold) doc.font('Helvetica-Bold');
        doc.fillColor(fg).fontSize(7).text(status, rowX, currentY + 4, { width: colDate, align: 'center' });
        doc.font('Helvetica');

        // Draw Project Row
        doc.rect(rowX, currentY + rowHeight, colDate, rowHeight).stroke();
        doc.fillColor('#000000').fontSize(5).text(proj, rowX, currentY + rowHeight + 5, { width: colDate, align: 'center', ellipsis: true });

        // Draw OT Row
        doc.rect(rowX, currentY + rowHeight * 2, colDate, rowHeight).stroke();
        doc.fontSize(6).text(ot, rowX, currentY + rowHeight * 2 + 4, { width: colDate, align: 'center' });
        
        if (rData && rData.overtime_hours > 0) totalOt += rData.overtime_hours;

        rowX += colDate;
      });

      // Summaries (Merged 3 rows)
      doc.fillColor('#000000').font('Helvetica').fontSize(7);
      const sumVals = [daysInMonth, pCount, woCount, hCount, aCount, 0];
      sumVals.forEach(v => {
        doc.rect(rowX, currentY, colSum, blockHeight).stroke();
        doc.text(v.toString(), rowX, currentY + (blockHeight / 2) - 4, { width: colSum, align: 'center' });
        rowX += colSum;
      });

      const totalPayable = pCount + woCount + (hCount * 0.5);
      doc.rect(rowX, currentY, colTotal, blockHeight).stroke();
      doc.text(totalPayable.toString(), rowX, currentY + (blockHeight / 2) - 4, { width: colTotal, align: 'center' });
      rowX += colTotal;

      doc.rect(rowX, currentY, colTotalOT, blockHeight).stroke();
      doc.text(totalOt.toString(), rowX, currentY + (blockHeight / 2) - 4, { width: colTotalOT, align: 'center' });

      currentY += blockHeight;
    });

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

module.exports = { generatePayslipPdf, generateMonthlyReportPdf, generateAttendanceRegisterPdf };

