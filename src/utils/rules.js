const { getDB } = require('../database/db');

const getLocalYMD = (d) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function processMonthlyAttendanceStats(db, empId, effectiveStart, end) {
  const sundayOTEnabled = parseInt(db.prepare(`SELECT value FROM settings WHERE key = 'enable_sunday_ot'`).get()?.value || '1', 10) === 1;
  const woEnabled = parseInt(db.prepare(`SELECT value FROM settings WHERE key = 'enable_weekly_off'`).get()?.value || '1', 10) === 1;

  // Get raw attendance + adjacent days (to handle sandwich rule that crosses month boundary)
  const expandedStartD = new Date(effectiveStart + 'T00:00:00');
  expandedStartD.setDate(expandedStartD.getDate() - 1);
  const expandedStart = getLocalYMD(expandedStartD);

  const expandedEndD = new Date(end + 'T00:00:00');
  expandedEndD.setDate(expandedEndD.getDate() + 1);
  const expandedEnd = getLocalYMD(expandedEndD);

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
  
  // To avoid phantom 'Absent' or 'Weekly Off' counts for future days,
  // we only process up to today's date if the month is current/future.
  const todayStr = getLocalYMD(new Date());
  const processingEndD = new Date(endD);
  if (todayStr < end) {
      const todayD = new Date(todayStr + 'T00:00:00');
      if (todayD < processingEndD) {
          // If we are looking at the current month, only calculate stats up to today.
          // This ensures "Net Payable" and attendance badges reflect reality.
          processingEndD.setTime(todayD.getTime());
      }
  }

  for (let d = new Date(startD); d <= processingEndD; d.setDate(d.getDate() + 1)) {
    const dateStr = getLocalYMD(d);
    const rec = recordMap[dateStr];
    const sunday = d.getDay() === 0;

    let finalStatus = rec ? rec.status : null; 

    if (sunday) {
      if (!finalStatus || finalStatus === 'WO') {
        if (woEnabled) {
          const prevDay = new Date(d); prevDay.setDate(d.getDate() - 1);
          const nextDay = new Date(d); nextDay.setDate(d.getDate() + 1);
          
          const prevStr = getLocalYMD(prevDay);
          const nextStr = getLocalYMD(nextDay);
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
        if (sundayOTEnabled && rec && rec.is_sunday_work) {
          // Add 8 hours OT automatically if present on Sunday and Sun 2x is checked
          totalOvertimeHours += 8;
        }
      }
    }

    if (finalStatus === 'P') { P++; effectiveDays += 1; }
    else if (finalStatus === 'A') { A++; }
    else if (finalStatus === 'H') { H++; effectiveDays += 0.5; }
    else if (finalStatus === 'WO') { WO++; effectiveDays += 1; } 

    if (rec && rec.status && rec.status !== 'A') {
      let ot = rec.overtime_hours || 0;
      
      // Backward compatibility: The old UI erroneously saved 8 hours of OT automatically 
      // when a user was marked Present on a Sunday. To prevent double-counting old records:
      if (sunday && sundayOTEnabled && rec.is_sunday_work && ot >= 8) {
        ot -= 8;
      }
      
      totalOvertimeHours += ot;
    }
  }

  return { P, A, H, WO, effectiveDays, totalOvertimeHours, sundayWorkDays, totalDaysInPeriod: Math.round((endD - startD)/(1000*60*60*24)) + 1 };
}

/**
 * Calculates leave statistics for an employee for a specific year.
 * Policy: 15 Paid Leaves (CL/SL) per year.
 */
function getLeaveStats(db, empId, year) {
  const yearStart = new Date(`${year}-01-01T00:00:00`);
  const yearEnd   = new Date(`${year}-12-31T23:59:59`);

  // Select any approved leave that overlaps with this year
  const approvedLeaves = db.prepare(`
    SELECT type, from_date, to_date, total_days 
    FROM leaves 
    WHERE employee_id = ? 
      AND status = 'approved' 
      AND NOT (to_date < ? OR from_date > ?)
  `).all(empId, `${year}-01-01`, `${year}-12-31`);

  let usedPaid = 0;
  let unpaid = 0;

  approvedLeaves.forEach(l => {
    // Only count days that fall WITHIN the requested year
    const lStart = new Date(l.from_date + 'T00:00:00');
    const lEnd   = new Date(l.to_date + 'T00:00:00');
    
    const actualStart = lStart < yearStart ? yearStart : lStart;
    const actualEnd   = lEnd > yearEnd ? yearEnd : lEnd;
    
    let curr = new Date(actualStart);
    while (curr <= actualEnd) {
      // RULE: Do NOT count Sundays against the 15-day quota
      if (curr.getDay() !== 0) { 
        if (l.type === 'LWP') {
          unpaid++;
        } else {
          usedPaid++;
        }
      }
      curr.setDate(curr.getDate() + 1);
    }
  });

  const totalAllowed = 15;
  const remaining = Math.max(0, totalAllowed - usedPaid);
  const exceeded = Math.max(0, usedPaid - totalAllowed);

  return {
    totalAllowed,
    usedPaid,
    remaining,
    unpaid,
    exceeded // Any days above 15 that were marked as CL/SL but should be LWP
  };
}

module.exports = { processMonthlyAttendanceStats, getLeaveStats };
