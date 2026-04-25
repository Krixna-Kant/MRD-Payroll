const { getDB } = require('../database/db');

function processMonthlyAttendanceStats(db, empId, effectiveStart, end) {
  const sundayOTEnabled = parseInt(db.prepare(`SELECT value FROM settings WHERE key = 'enable_sunday_ot'`).get()?.value || '1', 10) === 1;
  const woEnabled = parseInt(db.prepare(`SELECT value FROM settings WHERE key = 'enable_weekly_off'`).get()?.value || '1', 10) === 1;

  // Get raw attendance + adjacent days (to handle sandwich rule that crosses month boundary)
  const expandedStartD = new Date(effectiveStart + 'T00:00:00');
  expandedStartD.setDate(expandedStartD.getDate() - 1);
  const expandedStart = expandedStartD.toISOString().split('T')[0];

  const expandedEndD = new Date(end + 'T00:00:00');
  expandedEndD.setDate(expandedEndD.getDate() + 1);
  const expandedEnd = expandedEndD.toISOString().split('T')[0];

  const rawRecords = db.prepare(`
    SELECT date, status, overtime_hours, is_sunday_work 
    FROM attendance 
    WHERE employee_id = ? AND date >= ? AND date <= ?
  `).all(empId, expandedStart, expandedEnd);

  const recordMap = {};
  rawRecords.forEach(r => recordMap[r.date] = r);

  let P = 0, A = 0, H = 0, WO = 0;
  let effectiveDays = 0;
  let totalOvertimeHours = 0;
  let sundayWorkDays = 0;

  const startD = new Date(effectiveStart + 'T00:00:00');
  const endD = new Date(end + 'T00:00:00');

  for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const rec = recordMap[dateStr];
    const sunday = d.getDay() === 0;

    let finalStatus = rec ? rec.status : null; 

    if (sunday) {
      if (!finalStatus || finalStatus === 'WO') {
        if (woEnabled) {
          const prevDay = new Date(d); prevDay.setDate(d.getDate() - 1);
          const nextDay = new Date(d); nextDay.setDate(d.getDate() + 1);
          
          const prevStr = prevDay.toISOString().split('T')[0];
          const nextStr = nextDay.toISOString().split('T')[0];
          const stPrev = recordMap[prevStr]?.status;
          const stNext = recordMap[nextStr]?.status;

          // Rule: Absent on Saturday OR Monday -> Sunday is Absent
          if (stPrev === 'A' || stNext === 'A') {
             finalStatus = 'A';
          } else {
             finalStatus = 'WO'; // Paid Weekly Off
          }
        }
      } else if (finalStatus === 'P' || finalStatus === 'H') {
        sundayWorkDays += 1;
        if (sundayOTEnabled) {
          // Add 8 hours OT automatically if present on Sunday
          totalOvertimeHours += 8;
        }
      }
    }

    if (finalStatus === 'P') { P++; effectiveDays += 1; }
    else if (finalStatus === 'A') { A++; }
    else if (finalStatus === 'H') { H++; effectiveDays += 0.5; }
    else if (finalStatus === 'WO') { WO++; effectiveDays += 1; } 

    if (rec && rec.status && rec.status !== 'A') {
      totalOvertimeHours += (rec.overtime_hours || 0);
    }
  }

  return { P, A, H, WO, effectiveDays, totalOvertimeHours, sundayWorkDays, totalDaysInPeriod: Math.round((endD - startD)/(1000*60*60*24)) + 1 };
}

module.exports = { processMonthlyAttendanceStats };
