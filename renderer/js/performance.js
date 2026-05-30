// Automated Performance Bonus Engine - Frontend Module

const PerformancePage = (() => {

let currentMonth = new Date().getMonth() + 1;
let currentYear = new Date().getFullYear();
let currentView = 'dashboard'; // dashboard, engine, approvals
let employees = [];
let recommendations = [];

function initPerformance() {
  const container = document.getElementById('page-performance');
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
      <div class="tabs" style="display:flex; gap:10px;">
        <button class="btn ${currentView === 'dashboard' ? 'btn-primary' : 'btn-outline'} perf-tab-btn" data-view="dashboard">Dashboard</button>
        <button class="btn ${currentView === 'engine' ? 'btn-primary' : 'btn-outline'} perf-tab-btn" data-view="engine">Run Engine</button>
        <button class="btn ${currentView === 'approvals' ? 'btn-primary' : 'btn-outline'} perf-tab-btn" data-view="approvals">Approvals</button>
      </div>
      <div style="display:flex; gap:10px; align-items:center;">
        <select id="perf-month" class="form-input" style="width: 120px;">
          <option value="1">January</option><option value="2">February</option><option value="3">March</option>
          <option value="4">April</option><option value="5">May</option><option value="6">June</option>
          <option value="7">July</option><option value="8">August</option><option value="9">September</option>
          <option value="10">October</option><option value="11">November</option><option value="12">December</option>
        </select>
        <select id="perf-year" class="form-input" style="width: 100px;">
          <option value="2025">2025</option><option value="2026">2026</option><option value="2027">2027</option>
        </select>
      </div>
    </div>
    
    <div id="perf-content"></div>
  `;

  document.getElementById('perf-month').value = currentMonth;
  document.getElementById('perf-year').value = currentYear;

  document.getElementById('perf-month').addEventListener('change', (e) => {
    currentMonth = parseInt(e.target.value);
    refreshView();
  });
  document.getElementById('perf-year').addEventListener('change', (e) => {
    currentYear = parseInt(e.target.value);
    refreshView();
  });

  document.querySelectorAll('.perf-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      currentView = e.target.dataset.view;
      initPerformance(); // re-render tabs
    });
  });

  refreshView();
}

async function refreshView() {
  const content = document.getElementById('perf-content');
  content.innerHTML = '<div class="text-center" style="padding:40px;">Loading Engine Data...</div>';
  
  try {
    recommendations = await window.electronAPI.getRecommendations({ month: currentMonth, year: currentYear });
    
    if (currentView === 'dashboard') {
      renderDashboard(content);
    } else if (currentView === 'engine') {
      const res = await window.electronAPI.getEmployees();
      employees = Array.isArray(res) ? res : (res && res.employees) ? res.employees : [];
      if (!Array.isArray(employees)) { throw new Error('getEmployees did not return an array: ' + JSON.stringify(res)); }
      renderEngine(content);
    } else if (currentView === 'approvals') {
      renderApprovals(content);
    }
  } catch (err) {
    content.innerHTML = `<div class="text-danger">Error: ${err.message}</div>`;
  }
}

function renderDashboard(content) {
  const topPerformers = recommendations.filter(r => r.total_score >= 81).sort((a,b) => b.total_score - a.total_score).slice(0, 5);
  const pendingCount = recommendations.filter(r => r.status === 'Pending Approval').length;
  
  let totalBonusCost = recommendations.filter(r => r.status === 'Paid' || r.status === 'Approved').reduce((sum, r) => sum + (r.approved_bonus || r.recommended_bonus), 0);

  let html = `
    <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom:20px;">
      <div class="card" style="border-left: 4px solid var(--warning);">
        <div class="text-sm text-muted">Pending Approvals</div>
        <div style="font-size: 2rem; font-weight: bold; color: var(--warning);">${pendingCount}</div>
      </div>
      <div class="card" style="border-left: 4px solid var(--success);">
        <div class="text-sm text-muted">Approved Bonus Cost</div>
        <div style="font-size: 2rem; font-weight: bold; color: var(--success);">₹${(totalBonusCost/100).toFixed(2)}</div>
      </div>
      <div class="card" style="border-left: 4px solid var(--primary);">
        <div class="text-sm text-muted">Top Performers (81+)</div>
        <div style="font-size: 2rem; font-weight: bold; color: var(--primary);">${topPerformers.length}</div>
      </div>
    </div>
    
    <div class="card">
      <h3 style="margin-bottom:15px; display:flex; align-items:center; gap:8px;">
        <span style="color: gold;">🏆</span> Leaderboard
      </h3>
      `;
      
      if (topPerformers.length === 0) {
        html += `<div class="text-muted text-center" style="padding:20px;">No top performers found for this month yet. Run the engine!</div>`;
      } else {
        html += `<table class="table">
          <thead><tr><th>Rank</th><th>Employee</th><th>Score</th><th>Recommended Bonus</th></tr></thead>
          <tbody>`;
        topPerformers.forEach((p, idx) => {
          html += `<tr>
            <td>#${idx+1}</td>
            <td style="font-weight:bold;">${Helpers.escapeHtml(p.employee_name)}</td>
            <td><span class="badge" style="background:var(--success); color:white;">${p.total_score} / 100</span></td>
            <td>₹${(p.recommended_bonus/100).toFixed(2)}</td>
          </tr>`;
        });
        html += `</tbody></table>`;
      }

  html += `</div>`;
  content.innerHTML = html;
}

function renderEngine(content) {
  let html = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
        <h3>Run Bonus Engine</h3>
        <button class="btn btn-primary" id="btn-run-all">Auto-Run For All Active</button>
      </div>
      <p class="text-muted" style="margin-bottom: 20px;">Input supervisor scores manually or run the automated engine which pulls Attendance and OT data to calculate scores.</p>
      
      <table class="table">
        <thead>
          <tr>
            <th>Employee</th>
            <th width="120">Productivity (0-20)</th>
            <th width="120">Supervisor (0-20)</th>
            <th width="120">Project (0-20)</th>
            <th width="120">Penalty (0-20)</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
  `;

  employees.filter(e => e.status === 'active').forEach(emp => {
    html += `
      <tr>
        <td><strong>${Helpers.escapeHtml(emp.name)}</strong><br><span class="text-sm text-muted">${emp.role || 'Staff'}</span></td>
        <td><input type="number" id="prod-${emp.id}" class="form-input" min="0" max="20" value="15"></td>
        <td><input type="number" id="sup-${emp.id}" class="form-input" min="0" max="20" value="15"></td>
        <td><input type="number" id="proj-${emp.id}" class="form-input" min="0" max="20" value="10"></td>
        <td><input type="number" id="pen-${emp.id}" class="form-input" min="0" max="20" value="0"></td>
        <td><button class="btn btn-sm btn-secondary run-single-btn" data-id="${emp.id}">Run Engine</button></td>
      </tr>
    `;
  });

  html += `</tbody></table></div>`;
  content.innerHTML = html;

  content.querySelectorAll('.run-single-btn').forEach(btn => {
    btn.addEventListener('click', () => runEngineForEmployee(btn.dataset.id));
  });
  content.getElementById('btn-run-all').addEventListener('click', async () => {
    const activeEmps = employees.filter(e => e.status === 'active');
    let successCount = 0;
    for (let emp of activeEmps) {
      await runEngineForEmployee(emp.id, false);
      successCount++;
    }
    Toast.success(`Successfully ran engine for ${successCount} employees.`);
  });
}

async function runEngineForEmployee(empId, showToast = true) {
  try {
    const prod = parseInt(document.getElementById(`prod-${empId}`).value) || 0;
    const sup = parseInt(document.getElementById(`sup-${empId}`).value) || 0;
    const proj = parseInt(document.getElementById(`proj-${empId}`).value) || 0;
    const pen = parseInt(document.getElementById(`pen-${empId}`).value) || 0;

    const res1 = await window.electronAPI.calculateScores({
      employee_id: empId, month: currentMonth, year: currentYear,
      productivity_score: prod, supervisor_score: sup, project_score: proj, penalty_deduction: pen, remarks: 'Auto-calculated'
    });
    
    const res2 = await window.electronAPI.generateRecommendations({
      employee_id: empId, month: currentMonth, year: currentYear, score_id: res1.score_id, total_score: res1.total_score
    });

    if (showToast) {
      Toast.success(`Engine ran! Score: ${res1.total_score}. Rec Bonus: ₹${(res2.recommended_bonus/100).toFixed(2)}`);
    }
  } catch (err) {
    if (showToast) Toast.error(`Failed to run engine: ${err.message}`);
    console.error(err);
  }
}

function renderApprovals(content) {
  let html = `
    <div class="card">
      <h3 style="margin-bottom:15px;">Pending & Processed Approvals</h3>
      <table class="table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Score</th>
            <th>Recommended</th>
            <th>Approved Amount</th>
            <th>Decision</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
  `;

  if (recommendations.length === 0) {
    html += `<tr><td colspan="6" class="text-center text-muted">No recommendations generated. Run the engine first.</td></tr>`;
  }

  recommendations.forEach(r => {
    let statusColor = 'var(--text-muted)';
    if (r.status === 'Approved' || r.status === 'Paid') statusColor = 'var(--success)';
    if (r.status === 'Held') statusColor = 'var(--warning)';
    if (r.status === 'Rejected') statusColor = 'var(--danger)';

    const isPending = r.status === 'Pending Approval';

    html += `
      <tr>
        <td><strong>${Helpers.escapeHtml(r.employee_name)}</strong></td>
        <td>
          <span style="font-weight:bold; color: ${r.total_score >= 81 ? 'var(--primary)' : r.total_score >= 61 ? 'var(--success)' : r.total_score >= 41 ? 'var(--warning)' : 'var(--danger)'}">
            ${r.total_score}/100
          </span>
        </td>
        <td>₹${(r.recommended_bonus/100).toFixed(2)}</td>
        <td>
          <input type="number" id="amt-${r.id}" class="form-input" style="width:100px; padding:4px;" value="${(r.recommended_bonus/100).toFixed(2)}" ${!isPending ? 'disabled' : ''}>
        </td>
        <td>
          ${isPending ? `
            <div style="display:flex; gap:5px;">
              <button class="btn btn-sm btn-primary app-btn" data-id="${r.id}" data-action="pay" title="Approve & Pay">Pay</button>
              <button class="btn btn-sm btn-outline app-btn" data-id="${r.id}" data-action="hold" title="Hold for later">Hold</button>
              <button class="btn btn-sm btn-danger app-btn" data-id="${r.id}" data-action="reject" title="Reject entirely">Reject</button>
            </div>
          ` : `<span class="text-muted">Processed</span>`}
        </td>
        <td><span class="badge" style="background: ${statusColor}; color:white;">${r.status}</span></td>
      </tr>
    `;
  });

  html += `</tbody></table></div>`;
  content.innerHTML = html;

  content.querySelectorAll('.app-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const recId = btn.dataset.id;
      const action = btn.dataset.action;
      const amtEl = document.getElementById(`amt-${recId}`);
      const finalAmt = Math.round(parseFloat(amtEl.value) * 100);

      try {
        await window.electronAPI.approveBonus({
          recommendation_id: recId,
          action: action,
          final_amount: finalAmt,
          user_id: AppState.get('user').id
        });
        Toast.success(`Bonus marked as ${action}`);
        refreshView(); // reload to reflect status change
      } catch(err) {
        Toast.error(err.message);
      }
    });
  });
}

  return { init: initPerformance };
})();
