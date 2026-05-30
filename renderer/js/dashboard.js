/**
 * LocalPayroll — Dashboard Page (V3 Enterprise Redesign)
 * Premium monitoring hub for financial workforce management.
 */

const DashboardPage = (() => {
  const container = () => document.getElementById('page-dashboard');
  let _unsubscribe = null;
  let _charts = [];

  // ── Init ─────────────────────────────────────────────────────────────────
  async function init() {
    container().innerHTML = renderSkeleton();
    if (_unsubscribe) _unsubscribe();
    _unsubscribe = EventBus.on('data:refresh', load);
    
    // Ensure fresh alerts
    window.API.runAlertRules();
    await load();
  }

  // ── Load Data ────────────────────────────────────────────────────────────
  async function load() {
    try {
      const res = await API.getDashboardStats();
      if (!res.success) {
        container().innerHTML = `<div class="p-6 text-center"><p class="text-danger">Failed to load dashboard data: ${res.error || 'Unknown Error'}</p></div>`;
        return;
      }
      
      const s = res.stats;
      container().innerHTML = renderDashboard(s);
      
      // Cleanup & Re-init Charts
      _charts.forEach(c => c.destroy());
      _charts = [];
      setTimeout(() => initCharts(s), 50);
      
      // Check for pending attendance sign-off
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayIso = Helpers.todayIso(yesterday);
      const pendingRes = await API.checkPendingFinalization(yesterdayIso);
      const alertArea = document.getElementById('db-alert-area');
      if (alertArea && pendingRes.success && pendingRes.pendingCount > 0) {
        alertArea.innerHTML = `
          <div class="alert alert-warning mb-4 flex justify-between align-center" style="border-radius:16px; border:none; background: linear-gradient(135deg, #fffbeb, #fef3c7); box-shadow: 0 4px 12px rgba(245, 158, 11, 0.1); padding: 16px 24px">
            <div class="flex align-center gap-3">
              <div style="font-size: 1.5rem">⚠️</div>
              <div>
                <strong style="color: #92400e">Yesterday Attendance Pending Finalization</strong>
                <div class="text-sm" style="color: #b45309">${pendingRes.pendingCount} staff members need sign-off for ${Helpers.formatDate(yesterdayIso)}</div>
              </div>
            </div>
            <button class="btn btn-primary" id="db-finalize-btn" style="background: #d97706; border: none; border-radius: 12px; font-weight: 600">👉 Finalize Now</button>
          </div>
        `;
        document.getElementById('db-finalize-btn').addEventListener('click', async () => {
          const res = await API.finalizeAttendance(yesterdayIso);
          if (res.success) {
             Toast.success('Attendance finalized successfully!');
             load();
          } else {
             Toast.error(res.error);
          }
        });
      }

      // Interactions
      bindEvents(s);
      animateMetrics();
    } catch (err) {
      console.error('[Dashboard V3] Render error:', err);
    }
  }

  // ── Skeleton Loader ──────────────────────────────────────────────────────
  function renderSkeleton() {
    return `
      <div class="db-v3-root">
        <div class="db-header-v3">
          <div class="skeleton" style="width:300px; height:40px; border-radius:12px"></div>
          <div class="skeleton" style="width:200px; height:60px; border-radius:16px"></div>
        </div>
        <div class="db-kpi-grid-v3">
          ${[1,2,3,4,5,6].map(() => `<div class="skeleton" style="height:140px; border-radius:20px"></div>`).join('')}
        </div>
        <div class="db-main-grid-v3">
          <div class="skeleton" style="height:400px; border-radius:24px"></div>
          <div class="skeleton" style="height:400px; border-radius:24px"></div>
          <div class="skeleton" style="height:400px; border-radius:24px"></div>
        </div>
      </div>
    `;
  }

  // ── Dashboard Renderer ───────────────────────────────────────────────────
  function renderDashboard(s) {
    const user = AppState.get('user');
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
    
    const att = s.todayAttendance;
    const pPercent = att.total > 0 ? Math.round((att.present / att.total) * 100) : 0;
    const lPercent = att.total > 0 ? Math.round((att.onLeave / att.total) * 100) : 0;
    const aPercent = att.total > 0 ? Math.round((att.absent / att.total) * 100) : 0;

    return `
      <div class="db-v3-root">
        <div id="db-alert-area"></div>
        
        <!-- PREMIUM HEADER -->
        <div class="db-header-v3">
          <div class="db-greeting">
            <h1 id="header_greeting">${greeting}, ${user?.fullName?.split(' ')[0] || 'Administrator'} 👋</h1>
            <p id="header_sub">Here's what's happening in your organization today.</p>
          </div>
          
          <div class="date-widget-v3" id="date_widget">
            <div class="ico">📅</div>
            <div class="details">
              <span class="date">${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              <span class="day">${now.toLocaleDateString('en-US', { weekday: 'long' })}</span>
            </div>
          </div>
        </div>

        <!-- KPI SUMMARY CARDS (V3) -->
        <div class="db-kpi-grid-v3">
          ${kpiCard('Total Employees', s.totalEmployees, `+${s.totalEmployeesTrend} this month`, 'blue', '👥', 'up', 'nav-to-employees')}
          ${kpiCard('Present Today', att.present, `${pPercent}% of total`, 'green', '✅', 'none', 'nav-to-attendance-kpi')}
          ${kpiCard('On Leave', att.onLeave, `${lPercent}% of total`, 'orange', '🏖️', 'none', 'nav-to-leaves-kpi')}
          ${kpiCard('Absent Today', att.absent, `${aPercent}% of total`, 'red', '🚫', 'none', 'nav-to-absents-kpi')}
          ${kpiCard('Pending Approvals', s.pendingApprovals.total, 'Action required', 'purple', '📝', 'none', 'nav-to-alerts-kpi')}
          ${kpiCard('Outstanding Advances', API.fmtRupees(s.outstandingAdvances), 'Outstanding balance', 'pink', '₹', 'none', 'nav-to-advances-kpi')}
        </div>

        <!-- ANALYTICS GRID -->
        <div class="db-main-grid-v3">
          
          <!-- Attendance Overview -->
          <div class="premium-card-v3">
            <div class="card-header-v3">
              <h3>Attendance Overview</h3>
            </div>
            <div class="donut-box-v3">
              <canvas id="chart-attendance-donut"></canvas>
              <div class="center-label">
                <div class="val">${att.total}</div>
                <div class="lbl">Total</div>
              </div>
            </div>
            <div class="db-legend-v3">
              ${legendItemV3('#10b981', 'Present Today', att.present, `${pPercent}%`)}
              ${legendItemV3('#f59e0b', 'Staff on Leave', att.onLeave, `${lPercent}%`)}
              ${legendItemV3('#ef4444', 'Absent Count', att.absent, `${aPercent}%`)}
            </div>
          </div>

          <!-- Labour Cost by Project (EXACT MOCKUP STYLE) -->
          <div class="premium-card-v3">
            <div class="card-header-v3">
              <h3>Labor Cost by Project</h3>
              <div class="pill-button">
                 <span>This Month</span>
                 <span>▼</span>
              </div>
            </div>
            <div class="labour-cost-list-v3">
              ${(s.labourCostByProject || []).length === 0 
                ? '<p class="text-center text-muted p-10">No financial data for current month.</p>'
                : s.labourCostByProject.map((p, idx) => renderLabourCostItem(p, idx)).join('')}
            </div>
          </div>

          <!-- Alerts & Reminders -->
          <div class="premium-card-v3">
            <div class="card-header-v3">
              <h3>Alerts & Reminders</h3>
              <div class="view-alerts-link" id="view_alerts">View All Alerts →</div>
            </div>
            <div class="alerts-grid-v3">
              ${alertItemV3('Attendance Corrections', s.pendingApprovals.corrections || 0, 'red', '⚠️', 'alert-att')}
              ${alertItemV3('Missing Site Reports', s.siteReportsSummary.pending || 0, 'orange', '📝', 'alert-site')}
              ${alertItemV3('Pending OCR Documents', s.docsSummary.pending || 0, 'blue', '📄', 'alert-docs')}
              ${alertItemV3('Leave Requests', s.pendingApprovals.leaves || 0, 'green', '🏖️', 'alert-leaves')}
              ${alertItemV3('Allowance Approvals', s.pendingApprovals.expenses || 0, 'purple', '💰', 'alert-exp')}
            </div>
          </div>

        </div>

        <!-- QUICK SUMMARY CARDS -->
        <div class="db-bottom-grid-v3">
          ${summaryCardV3('Pending Leaves', s.pendingApprovals.leaves, 'orange', '🏖️', 'nav-mini-leaves')}
          ${summaryCardV3('Pending Allowances', s.pendingApprovals.expenses, 'blue', '💸', 'nav-mini-expenses')}
          ${summaryCardV3('Pending Advances', s.pendingApprovals.advances, 'purple', '💰', 'nav-mini-advances')}
          ${summaryCardV3('Pending Payroll', s.pendingApprovals.payroll, 'green', '🏦', 'nav-mini-payroll')}
        </div>

      </div>
    `;
  }

  // ── Components ───────────────────────────────────────────────────────────
  function kpiCard(title, val, sub, color, ico, trendDir, id) {
    const tIcon = trendDir === 'up' ? '↑' : trendDir === 'down' ? '↓' : '';
    return `
      <div class="kpi-card-v3 ${color}" ${id ? `id="${id}" style="cursor:pointer"` : ''}>
        <div class="icon-box">${ico}</div>
        <div class="title">${title}</div>
        <div class="metric anim-count" data-val="${val}">${val}</div>
        <div class="footer">
          <span class="sub">${sub}</span>
          ${trendDir !== 'none' ? `<span class="trend ${trendDir}">${tIcon} 12%</span>` : ''}
        </div>
      </div>
    `;
  }

  function legendItemV3(color, lbl, val, pct) {
    return `
      <div class="legend-item-v3">
        <div class="legend-info">
          <div class="dot" style="background: ${color}"></div>
          <span>${lbl}</span>
        </div>
        <div class="flex items-center gap-2">
          <span style="font-weight:800; color:#0f172a">${val}</span>
          <span class="legend-badge">${pct}</span>
        </div>
      </div>
    `;
  }

  function alertItemV3(lbl, count, color, ico, id) {
    return `
      <div class="alert-card-v3 ${color}" id="${id}">
        <div class="ico">${ico}</div>
        <span class="label">${lbl}</span>
        <span class="badge">${count}</span>
      </div>
    `;
  }

  function summaryCardV3(lbl, val, color, ico, id) {
    return `
      <div class="summary-card-v3 ${color}" ${id ? `id="${id}" style="cursor:pointer"` : ''}>
        <div class="ico-box">${ico}</div>
        <div class="info">
          <span class="lbl">${lbl}</span>
          <span class="val anim-count" data-val="${val}">${val}</span>
        </div>
      </div>
    `;
  }

  function renderLabourCostItem(p, idx) {
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4'];
    const color = colors[idx % colors.length];
    return `
      <div class="labour-cost-item-v3">
        <div class="top-row">
          <span class="proj-name">${p.name}</span>
          <span class="proj-cost">${API.fmtRupees(p.cost)}</span>
        </div>
        <div class="progress-row">
          <div class="progress-track">
            <div class="progress-fill" style="width: ${p.progress}%; background: ${color};"></div>
          </div>
          <span class="percent">${p.progress}%</span>
        </div>
      </div>
    `;
  }

  // ── Charts & Animation ───────────────────────────────────────────────────
  function initCharts(s) {
    const ctxD = document.getElementById('chart-attendance-donut')?.getContext('2d');
    if (ctxD) {
      _charts.push(new Chart(ctxD, {
        type: 'doughnut',
        data: {
          datasets: [{
            data: [s.todayAttendance.present, s.todayAttendance.onLeave, s.todayAttendance.absent],
            backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
            borderWidth: 0, cutout: '82%', borderRadius: 4
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      }));
    }
  }

  function animateMetrics() {
    document.querySelectorAll('.anim-count').forEach(el => {
      const target = parseFloat(el.dataset.val.toString().replace(/[^0-9.]/g, ''));
      if (isNaN(target)) return;
      let curr = 0;
      const step = target / 20;
      const timer = setInterval(() => {
        curr += step;
        if (curr >= target) {
          el.innerText = el.dataset.val;
          clearInterval(timer);
        } else {
          el.innerText = Math.round(curr).toLocaleString();
        }
      }, 30);
    });
  }

  function bindEvents(s) {
    const nav = (p) => Router.navigate(p);
    
    // KPI Cards - Integrated Smart Navigation for Approvals
    ['employees', 'attendance-kpi', 'leaves-kpi', 'absents-kpi', 'alerts-kpi', 'advances-kpi'].forEach(id => {
      document.getElementById(`nav-to-${id}`)?.addEventListener('click', () => {
         if (id === 'alerts-kpi' && s.pendingApprovals.total > 0) {
            // Smart routing: Go to the specific module that has pending items
            const p = s.pendingApprovals;
            if (p.corrections > 0) return nav('attendance'); // Go to corrections tab
            if (p.leaves > 0) return nav('leaves');
            if (p.expenses > 0) return nav('expenses');
            if (p.payroll > 0) return nav('payments');
         }
         
         const map = { 
           'attendance-kpi': 'attendance', 
           'leaves-kpi': 'leaves', 
           'absents-kpi': 'attendance', 
           'alerts-kpi': 'alerts', 
           'advances-kpi': 'advances' 
         };
         nav(map[id] || id);
      });
    });

    // Alerts
    document.getElementById('view_alerts')?.addEventListener('click', () => nav('alerts'));
    document.getElementById('alert-att')?.addEventListener('click', () => nav('attendance'));
    document.getElementById('alert-site')?.addEventListener('click', () => nav('projects'));
    document.getElementById('alert-docs')?.addEventListener('click', () => nav('staff-docs'));
    document.getElementById('alert-leaves')?.addEventListener('click', () => nav('leaves'));
    document.getElementById('alert-exp')?.addEventListener('click', () => nav('expenses'));

    // Mini Cards
    ['leaves', 'expenses', 'advances', 'payroll'].forEach(id => {
       document.getElementById(`nav-mini-${id}`)?.addEventListener('click', () => {
         const map = { payroll: 'payments' };
         nav(map[id] || id);
       });
    });
  }

  return { init };
})();
