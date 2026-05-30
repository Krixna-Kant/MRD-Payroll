const { ipcMain } = require('electron');
const { getDB } = require('../database/db');
const { logActivity } = require('../utils/audit');
const { generateAlert } = require('./alerts');
const { processMonthlyAttendanceStats } = require('../utils/rules');

// Helper to format a local Date object as YYYY-MM-DD
function formatLocalDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Retroactively apply auto absent rules (duplicated from attendance.js for self-containment)
function applyAutoAbsentRules(db, date) {
  const reqDate = new Date(date + 'T00:00:00');
  const yesterday = new Date(reqDate); yesterday.setDate(yesterday.getDate() - 1);
  const dayBefore = new Date(reqDate); dayBefore.setDate(dayBefore.getDate() - 2);

  const d1 = formatLocalDate(yesterday);
  const d2 = formatLocalDate(dayBefore);

  const absentees = db.prepare(`
    SELECT e.id, e.name
    FROM employees e
    JOIN attendance a1 ON a1.employee_id = e.id AND a1.date = ? AND a1.status = 'A'
    JOIN attendance a2 ON a2.employee_id = e.id AND a2.date = ? AND a2.status = 'A'
    LEFT JOIN attendance a_curr ON a_curr.employee_id = e.id AND a_curr.date = ?
    WHERE e.status = 'active'
      AND a_curr.id IS NULL
  `).all(d1, d2, date);

  for (const emp of absentees) {
    const leave = db.prepare(`
      SELECT id FROM leaves 
      WHERE employee_id = ? 
        AND status = 'approved' 
        AND ? BETWEEN from_date AND to_date
    `).get(emp.id, date);

    if (leave) continue;

    db.prepare(`
      INSERT INTO attendance (employee_id, date, status, notes, marked_by, is_finalized)
      VALUES (?, ?, 'A', 'AUTO ABSENT', NULL, 1)
    `).run(emp.id, date);

    logActivity('Attendance', 'Auto-Marked', `System auto-marked ${emp.name} as Absent due to continuous absence rule.`, null, 'A');
    generateAlert(db, 'Critical Absence', `${emp.name} absent continuously for 3+ days. (Auto-Marked)`, 'Critical', 'Attendance');
  }
}

function applyAutoAbsentRulesRange(db, start, end) {
  const startDate = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  if (startDate > endDate) return;
  let curr = new Date(startDate);
  while (curr <= endDate) {
    const dateStr = formatLocalDate(curr);
    applyAutoAbsentRules(db, dateStr);
    curr.setDate(curr.getDate() + 1);
  }
}

// Dynamic Attendance Score calculation
function calculateAttendanceScore(attendance_pct) {
  if (attendance_pct >= 90) return 20;
  if (attendance_pct >= 75) return 15;
  if (attendance_pct >= 50) return 10;
  if (attendance_pct >= 25) return 5;
  if (attendance_pct >= 10) return 2;
  if (attendance_pct > 0) return 1;
  return 0;
}

// Dynamic OT Score calculation
function calculateOvertimeScore(total_ot) {
  if (!total_ot || total_ot === 0) return 0;
  return Math.min(20, Math.round(total_ot * 2));
}

// Helper to check eligibility and return stats
function checkEmployeeEligibility(db, employee_id, month, year) {
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(employee_id);
  if (!employee) {
    return {
      isEligible: false,
      reasons: ['Employee not found'],
      stats: null
    };
  }

  const monthStr = month.toString().padStart(2, '0');
  const yearStr = year.toString();
  const start = `${yearStr}-${monthStr}-01`;
  
  // End of month date calculation
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

  // Apply Auto Rules retroactively
  const tzOffset = new Date().getTimezoneOffset() * 60000;
  const todayStr = new Date(Date.now() - tzOffset).toISOString().split('T')[0];
  const endLimit = end < todayStr ? end : todayStr;
  applyAutoAbsentRulesRange(db, start, endLimit);

  // Process attendance stats
  const stats = processMonthlyAttendanceStats(db, employee_id, start, end);
  const present_days = stats.P + stats.H;
  const totalDaysInPeriod = stats.totalDaysInPeriod || lastDay;
  const attendance_pct = totalDaysInPeriod > 0 ? (present_days / totalDaysInPeriod) * 100 : 0;
  const total_ot = stats.totalOvertimeHours || 0;

  const failedRules = [];

  // 1. Minimum Present Days Validation
  if (present_days < 15) {
    failedRules.push(`Minimum present days not met (${present_days}/15 days)`);
  }

  // 2. Attendance % Threshold Validation
  if (attendance_pct < 60) {
    failedRules.push(`Insufficient attendance (${attendance_pct.toFixed(1)}%/60%)`);
  }

  // 3. OT Hours Validation
  if (total_ot === 0) {
    failedRules.push('No OT contribution');
  }

  // 4. Active Working Continuity
  if (employee.status !== 'active') {
    failedRules.push('Employee is inactive');
  }
  if (employee.joining_date && employee.joining_date > end) {
    failedRules.push(`Joined after current month (${employee.joining_date})`);
  }

  // 5. Continuous Absence Check
  // Check if they have 3 or more consecutive days of status 'A' or 'LWP'
  const woEnabled = parseInt(db.prepare(`SELECT value FROM settings WHERE key = 'enable_weekly_off'`).get()?.value || '1', 10) === 1;
  const rawRecords = db.prepare(`
    SELECT date, status FROM attendance 
    WHERE employee_id = ? AND date >= ? AND date <= ?
  `).all(employee_id, start, end);
  const recordMap = {};
  rawRecords.forEach(r => recordMap[r.date] = r);

  let maxConsecutiveAbsents = 0;
  let currentConsecutiveAbsents = 0;
  let absencesCount = 0;
  const startD = new Date(start + 'T00:00:00');
  const endD = new Date(endLimit + 'T00:00:00');

  for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
    const dateStr = formatLocalDate(d);
    const rec = recordMap[dateStr];
    const sunday = d.getDay() === 0;
    let finalStatus = rec ? rec.status : null;

    if (sunday && (!finalStatus || finalStatus === 'WO')) {
      if (woEnabled) {
        const prevDay = new Date(d); prevDay.setDate(d.getDate() - 1);
        const nextDay = new Date(d); nextDay.setDate(d.getDate() + 1);
        const stPrev = recordMap[formatLocalDate(prevDay)]?.status;
        const stNext = recordMap[formatLocalDate(nextDay)]?.status;
        if (stPrev === 'A' || stNext === 'A') {
          finalStatus = 'A';
        } else {
          finalStatus = 'WO';
        }
      }
    }

    if (finalStatus === 'A' || finalStatus === 'LWP') {
      currentConsecutiveAbsents++;
      absencesCount++;
      if (currentConsecutiveAbsents > maxConsecutiveAbsents) {
        maxConsecutiveAbsents = currentConsecutiveAbsents;
      }
    } else {
      currentConsecutiveAbsents = 0;
    }
  }

  if (maxConsecutiveAbsents >= 3) {
    failedRules.push(`Continuous absence detected (${maxConsecutiveAbsents} consecutive days)`);
  }

  const isEligible = failedRules.length === 0;

  // Calculate scores
  const attendance_score = calculateAttendanceScore(attendance_pct);
  const overtime_score = calculateOvertimeScore(total_ot);
  
  // Calculate productivity score
  let productivity_score = 0;
  if (isEligible) {
    const raw_productivity = Math.round(20 * (present_days / totalDaysInPeriod));
    if (attendance_pct < 75) {
      productivity_score = Math.min(10, raw_productivity);
    } else {
      productivity_score = raw_productivity;
    }
  }

  return {
    isEligible,
    reasons: failedRules,
    stats: {
      present_days,
      absences: absencesCount,
      total_ot,
      effective_days: stats.effectiveDays,
      attendance_pct,
      attendance_score,
      overtime_score,
      productivity_score
    }
  };
}

function registerPerformanceHandlers() {
  const db = getDB();

  // 1. ENGINE: Calculate Scores
  // Calculates score for a given employee and month
  ipcMain.handle('engine:calculateScores', async (event, data) => {
    try {
      const { employee_id, month, year, supervisor_score, project_score, special_incentive, penalty_deduction, remarks } = data;
      
      // Perform the eligibility check
      const check = checkEmployeeEligibility(db, employee_id, month, year);
      if (!check.isEligible) {
        throw new Error(`Employee is not eligible for bonus: ${check.reasons.join(', ')}`);
      }
      
      const attendance_score = check.stats.attendance_score;
      const overtime_score = check.stats.overtime_score;
      const productivity_score = check.stats.productivity_score;
      
      const total = attendance_score + overtime_score + productivity_score + (supervisor_score || 0) + (project_score || 0) + (special_incentive || 0) - (penalty_deduction || 0);
      const total_score = Math.max(0, Math.min(100, total));

      // Insert or Update Performance Score
      const existing = db.prepare(`SELECT id FROM performance_scores WHERE employee_id = ? AND month = ? AND year = ?`).get(employee_id, month, year);
      let score_id;
      if (existing) {
        db.prepare(`
          UPDATE performance_scores 
          SET attendance_score = ?, overtime_score = ?, productivity_score = ?, supervisor_score = ?, project_score = ?, special_incentive = ?, penalty_deduction = ?, total_score = ?, remarks = ?
          WHERE id = ?
        `).run(attendance_score, overtime_score, productivity_score, supervisor_score || 0, project_score || 0, special_incentive || 0, penalty_deduction || 0, total_score, remarks, existing.id);
        score_id = existing.id;
      } else {
        const info = db.prepare(`
          INSERT INTO performance_scores (employee_id, month, year, attendance_score, overtime_score, productivity_score, supervisor_score, project_score, special_incentive, penalty_deduction, total_score, remarks)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(employee_id, month, year, attendance_score, overtime_score, productivity_score, supervisor_score || 0, project_score || 0, special_incentive || 0, penalty_deduction || 0, total_score, remarks);
        score_id = info.lastInsertRowid;
      }

      return { success: true, score_id, total_score };
    } catch (error) {
      console.error('[IPC] engine:calculateScores error:', error);
      throw error;
    }
  });

  // 2. ENGINE: Generate Recommendations
  ipcMain.handle('engine:generateRecommendations', async (event, data) => {
    try {
      const { employee_id, month, year, score_id, total_score } = data;
      
      // Get employee base salary to calculate 10% or 5% bonus
      const emp = db.prepare(`SELECT salary FROM employees WHERE id = ?`).get(employee_id);
      if (!emp) throw new Error("Employee not found");
      
      const base_salary = emp.salary || 0;

      let recommended_bonus = 0;
      if (total_score >= 81) {
        recommended_bonus = base_salary * 0.10; // Excellent -> 10%
      } else if (total_score >= 61) {
        recommended_bonus = base_salary * 0.05; // Good -> 5%
      } else if (total_score >= 41) {
        recommended_bonus = 50000; // Average -> Fixed 500 Rs incentive (50000 paisa)
      }

      const existing = db.prepare(`SELECT id, status FROM bonus_recommendations WHERE employee_id = ? AND month = ? AND year = ?`).get(employee_id, month, year);
      
      if (existing) {
        if (existing.status !== 'Paid' && existing.status !== 'Approved') {
          db.prepare(`UPDATE bonus_recommendations SET recommended_bonus = ?, score_id = ?, status = 'Pending Approval' WHERE id = ?`).run(recommended_bonus, score_id, existing.id);
        }
      } else {
        db.prepare(`
          INSERT INTO bonus_recommendations (employee_id, month, year, score_id, recommended_bonus, status)
          VALUES (?, ?, ?, ?, ?, 'Pending Approval')
        `).run(employee_id, month, year, score_id, recommended_bonus);
      }

      return { success: true, recommended_bonus };
    } catch (error) {
      console.error('[IPC] engine:generateRecommendations error:', error);
      throw error;
    }
  });

  // 3. ENGINE: Approve Bonus
  ipcMain.handle('engine:approveBonus', async (event, data) => {
    try {
      const { recommendation_id, action, final_amount, user_id, remarks } = data;
      
      // Safety rule check: Verify eligibility before approving
      const rec = db.prepare(`SELECT employee_id, month, year FROM bonus_recommendations WHERE id = ?`).get(recommendation_id);
      if (!rec) {
        throw new Error('Recommendation not found.');
      }
      
      const check = checkEmployeeEligibility(db, rec.employee_id, rec.month, rec.year);
      if (!check.isEligible && (action === 'pay' || action === 'hold')) {
        throw new Error(`Cannot approve or hold bonus for ineligible employee: ${check.reasons.join(', ')}`);
      }
      
      let status = 'Pending Approval';
      if (action === 'pay') status = 'Approved';
      else if (action === 'hold') status = 'Held';
      else if (action === 'reject') status = 'Rejected';

      const today = new Date().toISOString().split('T')[0];

      db.prepare(`
        UPDATE bonus_recommendations 
        SET status = ?, approved_bonus = ?, approved_by = ?, approval_date = ?, remarks = ?
        WHERE id = ?
      `).run(status, final_amount || 0, user_id, today, remarks || '', recommendation_id);

      db.prepare(`
        INSERT INTO activity_logs (user_id, module, action, description)
        VALUES (?, 'Bonus Engine', ?, ?)
      `).run(user_id, `Bonus ${status}`, `Bonus recommendation ID ${recommendation_id} marked as ${status}`);

      return { success: true };
    } catch (error) {
      console.error('[IPC] engine:approveBonus error:', error);
      throw error;
    }
  });

  // Get all recommendations for Admin Dashboard
  ipcMain.handle('engine:getRecommendations', async (event, data) => {
    try {
      const { month, year } = data;
      const stmt = db.prepare(`
        SELECT b.*, e.name as employee_name, e.role as employee_role, p.total_score, 
               p.productivity_score, p.supervisor_score, p.project_score, p.special_incentive, p.penalty_deduction
        FROM bonus_recommendations b
        JOIN employees e ON b.employee_id = e.id
        LEFT JOIN performance_scores p ON b.score_id = p.id
        WHERE b.month = ? AND b.year = ?
        ORDER BY p.total_score DESC
      `);
      return stmt.all(month, year);
    } catch (error) {
      console.error('[IPC] engine:getRecommendations error:', error);
      throw error;
    }
  });

  // Delete Recommendation
  ipcMain.handle('engine:deleteRecommendation', async (event, data) => {
    try {
      const { recommendation_id } = data;
      const rec = db.prepare(`SELECT score_id FROM bonus_recommendations WHERE id = ?`).get(recommendation_id);
      if (rec && rec.score_id) {
        db.prepare(`DELETE FROM performance_scores WHERE id = ?`).run(rec.score_id);
      }
      db.prepare(`DELETE FROM bonus_recommendations WHERE id = ?`).run(recommendation_id);
      return { success: true };
    } catch (error) {
      console.error('[IPC] engine:deleteRecommendation error:', error);
      throw error;
    }
  });

  // Get employee performance history
  ipcMain.handle('engine:getEmployeeHistory', async (event, employeeId) => {
    try {
      const stmt = db.prepare(`
        SELECT p.*, b.recommended_bonus, b.approved_bonus, b.status as bonus_status
        FROM performance_scores p
        LEFT JOIN bonus_recommendations b ON p.id = b.score_id
        WHERE p.employee_id = ?
        ORDER BY p.year DESC, p.month DESC
      `);
      return stmt.all(employeeId);
    } catch (error) {
      console.error('[IPC] engine:getEmployeeHistory error:', error);
      throw error;
    }
  });

  // Get eligibility stats
  ipcMain.handle('engine:getEligibilityStats', async (event, data) => {
    try {
      const { month, year } = data;
      const activeEmployees = db.prepare("SELECT id FROM employees WHERE status = 'active'").all();
      const eligibility = {};

      activeEmployees.forEach(emp => {
        const result = checkEmployeeEligibility(db, emp.id, month, year);
        eligibility[emp.id] = {
          present_days: result.stats ? result.stats.present_days : 0,
          absences: result.stats ? result.stats.absences : 0,
          total_ot: result.stats ? result.stats.total_ot : 0,
          effective_days: result.stats ? result.stats.effective_days : 0,
          attendance_pct: result.stats ? result.stats.attendance_pct : 0,
          attendance_score: result.stats ? result.stats.attendance_score : 0,
          overtime_score: result.stats ? result.stats.overtime_score : 0,
          productivity_score: result.stats ? result.stats.productivity_score : 0,
          isEligible: result.isEligible,
          reason: result.isEligible ? '' : result.reasons.join(', ')
        };
      });

      return eligibility;
    } catch (error) {
      console.error('[IPC] engine:getEligibilityStats error:', error);
      throw error;
    }
  });

}

module.exports = { registerPerformanceHandlers };

