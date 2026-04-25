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
    const monthName = Helpers.monthName(s.currentMonth);

    return `
      <div style="margin-bottom:32px">
        <h2 style="margin-bottom:4px">Financial Ecosystem</h2>
        <p class="text-muted text-sm">Key performance indicators for ${monthName} ${s.currentYear}</p>
      </div>

      <!-- KPI Cards Layer 1: Operational -->
      <div class="grid-4" style="margin-bottom:24px">
        ${statCard('Total Employees', s.totalEmployees, 'accent', iconUsers(), `Active staff capacity`, 'nav-to-employees')}
        ${statCard('Pending Payouts', s.pendingCount, 'danger', iconClock(), `${s.paidThisMonth} already processed`, 'nav-to-payments')}
        ${statCard('Advances Issue', API.fmtRupees(s.thisMonthAdvances), 'warning', iconArrowOut(), `Disbursed in ${monthName}`, 'nav-to-advances')}
        ${statCard('Attendance', s.todayAttendance.presentNames.length, 'success', iconCheck(), `${s.todayAttendance.absentNames.length} absent today`, 'nav-to-attendance')}
      </div>

      <!-- KPI Cards Layer 2: Financial Deep Dive -->
      <div class="grid-3" style="margin-bottom:32px">
        ${statCard('Salary Paid', API.fmtRupees(s.totalPaidThisMonth), 'success', iconWallet(), `Net disbursed this month`, null)}
        ${statCard('Salary Balance', API.fmtRupees(s.salaryRemainingToPay), 'accent', iconCreditCard(), `Estimated remaining obligation`, null)}
        ${statCard('Outstanding Adv.', API.fmtRupees(s.outstandingAdvances), 'warning', iconHistory(), `Total un-deducted advances`, 'nav-to-advances')}
      </div>

      <div class="grid-3" style="margin-bottom:24px">
        
        <!-- Today's Attendance -->
        <div class="card">
          <div class="card-title">Daily Attendance Snapshot</div>
          <div style="font-size: 0.85rem; margin-bottom:12px">
            <div class="mb-2 flex justify-between">
              <span class="text-muted">Present:</span> 
              <span class="font-600 text-success">${s.todayAttendance.presentNames.length} members</span>
            </div>
            <div class="mb-2 flex justify-between">
              <span class="text-muted">Absent:</span> 
              <span class="font-600 text-danger">${s.todayAttendance.absentNames.length} members</span>
            </div>
          </div>
          <div style="margin-top:16px;margin-bottom:8px;font-size:0.85rem;font-weight:600;color:var(--text); text-transform:uppercase; letter-spacing:0.5px">Project Deployment</div>
          <div style="max-height:140px;overflow-y:auto">
            ${Object.keys(s.todayAttendance.projectSums).length === 0 
                ? '<div class="text-center p-4 text-muted text-sm border-dashed">No active deployments</div>' 
                : Object.entries(s.todayAttendance.projectSums).map(([proj, count]) => `
                  <div class="calc-row text-sm" style="padding:6px 0; border-bottom: 1px solid var(--border-soft)">
                    <span>${Helpers.escapeHtml(proj)}</span>
                    <span class="badge badge-accent" style="min-width:60px; text-align:center">${count} Staff</span>
                  </div>
                `).join('')
            }
          </div>
        </div>

        <!-- Month Financial Summary -->
        <div class="card">
          <div class="card-title">${monthName} ${s.currentYear} Overview</div>
          <div class="flex flex-col gap-3">
            <div class="flex justify-between items-center">
              <span class="text-muted text-sm">Total Scheduled Payroll</span>
              <span class="font-600">${API.fmtRupees(s.totalPayroll)}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-muted text-sm">Actual Paid (Net)</span>
              <span class="text-success font-600">${API.fmtRupees(s.totalPaidThisMonth)}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-muted text-sm">New Advances Issued</span>
              <span class="text-warning font-600">${API.fmtRupees(s.thisMonthAdvances)}</span>
            </div>
            <div style="height:1px; background:var(--border); margin:4px 0"></div>
             <div class="flex justify-between items-center">
              <span class="text-muted text-sm">Total Fund Outflow</span>
              <span class="font-600" style="font-size:1.1rem; color:var(--text)">${API.fmtRupees(s.totalPaidThisMonth + s.thisMonthAdvances)}</span>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="card">
          <div class="card-title">Operations</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button id="qa-add-employee" class="btn btn-ghost" style="justify-content:flex-start; height:44px">
              Add New Employee
            </button>
            <button id="qa-mark-attendance" class="btn btn-ghost" style="justify-content:flex-start; height:44px">
              Manage Attendance
            </button>
            <button id="qa-add-advance" class="btn btn-ghost" style="justify-content:flex-start; height:44px">
              Record New Advance
            </button>
            <button id="qa-process-salary" class="btn btn-primary" style="justify-content:flex-start; height:44px">
              Disburse Salaries
            </button>
          </div>
        </div>

      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-title">Recent Transactions</div>
          ${s.recentPayments.length === 0
            ? `<div class="empty-state"><p>No transactions found.</p></div>`
            : `<div class="activity-list">${s.recentPayments.map(p => `
              <div class="activity-item">
                <div class="activity-dot" style="background:var(--success)"></div>
                <div class="activity-body">
                  <div class="activity-text" style="font-weight:500">${Helpers.escapeHtml(p.employee_name)}
                    <span class="badge badge-success-soft" style="margin-left:6px; font-size:10px">${p.status.toUpperCase()}</span>
                  </div>
                  <div class="activity-time" style="font-size:11px">${API.fmtRupees(p.net_paid)} · ${Helpers.shortMonth(p.month)} ${p.year} · ${p.mode}</div>
                </div>
              </div>`).join('')}
            </div>`
          }
        </div>

        <div class="card">
          <div class="card-title">Recent Advances</div>
          ${s.recentAdvances.length === 0
            ? `<div class="empty-state"><p>No advance activity.</p></div>`
            : `<div class="activity-list">${s.recentAdvances.map(a => `
              <div class="activity-item">
                <div class="activity-dot" style="background:var(--warning)"></div>
                <div class="activity-body">
                  <div class="activity-text" style="font-weight:500">${Helpers.escapeHtml(a.employee_name)}</div>
                  <div class="activity-time" style="font-size:11px">${API.fmtRupees(a.amount)} · ${a.mode} · ${Helpers.formatDateShort(a.date)}</div>
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
          <div class="stat-value" style="font-size:1.4rem">${value}</div>
          <div class="stat-sub">${sub}</div>
        </div>
      </div>
    `;
  }

  // ── Icons (SVG) ───────────────────────────────────────────────────────────
  function iconUsers()     { return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`; }
  function iconClock()     { return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`; }
  function iconArrowOut()  { return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 6l-9.5 9.5-5-5L1 18"></path><path d="M17 6h6v6"></path></svg>`; }
  function iconCheck()     { return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`; }
  function iconWallet()    { return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>`; }
  function iconCreditCard(){ return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>`; }
  function iconHistory()   { return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>`; }

  function bindEvents(s) {
    document.getElementById('nav-to-employees')?.addEventListener('click', () => Router.navigate('employees'));
    document.getElementById('nav-to-advances')?.addEventListener('click',  () => Router.navigate('advances'));
    document.getElementById('nav-to-payments')?.addEventListener('click',  () => Router.navigate('payments'));
    document.getElementById('nav-to-attendance')?.addEventListener('click',() => Router.navigate('attendance'));

    document.getElementById('qa-add-employee')?.addEventListener('click',   () => { Router.navigate('employees');  setTimeout(() => document.getElementById('add-employee-btn')?.click(), 200); });
    document.getElementById('qa-mark-attendance')?.addEventListener('click', () => Router.navigate('attendance'));
    document.getElementById('qa-add-advance')?.addEventListener('click',    () => { Router.navigate('advances');   setTimeout(() => document.getElementById('add-advance-btn')?.click(), 200); });
    document.getElementById('qa-process-salary')?.addEventListener('click', () => Router.navigate('payments'));
  }

  return { init };
})();
