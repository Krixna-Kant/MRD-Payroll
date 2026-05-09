const { BrowserWindow } = require('electron');
const fs = require('fs');

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

async function generateCalendarPdf(employee, records, summary, month, year, companyName, outputPath) {
  return new Promise((resolve, reject) => {
    const html = buildHtml(employee, records, summary, month, year, companyName);
    
    let win = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    win.webContents.on('did-finish-load', async () => {
      try {
        const pdfBuffer = await win.webContents.printToPDF({
          landscape: true,
          printBackground: true,
          preferCSSPageSize: true
        });
        fs.writeFileSync(outputPath, pdfBuffer);
        resolve(outputPath);
      } catch (error) {
        reject(error);
      } finally {
        win.close();
      }
    });
  });
}

function isSunday(dateStr) {
  return new Date(dateStr + 'T00:00:00').getDay() === 0;
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const [y, m, d] = dateStr.split('-');
  return `${d}-${MONTHS[parseInt(m)-1].substring(0,3)}-${y}`;
}

function buildHtml(employee, records, summary, month, year, companyName) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun

  const recordMap = {};
  records.forEach(r => { recordMap[r.date] = r; });

  const dayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  let calHtml = `
    <div class="att-calendar">
      ${dayLabels.map(d => `<div class="att-calendar-header">${d}</div>`).join('')}
      ${Array(firstDay).fill('<div class="att-calendar-cell empty"></div>').join('')}
  `;

  let woCount = 0; // Recalculate WO as it might not be in summary directly
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const rec = recordMap[dateStr] || null;
    let status = rec ? rec.status : null;
    const isSun = isSunday(dateStr);
    const hasOT = rec && rec.overtime_hours > 0;
    const projName = rec && rec.project_name ? rec.project_name : '';

    if (!status && isSun) status = 'WO';
    if (status === 'WO') woCount++;

    let statusHtml = `<div class="att-btn ${status || ''}">${status || '—'}</div>`;

    calHtml += `
      <div class="att-calendar-cell ${isSun ? 'sunday-cell' : ''}">
        <div class="att-date-label">${String(d).padStart(2, '0')} ${isSun ? '<span class="sun-text">Sun</span>' : ''}</div>
        <div class="cell-content">
          ${statusHtml}
          ${hasOT ? `<div class="ot-badge">${rec.overtime_hours}h OT</div>` : ''}
          ${projName ? `<div class="proj-badge">${projName}</div>` : ''}
        </div>
      </div>
    `;
  }
  calHtml += `</div>`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        * { box-sizing: border-box; }
        body { 
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
          margin: 0; padding: 0; color: #111827; background: #ffffff;
        }
        
        .header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
        .company-name { font-size: 24px; font-weight: bold; color: #6366f1; margin: 0 0 5px 0; }
        .report-title { font-size: 14px; color: #6b7280; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
        
        .emp-details { text-align: right; }
        .emp-name { font-size: 18px; font-weight: bold; margin: 0 0 4px 0; }
        .emp-meta { font-size: 12px; color: #6b7280; margin: 0; }
        
        .summary-bar { display: flex; gap: 15px; margin-bottom: 20px; }
        .summary-item { background: #f3f4f6; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
        .summary-item span.val { font-size: 14px; font-weight: bold; }
        
        .att-calendar { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
        .att-calendar-header { font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b7280; text-align: center; padding: 5px; }
        .att-calendar-cell { 
          min-height: 85px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px; 
          display: flex; flex-direction: column; background: #fafafa;
        }
        .att-calendar-cell.sunday-cell { background: #fef2f2; border-color: #fecaca; }
        .att-calendar-cell.empty { border: none; background: transparent; }
        
        .att-date-label { font-size: 11px; color: #9ca3af; margin-bottom: 4px; font-weight: 600; display: flex; justify-content: space-between; }
        .sun-text { color: #f59e0b; }
        
        .cell-content { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
        
        .att-btn {
          width: 28px; height: 28px; border-radius: 4px;
          font-size: 12px; font-weight: bold;
          display: flex; align-items: center; justify-content: center;
          border: 1px solid transparent;
        }
        .att-btn.P { background: #d1fae5; color: #059669; border-color: #34d399; }
        .att-btn.A { background: #ffe4e6; color: #e11d48; border-color: #fb7185; }
        .att-btn.H { background: #fef3c7; color: #d97706; border-color: #fbbf24; }
        .att-btn.WO { background: #e0f2fe; color: #0284c7; border-color: #7dd3fc; }
        .att-btn:not(.P):not(.A):not(.H):not(.WO) { background: #f3f4f6; color: #9ca3af; border-color: #e5e7eb; }
        
        .ot-badge { background: #ede9fe; color: #7c3aed; font-size: 10px; padding: 2px 6px; border-radius: 10px; font-weight: bold; }
        .proj-badge { background: #f1f5f9; color: #475569; font-size: 9px; padding: 2px 4px; border-radius: 4px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: 1px solid #cbd5e1; }
        
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1 class="company-name">${companyName}</h1>
          <p class="report-title">Monthly Attendance Calendar — ${MONTHS[month - 1]} ${year}</p>
        </div>
        <div class="emp-details">
          <p class="emp-name">${employee.name}</p>
          <p class="emp-meta">Desig: ${employee.role || 'N/A'} | Joined: ${formatDate(employee.joining_date)}</p>
        </div>
      </div>
      
      <div class="summary-bar">
        <div class="summary-item" style="color: #059669"><span class="val">${summary.P || 0}</span> Present</div>
        <div class="summary-item" style="color: #e11d48"><span class="val">${summary.A || 0}</span> Absent</div>
        <div class="summary-item" style="color: #d97706"><span class="val">${summary.H || 0}</span> Half Day</div>
        <div class="summary-item" style="color: #0284c7"><span class="val">${woCount}</span> Weekly Off</div>
        <div class="summary-item" style="color: #7c3aed"><span class="val">${summary.totalOvertimeHours || 0}h</span> Total OT</div>
      </div>

      ${calHtml}
    </body>
    </html>
  `;
}

module.exports = { generateCalendarPdf };
