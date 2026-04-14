/**
 * LocalPayroll — Dashboard Page
 * KPI cards, recent activity feed, quick-action buttons.
 * Re-renders whenever EventBus emits 'data:refresh'.
 */

const DashboardPage = (() => {
  const container = () => document.getElementById('page-dashboard');
  let _unsubscribe = null;

  // ── Init ─────────────────────────────────────────────────────────────────
  async function init() {
    container().innerHTML = renderSkeleton();
    // Subscribe to data changes so dashboard auto-refreshes
    if (_unsubscribe) _unsubscribe();
    _unsubscribe = EventBus.on('data:refresh', load);
    await load();
  }

  // ── Load & render ────────────────────────────────────────────────────────
  async function load() {
    const res = await API.getDashboardStats();
    if (!res.success) { container().innerHTML = `<p class="text-muted">Failed to load dashboard.</p>`; return; }
    const s = res.stats;
    container().innerHTML = renderDashboard(s);
    bindEvents(s);
  }

  // ── Skeleton loader ──────────────────────────────────────────────────────
  function renderSkeleton() {
    return `
      <div class="grid-4" style="margin-bottom:24px">
        ${[1,2,3,4].map(() => `<div class="stat-card"><div class="skeleton" style="width:100%;height:80px;border-radius:8px"></div></div>`).join('')}
      </div>
      <div class="grid-2">
        ${[1,2].map(() => `<div class="card"><div class="skeleton" style="width:100%;height:200px;border-radius:8px"></div></div>`).join('')}
      </div>
    `;
  }

  // ── Main render ─────────────────────────────────────────────────────────
  function renderDashboard(s) {
    const pendingPayroll = (s.totalPayroll || 0) - (s.paidThisMonth * 0); // approx

    return `
      <!-- KPI Cards -->
      <div class="grid-4" style="margin-bottom:24px">
        ${statCard('Total Employees', s.totalEmployees, 'accent', '👥', `Active employees`, 'nav-to-employees')}
        ${statCard('Monthly Payroll', API.fmtRupees(s.totalPayroll), 'success', '💰', `Total this month`, null)}
        ${statCard('Advances Given', API.fmtRupees(s.thisMonthAdvances), 'warning', '📤', `${Helpers.monthName(s.currentMonth)} ${s.currentYear}`, 'nav-to-advances')}
        ${statCard('Pending Payouts', s.pendingCount, 'danger', '⏳', `Not yet paid this month`, 'nav-to-payments')}
      </div>

      <!-- Quick Actions + Activity -->
      <div class="grid-2" style="margin-bottom:24px">
        <!-- Quick Actions -->
        <div class="card">
          <div class="card-title">Quick Actions</div>
          <div style="display:flex;flex-direction:column;gap:10px">
            <button id="qa-add-employee" class="btn btn-secondary" style="justify-content:flex-start;gap:14px">
              <span style="font-size:1.2rem">👤</span> Add New Employee
            </button>
            <button id="qa-mark-attendance" class="btn btn-secondary" style="justify-content:flex-start;gap:14px">
              <span style="font-size:1.2rem">📅</span> Mark Today's Attendance
            </button>
            <button id="qa-add-advance" class="btn btn-secondary" style="justify-content:flex-start;gap:14px">
              <span style="font-size:1.2rem">💸</span> Record Advance
            </button>
            <button id="qa-process-salary" class="btn btn-secondary" style="justify-content:flex-start;gap:14px">
              <span style="font-size:1.2rem">✅</span> Process Salary Payments
            </button>
          </div>
        </div>

        <!-- Month Overview -->
        <div class="card">
          <div class="card-title">${Helpers.monthName(s.currentMonth)} ${s.currentYear} — Overview</div>
          <div>
            <div class="calc-row">
              <span>Total Employees</span>
              <span class="font-600">${s.totalEmployees}</span>
            </div>
            <div class="calc-row">
              <span>Already Paid</span>
              <span class="badge badge-success">${s.paidThisMonth}</span>
            </div>
            <div class="calc-row">
              <span>Pending</span>
              <span class="badge badge-warning">${s.pendingCount}</span>
            </div>
            <div class="calc-row">
              <span>Total Payroll</span>
              <span class="amount amount-success">${API.fmtRupees(s.totalPayroll)}</span>
            </div>
            <div class="calc-row">
              <span>Advances This Month</span>
              <span class="amount amount-warning">${API.fmtRupees(s.thisMonthAdvances)}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="grid-2">
        <!-- Recent Payments -->
        <div class="card">
          <div class="card-title">Recent Payments</div>
          ${s.recentPayments.length === 0
            ? `<div class="empty-state" style="padding:30px"><p>No payments recorded yet.</p></div>`
            : `<div class="activity-list">${s.recentPayments.map(p => `
              <div class="activity-item">
                <div class="activity-dot" style="background:var(--success)"></div>
                <div class="activity-body">
                  <div class="activity-text">${Helpers.escapeHtml(p.employee_name)}
                    <span class="badge badge-success" style="margin-left:6px">${p.status.toUpperCase()}</span>
                  </div>
                  <div class="activity-time">${API.fmtRupees(p.net_paid)} · ${Helpers.shortMonth(p.month)} ${p.year} · ${p.mode}</div>
                </div>
              </div>`).join('')}
            </div>`
          }
        </div>

        <!-- Recent Advances -->
        <div class="card">
          <div class="card-title">Recent Advances</div>
          ${s.recentAdvances.length === 0
            ? `<div class="empty-state" style="padding:30px"><p>No advances recorded yet.</p></div>`
            : `<div class="activity-list">${s.recentAdvances.map(a => `
              <div class="activity-item">
                <div class="activity-dot" style="background:var(--warning)"></div>
                <div class="activity-body">
                  <div class="activity-text">${Helpers.escapeHtml(a.employee_name)}</div>
                  <div class="activity-time">${API.fmtRupees(a.amount)} · ${a.mode} · ${Helpers.formatDate(a.date)}</div>
                </div>
              </div>`).join('')}
            </div>`
          }
        </div>
      </div>
    `;
  }

  function statCard(label, value, type, icon, sub, navId) {
    return `
      <div class="stat-card ${type}" ${navId ? `id="${navId}" style="cursor:pointer"` : ''}>
        <div class="stat-icon ${type}">${icon}</div>
        <div class="stat-body">
          <div class="stat-label">${label}</div>
          <div class="stat-value">${value}</div>
          <div class="stat-sub">${sub}</div>
        </div>
      </div>
    `;
  }

  function bindEvents(s) {
    document.getElementById('nav-to-employees')?.addEventListener('click', () => Router.navigate('employees'));
    document.getElementById('nav-to-advances')?.addEventListener('click',  () => Router.navigate('advances'));
    document.getElementById('nav-to-payments')?.addEventListener('click',  () => Router.navigate('payments'));

    document.getElementById('qa-add-employee')?.addEventListener('click',   () => { Router.navigate('employees');  setTimeout(() => document.getElementById('add-employee-btn')?.click(), 200); });
    document.getElementById('qa-mark-attendance')?.addEventListener('click', () => Router.navigate('attendance'));
    document.getElementById('qa-add-advance')?.addEventListener('click',    () => { Router.navigate('advances');   setTimeout(() => document.getElementById('add-advance-btn')?.click(), 200); });
    document.getElementById('qa-process-salary')?.addEventListener('click', () => Router.navigate('payments'));
  }

  return { init };
})();
