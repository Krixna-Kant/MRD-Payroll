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

  // Group by project name
  const projectCounts = {};

  let rowsHtml = '';

  records.forEach((r, idx) => {
    const status = r.status || (r.is_sunday_work ? 'P' : '—');
    
    if (status === 'P') pCount++;
    else if (status === 'A') aCount++;
    else if (status === 'H') hCount++;
    else if (status === 'WO') woCount++;

    const ot = parseFloat(r.overtime_hours || 0);
    if (ot > 0) totalOt += ot;

    // Project grouping
    let proj = r.project_name || 'Unassigned';
    proj = proj.trim() === '—' || proj.trim() === '' ? 'Unassigned' : proj;
    if (!projectCounts[proj]) {
      projectCounts[proj] = { present: 0, absent: 0, halfDay: 0, weeklyOff: 0, total: 0 };
    }
    projectCounts[proj].total++;
    if (status === 'P') projectCounts[proj].present++;
    else if (status === 'A') projectCounts[proj].absent++;
    else if (status === 'H') projectCounts[proj].halfDay++;
    else if (status === 'WO') projectCounts[proj].weeklyOff++;

    let statusBadge = '';
    if (status === 'P') statusBadge = '<span class="status-pill status-present">P</span>';
    else if (status === 'A') statusBadge = '<span class="status-pill status-absent">A</span>';
    else if (status === 'H') statusBadge = '<span class="status-pill status-halfday">H</span>';
    else if (status === 'WO') statusBadge = '<span class="status-pill status-weeklyoff">WO</span>';
    else statusBadge = '<span class="status-pill status-none">—</span>';

    rowsHtml += `
      <tr>
        <td style="text-align: center; color: #9ca3af; font-weight: 500;">${idx + 1}</td>
        <td style="font-weight: 600; color: #1f2937;">${r.name || 'Unknown'}</td>
        <td style="color: #4b5563; font-weight: 500;">${r.project_name || '—'}</td>
        <td style="text-align: center;">${statusBadge}</td>
        <td style="text-align: center; color: #4b5563;">${r.check_in || '—'}</td>
        <td style="text-align: center; color: #4b5563;">${r.check_out || '—'}</td>
        <td style="text-align: center; font-weight: ${ot > 0 ? '600' : 'normal'}; color: ${ot > 0 ? '#6366f1' : '#9ca3af'};">
          ${ot > 0 ? ot + ' hrs' : '—'}
        </td>
      </tr>
    `;
  });

  // Sort projects alphabetically, keeping 'Unassigned' at the end
  const sortedProjects = Object.entries(projectCounts).sort(([a], [b]) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });

  let projectCardsHtml = sortedProjects.map(([proj, counts]) => {
    const presentTotal = counts.present + counts.halfDay;
    return `
      <div class="project-card">
        <div class="project-card-header">${proj}</div>
        <div class="project-card-body">
          <div class="project-stat-row">
            <span class="dot dot-present"></span>
            <span class="lbl">Present</span>
            <span class="val font-semibold text-success">${presentTotal}</span>
          </div>
          <div class="project-stat-row">
            <span class="dot dot-absent"></span>
            <span class="lbl">Absent</span>
            <span class="val font-semibold text-danger">${counts.absent}</span>
          </div>
          <div class="project-stat-row total-row">
            <span class="dot dot-total"></span>
            <span class="lbl">Total</span>
            <span class="val font-bold">${counts.total}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        @page { size: A4 portrait; margin: 10mm; }
        * { box-sizing: border-box; }
        body { 
          font-family: 'Inter', system-ui, -apple-system, sans-serif; 
          margin: 0; padding: 15px; color: #1f2937; background: #ffffff;
          line-height: 1.5;
        }
        
        .header { 
          text-align: center; 
          margin-bottom: 24px; 
          padding-bottom: 16px;
          border-bottom: 1px solid #e5e7eb;
        }
        .company-name { 
          font-size: 24px; 
          font-weight: 700; 
          color: #4f46e5; 
          margin: 0 0 4px 0;
          letter-spacing: -0.025em;
        }
        .report-title { 
          font-size: 16px; 
          font-weight: 600; 
          color: #374151;
          margin: 0 0 6px 0; 
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .report-date { 
          font-size: 13px; 
          color: #6b7280; 
          margin: 0; 
          font-weight: 500;
        }
        
        .section-title {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          color: #4b5563;
          margin-bottom: 10px;
          letter-spacing: 0.05em;
        }

        .summary-bar { 
          display: flex; 
          justify-content: space-between; 
          gap: 8px; 
          margin-bottom: 24px; 
        }
        .summary-item { 
          flex: 1; 
          background: #ffffff; 
          border: 1px solid #e5e7eb; 
          padding: 10px 6px; 
          border-radius: 8px; 
          text-align: center; 
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
        }
        .summary-item.border-total { border-top: 3px solid #6b7280; }
        .summary-item.border-present { border-top: 3px solid #10b981; }
        .summary-item.border-absent { border-top: 3px solid #ef4444; }
        .summary-item.border-halfday { border-top: 3px solid #f59e0b; }
        .summary-item.border-weeklyoff { border-top: 3px solid #3b82f6; }
        .summary-item.border-ot { border-top: 3px solid #8b5cf6; }

        .summary-item .label { 
          font-size: 10px; 
          text-transform: uppercase; 
          color: #6b7280; 
          font-weight: 600; 
          margin-bottom: 4px; 
        }
        .summary-item .val { 
          font-size: 18px; 
          font-weight: 700; 
          color: #111827;
        }

        /* Project Grid */
        .project-section {
          margin-bottom: 24px;
        }
        .project-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 10px;
        }
        .project-card {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.02);
        }
        .project-card-header {
          font-size: 12px;
          font-weight: 700;
          color: #1f2937;
          border-bottom: 1px solid #f3f4f6;
          padding-bottom: 4px;
          margin-bottom: 6px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .project-card-body {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .project-stat-row {
          display: flex;
          align-items: center;
          font-size: 11px;
          color: #4b5563;
        }
        .project-stat-row.total-row {
          border-top: 1px dashed #e5e7eb;
          margin-top: 4px;
          padding-top: 4px;
          color: #111827;
        }
        .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          margin-right: 6px;
        }
        .dot-present { background: #10b981; }
        .dot-absent { background: #ef4444; }
        .dot-total { background: #6b7280; }
        .project-stat-row .lbl {
          flex: 1;
        }
        .project-stat-row .val {
          font-variant-numeric: tabular-nums;
        }

        /* Table redesign */
        table { 
          width: 100%; 
          border-collapse: separate; 
          border-spacing: 0;
          font-size: 12px; 
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          overflow: hidden;
        }
        th { 
          background: #f9fafb; 
          padding: 10px 12px; 
          text-align: left; 
          border-bottom: 1px solid #e5e7eb; 
          font-weight: 600; 
          color: #4b5563; 
          text-transform: uppercase;
          font-size: 10px;
          letter-spacing: 0.05em;
        }
        td { 
          padding: 8px 12px; 
          border-bottom: 1px solid #f3f4f6; 
          vertical-align: middle; 
        }
        tr:last-child td {
          border-bottom: none;
        }
        tr:nth-child(even) { background: #ffffff; }
        tr:nth-child(odd) { background: #fcfcfd; }
        
        .status-pill {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 9999px;
          font-size: 10px;
          font-weight: 700;
          text-align: center;
          min-width: 32px;
        }
        .status-present { background-color: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
        .status-absent { background-color: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; }
        .status-halfday { background-color: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
        .status-weeklyoff { background-color: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; }
        .status-none { background-color: #f3f4f6; color: #4b5563; border: 1px solid #e5e7eb; }
        
        .font-semibold { font-weight: 600; }
        .font-bold { font-weight: 700; }
        .text-success { color: #059669; }
        .text-danger { color: #dc2626; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1 class="company-name">${companyName}</h1>
        <p class="report-title">Daily Manpower Report</p>
        <p class="report-date">${formatDateFull(date)}</p>
      </div>
      
      <div class="section-title">Manpower Summary</div>
      <div class="summary-bar">
        <div class="summary-item border-total"><div class="label">Total</div><div class="val">${totalEmployees}</div></div>
        <div class="summary-item border-present"><div class="label" style="color: #10b981">Present</div><div class="val" style="color: #10b981">${pCount}</div></div>
        <div class="summary-item border-absent"><div class="label" style="color: #ef4444">Absent</div><div class="val" style="color: #ef4444">${aCount}</div></div>
        <div class="summary-item border-halfday"><div class="label" style="color: #f59e0b">Half Day</div><div class="val" style="color: #f59e0b">${hCount}</div></div>
        <div class="summary-item border-weeklyoff"><div class="label" style="color: #3b82f6">Weekly Off</div><div class="val" style="color: #3b82f6">${woCount}</div></div>
        <div class="summary-item border-ot"><div class="label" style="color: #8b5cf6">Total OT</div><div class="val" style="color: #8b5cf6">${totalOt}h</div></div>
      </div>

      <div class="project-section">
        <div class="section-title">Project-Wise Count</div>
        <div class="project-grid">
          ${projectCardsHtml}
        </div>
      </div>

      <div class="section-title">Attendance Details</div>
      <table>
        <thead>
          <tr>
            <th style="text-align: center; width: 40px;">#</th>
            <th>Employee Name</th>
            <th>Project</th>
            <th style="text-align: center; width: 80px;">Status</th>
            <th style="text-align: center; width: 100px;">In Time</th>
            <th style="text-align: center; width: 100px;">Out Time</th>
            <th style="text-align: center; width: 90px;">OT Hours</th>
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
