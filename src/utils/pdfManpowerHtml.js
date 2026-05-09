const { BrowserWindow } = require('electron');
const fs = require('fs');

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function formatDateFull(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const day = dayNames[d.getDay()];
  const [y, m, dayOfMonth] = dateStr.split('-');
  return `${day}, ${dayOfMonth} ${MONTHS[parseInt(m)-1]} ${y}`;
}

function buildManpowerHtml(records, date, companyName) {
  let totalEmployees = records.length;
  let pCount = 0, aCount = 0, hCount = 0, woCount = 0;
  let totalOt = 0;

  let rowsHtml = '';

  records.forEach((r, idx) => {
    const status = r.status || (r.is_sunday_work ? 'P' : '—');
    
    if (status === 'P') pCount++;
    else if (status === 'A') aCount++;
    else if (status === 'H') hCount++;
    else if (status === 'WO') woCount++;

    const ot = parseFloat(r.overtime_hours || 0);
    if (ot > 0) totalOt += ot;

    let statusClass = '';
    if (status === 'P') statusClass = 'text-success';
    else if (status === 'A') statusClass = 'text-danger';
    else if (status === 'H') statusClass = 'text-warning';
    else if (status === 'WO') statusClass = 'text-info';

    rowsHtml += `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td style="font-weight: 600;">${r.name || 'Unknown'}</td>
        <td style="color: #6b7280;">${r.role || '—'}</td>
        <td>${r.project_name || '—'}</td>
        <td style="text-align: center; font-weight: bold;" class="${statusClass}">${status}</td>
        <td style="text-align: center;">${r.check_in || '—'}</td>
        <td style="text-align: center;">${r.check_out || '—'}</td>
        <td style="text-align: center; font-weight: ${ot > 0 ? 'bold' : 'normal'}; color: ${ot > 0 ? '#7c3aed' : '#9ca3af'};">${ot > 0 ? ot + 'h' : '—'}</td>
      </tr>
    `;
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page { size: A4 portrait; margin: 10mm; }
        * { box-sizing: border-box; }
        body { 
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
          margin: 0; padding: 20px; color: #111827; background: #ffffff;
        }
        
        .header { text-align: center; margin-bottom: 25px; border-bottom: 2px solid #e5e7eb; padding-bottom: 15px; }
        .company-name { font-size: 26px; font-weight: bold; color: #6366f1; margin: 0 0 5px 0; }
        .report-title { font-size: 18px; font-weight: bold; margin: 0 0 5px 0; }
        .report-date { font-size: 14px; color: #6b7280; margin: 0; }
        
        .summary-bar { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 25px; }
        .summary-item { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px; text-align: center; }
        .summary-item .label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; margin-bottom: 4px; }
        .summary-item .val { font-size: 18px; font-weight: bold; }
        
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { background: #f1f5f9; padding: 10px; text-align: left; border: 1px solid #cbd5e1; font-weight: bold; color: #334155; }
        td { padding: 8px 10px; border: 1px solid #e2e8f0; vertical-align: middle; }
        tr:nth-child(even) { background: #f8fafc; }
        
        .text-success { color: #059669; }
        .text-danger { color: #dc2626; }
        .text-warning { color: #d97706; }
        .text-info { color: #0284c7; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1 class="company-name">${companyName}</h1>
        <p class="report-title">Daily Manpower Report</p>
        <p class="report-date">${formatDateFull(date)}</p>
      </div>
      
      <div class="summary-bar">
        <div class="summary-item"><div class="label">Total</div><div class="val">${totalEmployees}</div></div>
        <div class="summary-item"><div class="label" style="color: #059669">Present</div><div class="val" style="color: #059669">${pCount}</div></div>
        <div class="summary-item"><div class="label" style="color: #dc2626">Absent</div><div class="val" style="color: #dc2626">${aCount}</div></div>
        <div class="summary-item"><div class="label" style="color: #d97706">Half Day</div><div class="val" style="color: #d97706">${hCount}</div></div>
        <div class="summary-item"><div class="label" style="color: #0284c7">Weekly Off</div><div class="val" style="color: #0284c7">${woCount}</div></div>
        <div class="summary-item"><div class="label" style="color: #7c3aed">Total OT</div><div class="val" style="color: #7c3aed">${totalOt}h</div></div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="text-align: center; width: 40px;">#</th>
            <th>Employee Name</th>
            <th>Designation</th>
            <th>Project</th>
            <th style="text-align: center;">Status</th>
            <th style="text-align: center;">In Time</th>
            <th style="text-align: center;">Out Time</th>
            <th style="text-align: center;">OT Hours</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </body>
    </html>
  `;
}

function extractSummary(records) {
  let pCount = 0, aCount = 0, hCount = 0, woCount = 0, totalOt = 0;
  records.forEach(r => {
    const status = r.status || (r.is_sunday_work ? 'P' : '—');
    if (status === 'P') pCount++;
    else if (status === 'A') aCount++;
    else if (status === 'H') hCount++;
    else if (status === 'WO') woCount++;
    totalOt += parseFloat(r.overtime_hours || 0);
  });
  return { total: records.length, pCount, aCount, hCount, woCount, totalOt };
}

async function generateManpowerPdf(records, date, companyName, outputPath) {
  return new Promise((resolve, reject) => {
    const html = buildManpowerHtml(records, date, companyName);
    
    let win = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    win.webContents.on('did-finish-load', async () => {
      try {
        const pdfBuffer = await win.webContents.printToPDF({
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

async function generateManpowerImage(records, date, companyName, outputPath) {
  return new Promise((resolve, reject) => {
    const html = buildManpowerHtml(records, date, companyName);
    
    // Create window with high resolution width
    let win = new BrowserWindow({
      show: false,
      width: 1200,
      height: 1600, // Initial height, will resize later
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    win.webContents.on('did-finish-load', async () => {
      try {
        // Wait a small moment for layout
        await new Promise(r => setTimeout(r, 100));
        
        // Get actual content height
        const height = await win.webContents.executeJavaScript('document.documentElement.scrollHeight');
        win.setContentSize(1200, height);
        
        // Capture page
        const image = await win.webContents.capturePage();
        const buffer = image.toPNG();
        
        fs.writeFileSync(outputPath, buffer);
        resolve(outputPath);
      } catch (error) {
        reject(error);
      } finally {
        win.close();
      }
    });
  });
}

module.exports = { generateManpowerPdf, generateManpowerImage, extractSummary };
