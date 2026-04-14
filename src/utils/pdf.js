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
  return '₹' + rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
      ['Gross Monthly Salary',       formatRupees(payment.gross_salary)],
      ['Attendance (days)',           `${payment.attendance_days} / ${payment.total_days}`],
      ['Effective Salary',            formatRupees(payment.effective_salary)],
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

    // ── Net Salary Footer ─────────────────────────────────────────────────────
    const netY = rowY + 10;
    doc.rect(50, netY, W, 40).fill(C.primary);
    doc.fillColor(C.white).fontSize(14).font('Helvetica-Bold')
       .text('NET SALARY PAYABLE', 70, netY + 12)
       .text(formatRupees(payment.net_paid), 0, netY + 12, { align: 'right' });

    // ── Footer ────────────────────────────────────────────────────────────────
    doc.fillColor(C.gray).fontSize(8).font('Helvetica')
       .text('This is a computer-generated payslip and does not require a signature.', 50, netY + 70, { align: 'center', width: W });

    if (payment.notes) {
      doc.fillColor(C.gray).fontSize(9)
         .text(`Notes: ${payment.notes}`, 50, netY + 90);
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
      { label: 'Employee',    x: 40,  w: 150 },
      { label: 'Role',        x: 195, w: 100 },
      { label: 'Gross Salary',x: 300, w: 100 },
      { label: 'Advance',     x: 405, w: 90  },
      { label: 'Net Paid',    x: 500, w: 100 },
      { label: 'Mode',        x: 605, w: 70  },
      { label: 'Status',      x: 680, w: 70  },
    ];

    let rowY = 120;
    doc.rect(40, rowY, W, 22).fill(C.dark);
    cols.forEach(col => {
      doc.fillColor(C.white).fontSize(9).font('Helvetica-Bold')
         .text(col.label, col.x + 4, rowY + 7, { width: col.w - 4 });
    });

    rowY += 22;
    let totalGross = 0, totalAdv = 0, totalNet = 0;

    payments.forEach((p, i) => {
      if (i % 2 === 0) doc.rect(40, rowY, W, 20).fill('#f9fafb');
      cols.forEach((col, ci) => {
        const vals = [
          p.employee_name,
          p.employee_role || '-',
          formatRupees(p.gross_salary),
          formatRupees(p.advance_deducted),
          formatRupees(p.net_paid),
          p.mode,
          p.status.toUpperCase(),
        ];
        doc.fillColor(C.text).fontSize(9).font('Helvetica')
           .text(vals[ci], col.x + 4, rowY + 5, { width: col.w - 4 });
      });
      totalGross += p.gross_salary;
      totalAdv   += p.advance_deducted;
      totalNet   += p.net_paid;
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
    doc.fillColor(C.white).fontSize(10).font('Helvetica-Bold')
       .text(`TOTALS (${payments.length} employees)`, 44, rowY + 8, { width: 250 })
       .text(formatRupees(totalGross), 300, rowY + 8, { width: 100 })
       .text(formatRupees(totalAdv),   405, rowY + 8, { width: 90  })
       .text(formatRupees(totalNet),   500, rowY + 8, { width: 100 });

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

module.exports = { generatePayslipPdf, generateMonthlyReportPdf };
