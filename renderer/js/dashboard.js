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
    // Run alert rules on dashboard load to keep data fresh
    window.API.runAlertRules();
    await load();
  }

  // ── Load & render ────────────────────────────────────────────────────────
  async function load() {
    try {
      const res = await API.getDashboardStats();
      if (!res.success) { 
        container().innerHTML = `<div class="p-6 text-center"><p class="text-danger">Failed to load dashboard data: ${res.error || 'Unknown Error'}</p></div>`; 
        return; 
      }
      const s = res.stats;
      container().innerHTML = renderDashboard(s);
      bindEvents(s);
    } catch (err) {
      console.error('[Dashboard] Render error:', err);
      container().innerHTML = `<div class="p-6 text-center"><p class="text-danger">Dashboard Render Error: ${err.message}</p></div>`;
    }
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
    const presentCount = s.todayAttendance.presentNames.length;
    const absentCount = s.todayAttendance.absentNames.length;
    const totalStaff = s.totalEmployees;
    const presentPercent = totalStaff > 0 ? Math.round((presentCount / totalStaff) * 100) : 0;
    const absentPercent = totalStaff > 0 ? Math.round((absentCount / totalStaff) * 100) : 0;

    return `
      <!-- TOP KPI CARDS -->
      <div class="dashboard-kpi-grid">
        ${kpiCard('Employees', totalStaff, 'Total Employees', 'blue', iconUsers())}
        ${kpiCard("Today's Attendance", `${presentCount} / ${totalStaff}`, 'Present / Total', 'green', iconCheck(), `${presentPercent}% Present`, 'nav-to-attendance')}
        ${kpiCard('Absent', absentCount, 'Employees', 'red', iconArrowOut(), `${absentPercent}% Absent`, 'nav-to-absents')}
        ${kpiCard('Outstanding Advances', API.fmtRupees(s.outstandingAdvances), 'Total Amount', 'orange', iconWallet(), 'View Details &rarr;', 'nav-to-advances')}
        ${kpiCard('Salary Paid', API.fmtRupees(s.totalPaidThisMonth), `${monthName} Payroll`, 'teal', iconCreditCard(), 'View Details &rarr;', 'nav-to-payments')}
      </div>

      <!-- MIDDLE ROW: OVERVIEWS -->
      <div class="dashboard-middle-grid">
        
        <!-- Month Overview -->
        <div class="db-card" style="min-height: 380px;">
          <div class="db-card-header">
            <h3>${monthName} ${s.currentYear} Overview</h3>
          </div>
          <div class="db-card-body flex-col-center" style="padding: 32px 24px; justify-content: center;">
            <div class="overview-stats-list" style="gap: 20px;">
              <div class="overview-stat" style="padding: 16px 20px;">
                <span class="label" style="font-size: 14px;">Total Scheduled Payroll</span>
                <span class="val" style="font-size: 16px;">${API.fmtRupees(s.totalPayroll)}</span>
              </div>
              <div class="overview-stat" style="padding: 16px 20px;">
                <span class="label" style="font-size: 14px;">Actual Paid (Net)</span>
                <span class="val text-success" style="font-size: 16px;">${API.fmtRupees(s.totalPaidThisMonth)}</span>
              </div>
              <div class="overview-stat" style="padding: 16px 20px;">
                <span class="label" style="font-size: 14px;">New Advances</span>
                <span class="val text-warning" style="font-size: 16px;">${API.fmtRupees(s.thisMonthAdvances)}</span>
              </div>
              <div class="overview-stat" style="padding: 16px 20px;">
                <span class="label" style="font-size: 14px;">Salary Balance</span>
                <span class="val text-accent" style="font-size: 16px;">${API.fmtRupees(s.salaryRemainingToPay)}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Labour Cost by Project -->
        <div class="db-card" id="qa-projects-widget" style="cursor:pointer; min-height: 380px;">
          <div class="db-card-header flex justify-between items-center">
            <h3>Labour Cost by Project</h3>
            <span class="text-muted text-sm">${monthName}</span>
          </div>
          <div class="db-card-body" style="padding: 24px;">
             <div class="labor-cost-list">
                ${(s.laborCostByProject || []).length === 0 
                  ? '<div class="text-sm text-muted text-center p-4">No project data this month</div>'
                  : (() => {
                      const totalCost = s.laborCostByProject.reduce((acc, curr) => acc + curr.cost, 0);
                      const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#14b8a6'];
                      return s.laborCostByProject.map((p, i) => {
                        const percent = totalCost > 0 ? Math.round((p.cost / totalCost) * 100) : 0;
                        const color = colors[i % colors.length];
                        return `
                          <div class="labor-item" style="margin-bottom: 16px;">
                            <div class="flex justify-between items-center" style="margin-bottom: 6px;">
                              <span class="name font-600 truncate" style="max-width:180px">${Helpers.escapeHtml(p.project_name || 'Unassigned')}</span>
                              <span class="val font-700">${API.fmtRupees(p.cost)}</span>
                            </div>
                            <div class="flex items-center gap-3">
                              <div class="progress-bar-labor"><div class="fill" style="width:${percent}%; background: ${color}"></div></div>
                              <span class="percent text-sm font-600" style="width: 35px;">${percent}%</span>
                            </div>
                          </div>
                        `;
                      }).join('');
                    })()
                }
             </div>
          </div>
        </div>
      </div>

      <!-- BOTTOM ROW -->
      <div class="dashboard-bottom-grid">
        <!-- Alerts & Reminders -->
        <div class="db-card" id="qa-alerts-widget" style="cursor:pointer; min-height: 360px;">
          <div class="db-card-header flex justify-between items-center" style="padding: 20px 24px;">
            <h3 style="font-size: 15px;">Alerts & Reminders</h3>
            <span class="text-sm text-accent font-500">View All</span>
          </div>
          <div class="db-card-body p-0">
             <div class="alert-mini-list">
                <div class="alert-mini-item" style="padding: 16px 24px;">
                  <div class="icon warning" style="width: 40px; height: 40px; font-size: 18px;">🔔</div>
                  <div class="text" style="font-size: 14px;">Unread Alerts</div>
                  <div class="badge ${s.alertStats?.unread > 0 ? 'badge-warning' : 'badge-muted'}" style="font-size: 13px; padding: 4px 8px;">${s.alertStats?.unread || 0}</div>
                </div>
                <div class="alert-mini-item" style="padding: 16px 24px;">
                  <div class="icon danger" style="width: 40px; height: 40px; font-size: 18px;">⚠️</div>
                  <div class="text" style="font-size: 14px;">Critical Issues</div>
                  <div class="badge ${s.alertStats?.critical > 0 ? 'badge-danger' : 'badge-muted'}" style="font-size: 13px; padding: 4px 8px;">${s.alertStats?.critical || 0}</div>
                </div>
                <div class="alert-mini-item" style="padding: 16px 24px;">
                  <div class="icon purple" style="width: 40px; height: 40px; font-size: 18px;">🏖️</div>
                  <div class="text" style="font-size: 14px;">Pending Leaves</div>
                  <div class="badge ${s.leavesStats.pending > 0 ? 'badge-danger' : 'badge-muted'}" style="font-size: 13px; padding: 4px 8px;">${s.leavesStats.pending}</div>
                </div>
                <div class="alert-mini-item" style="padding: 16px 24px;">
                  <div class="icon teal" style="width: 40px; height: 40px; font-size: 18px;">💰</div>
                  <div class="text" style="font-size: 14px;">Pending Expenses</div>
                  <div class="badge ${s.expensesStats.pending > 0 ? 'badge-danger' : 'badge-muted'}" style="font-size: 13px; padding: 4px 8px;">${s.expensesStats.pending}</div>
                </div>
             </div>
          </div>
        </div>

        <!-- Recent Activities -->
        <div class="db-card" id="qa-activity-widget" style="cursor:pointer; min-height: 360px;">
          <div class="db-card-header flex justify-between items-center" style="padding: 20px 24px;">
            <h3 style="font-size: 15px;">Recent Activities</h3>
            <span class="text-sm text-accent font-500">View All</span>
          </div>
          <div class="db-card-body p-0">
            ${(s.recentActivities || []).length === 0
              ? `<div class="p-6 text-center text-muted text-sm">No activity yet.</div>`
              : `<div class="recent-mini-list">${(s.recentActivities || []).map(a => `
                <div class="recent-item" style="padding: 16px 24px;">
                  <div class="icon blue" style="width: 40px; height: 40px; font-size: 18px;">🔄</div>
                  <div class="details">
                    <div class="desc" style="font-size: 14px;"><span class="font-600">${Helpers.escapeHtml(a.user_name)}</span> ${Helpers.escapeHtml(a.action)}</div>
                    <div class="time" style="font-size: 12px; margin-top: 4px;">${a.timestamp}</div>
                  </div>
                </div>`).join('')}
              </div>`
            }
          </div>
        </div>

        <!-- Recent Transactions -->
        <div class="db-card" style="min-height: 360px;">
          <div class="db-card-header flex justify-between items-center" style="padding: 20px 24px;">
            <h3 style="font-size: 15px;">Recent Transactions</h3>
          </div>
          <div class="db-card-body p-0">
            ${s.recentPayments.length === 0
              ? `<div class="p-6 text-center text-muted text-sm">No transactions found.</div>`
              : `<div class="recent-mini-list">${s.recentPayments.map(p => `
                <div class="recent-item" style="padding: 16px 24px;">
                  <div class="icon teal" style="width: 40px; height: 40px; font-size: 18px;">₹</div>
                  <div class="details">
                    <div class="desc" style="font-size: 14px;"><span class="font-600">${Helpers.escapeHtml(p.employee_name)}</span> <span class="text-muted">(Salary)</span></div>
                    <div class="time" style="font-size: 12px; margin-top: 4px;">${Helpers.shortMonth(p.month)} ${p.year} &bull; ${p.mode}</div>
                  </div>
                  <div class="amount text-success" style="font-size: 15px;">+${API.fmtRupees(p.net_paid)}</div>
                </div>`).join('')}
              </div>`
            }
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="db-card bg-soft" style="min-height: 360px;">
          <div class="db-card-header" style="padding: 20px 24px;">
            <h3 style="font-size: 15px;">Quick Actions</h3>
          </div>
          <div class="db-card-body" style="padding: 24px;">
            <div class="quick-action-grid" style="gap: 16px;">
              <button id="qa-add-employee" class="qa-btn" style="padding: 16px;"><div class="icon" style="font-size: 24px; margin-bottom: 4px;">👥</div> Add Employee</button>
              <button id="qa-mark-attendance" class="qa-btn" style="padding: 16px;"><div class="icon" style="font-size: 24px; margin-bottom: 4px;">📅</div> Mark Attendance</button>
              <button id="qa-add-advance" class="qa-btn" style="padding: 16px;"><div class="icon" style="font-size: 24px; margin-bottom: 4px;">💸</div> Add Advance</button>
              <button id="qa-process-salary" class="qa-btn" style="padding: 16px;"><div class="icon" style="font-size: 24px; margin-bottom: 4px;">🏦</div> Process Payroll</button>
            </div>
            <button id="qa-add-leave" class="qa-btn" style="width: 100%; margin-top: 16px; padding: 16px; flex-direction: row; justify-content: center; gap: 12px;"><div class="icon" style="font-size: 20px; margin: 0;">🏖️</div> Add Leave Request</button>
          </div>
        </div>
      </div>

      <!-- Modals -->
      <div id="absent-modal" class="modal-overlay" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:9999; align-items:center; justify-content:center;">
        <div class="modal-content" style="background:var(--bg-card); padding:32px; border-radius:16px; width:400px; box-shadow:0 20px 50px rgba(0,0,0,0.2);">
          <div class="flex justify-between items-center mb-6">
            <h3 style="margin:0; font-size:18px;">Today's Absentees</h3>
            <button id="close-absent-modal" class="btn-icon" style="background:none; border:none; cursor:pointer; font-size:20px;">&times;</button>
          </div>
          <div id="absent-names-list" class="flex-col gap-3">
             ${(s.todayAttendance?.absentNames || []).length === 0 
               ? '<p class="text-muted text-center py-4">No absentees today!</p>' 
               : s.todayAttendance.absentNames.map(name => `
                 <div class="flex items-center gap-3 p-3 bg-soft rounded-lg">
                   <div class="icon-avatar" style="background:rgba(239,68,68,0.1); color:#ef4444; width:36px; height:36px; display:flex; align-items:center; justify-content:center; border-radius:50%; font-weight:700;">${name.charAt(0)}</div>
                   <span class="font-600">${name}</span>
                 </div>
               `).join('')}
          </div>
        </div>
      </div>

      <div id="advance-modal" class="modal-overlay" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:9999; align-items:center; justify-content:center;">
        <div class="modal-content" style="background:var(--bg-card); padding:32px; border-radius:16px; width:450px; box-shadow:0 20px 50px rgba(0,0,0,0.2);">
          <div class="flex justify-between items-center mb-6">
            <h3 style="margin:0; font-size:18px;">Outstanding Advances</h3>
            <button id="close-advance-modal" class="btn-icon" style="background:none; border:none; cursor:pointer; font-size:20px;">&times;</button>
          </div>
          <div class="text-sm text-muted mb-4">Total amount currently held by employees as advances.</div>
          <div id="advance-breakdown-list" class="flex-col gap-3" style="max-height: 400px; overflow-y: auto;">
             ${(() => {
               const list = s.advanceBreakdown || [];
               if (list.length === 0) {
                 return `<p class="text-muted text-center py-4">No outstanding advances found. (Debug: Stats has ${Object.keys(s).join(', ')})</p>`;
               }
               return list.map(e => `
                 <div class="flex justify-between items-center p-3 bg-soft rounded-lg">
                   <div class="flex items-center gap-3">
                     <div class="icon-avatar" style="background:rgba(245,158,11,0.1); color:#f59e0b; width:36px; height:36px; display:flex; align-items:center; justify-content:center; border-radius:50%; font-weight:700;">${e.name.charAt(0)}</div>
                     <span class="font-600">${e.name}</span>
                   </div>
                   <span class="font-700 text-warning">${API.fmtRupees(e.amount)}</span>
                 </div>
               `).join('');
             })()}
          </div>
          <div class="mt-6 flex justify-end">
            <button class="btn btn-primary btn-sm" onclick="Router.navigate('advances')">Go to Advances Ledger &rarr;</button>
          </div>
        </div>
      </div>

      <style>
        .dashboard-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px; margin-bottom: 32px; }
        .kpi-card { background: var(--bg-card); border-radius: 16px; padding: 24px; border: 1px solid var(--border); display: flex; align-items: flex-start; gap: 20px; transition: transform 0.2s, box-shadow 0.2s; position: relative; overflow: hidden; }
        .kpi-card:hover { transform: translateY(-3px); box-shadow: 0 12px 32px rgba(0,0,0,0.06); }
        .kpi-icon-wrap { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 1.2rem; }
        .kpi-icon-wrap.blue { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
        .kpi-icon-wrap.green { background: rgba(16, 185, 129, 0.1); color: #10b981; }
        .kpi-icon-wrap.purple { background: rgba(139, 92, 246, 0.1); color: #8b5cf6; }
        .kpi-icon-wrap.red { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        .kpi-icon-wrap.orange { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
        .kpi-icon-wrap.teal { background: rgba(20, 184, 166, 0.1); color: #14b8a6; }
        .kpi-info { display: flex; flex-direction: column; width: 100%; }
        .kpi-title { font-size: 14px; font-weight: 600; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
        .kpi-val { font-size: 28px; font-weight: 700; color: var(--text); line-height: 1.2; margin-bottom: 6px; }
        .kpi-sub { font-size: 12px; color: var(--text-muted); }
        .kpi-footer { margin-top: 12px; font-size: 12px; font-weight: 600; }
        .kpi-footer.blue { color: #3b82f6; } .kpi-footer.green { color: #10b981; } .kpi-footer.purple { color: #8b5cf6; } .kpi-footer.red { color: #ef4444; } .kpi-footer.orange { color: #f59e0b; } .kpi-footer.teal { color: #14b8a6; }
        
        .dashboard-middle-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-bottom: 24px; }
        .dashboard-bottom-grid { display: grid; grid-template-columns: 1fr 1.5fr 1.5fr 1fr; gap: 24px; }
        
        .db-card { background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
        .db-card.bg-soft { background: var(--bg-body); }
        .db-card-header { padding: 16px 20px; border-bottom: 1px solid var(--border-soft); }
        .db-card-header h3 { font-size: 14px; font-weight: 600; color: var(--text); margin: 0; }
        .db-card-body { padding: 20px; flex: 1; }
        .db-card-body.p-0 { padding: 0; }
        
        .css-bar-chart, .css-multi-bar-chart { height: 160px; display: flex; align-items: flex-end; justify-content: space-around; padding-bottom: 24px; border-bottom: 1px dashed var(--border); margin-bottom: 16px; }
        .bar-col { display: flex; flex-direction: column; align-items: center; flex: 1; height: 100%; justify-content: flex-end; }
        .bar-wrap { width: 32px; background: var(--border-soft); border-radius: 6px; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; height: 100%; }
        .bar-fill { width: 100%; transition: height 0.5s; border-radius: 4px; }
        .bar-fill.green { background: #10b981; } .bar-fill.red { background: #ef4444; } .bar-fill.purple { background: #8b5cf6; }
        .bar-label { font-size: 11px; font-weight: 600; color: var(--text-muted); margin-top: 8px; }
        .chart-legend { display: flex; justify-content: center; gap: 16px; font-size: 12px; font-weight: 500; }
        .legend-item { display: flex; align-items: center; gap: 6px; }
        .legend-item .dot { width: 8px; height: 8px; border-radius: 50%; }
        .legend-item .dot.green { background: #10b981; } .legend-item .dot.red { background: #ef4444; } .legend-item .dot.purple { background: #8b5cf6; }

        .labor-cost-list { display: flex; flex-direction: column; }
        .progress-bar-labor { flex: 1; height: 10px; background: var(--border-soft); border-radius: 5px; overflow: hidden; }
        .progress-bar-labor .fill { height: 100%; border-radius: 5px; }
        
        .overview-stats-list { display: flex; flex-direction: column; gap: 16px; width: 100%; }
        .overview-stat { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--bg-body); border-radius: 8px; border: 1px solid var(--border-soft); }
        .overview-stat .label { font-size: 13px; font-weight: 500; color: var(--text-muted); }
        .overview-stat .val { font-size: 15px; font-weight: 600; color: var(--text); }
        
        .project-list-mini { display: flex; flex-direction: column; gap: 12px; }
        .proj-item { display: flex; justify-content: space-between; align-items: center; }
        .proj-item .label { font-size: 13px; font-weight: 500; }
        .proj-deploy-item { display: flex; align-items: center; gap: 12px; font-size: 12px; margin-bottom: 8px; }
        .progress-bar-mini { flex: 1; height: 6px; background: var(--border-soft); border-radius: 3px; overflow: hidden; }
        .progress-bar-mini .fill { height: 100%; background: var(--accent); border-radius: 3px; }
        
        .alert-mini-list, .recent-mini-list { display: flex; flex-direction: column; }
        .alert-mini-item { display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-bottom: 1px solid var(--border-soft); }
        .alert-mini-item:last-child { border-bottom: none; }
        .alert-mini-item .icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; background: var(--border-soft); }
        .alert-mini-item .text { flex: 1; font-size: 13px; font-weight: 500; }
        
        .recent-item { display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--border-soft); }
        .recent-item:last-child { border-bottom: none; }
        .recent-item .icon { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 600; }
        .recent-item .icon.blue { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
        .recent-item .icon.teal { background: rgba(20, 184, 166, 0.1); color: #14b8a6; }
        .recent-item .details { flex: 1; }
        .recent-item .desc { font-size: 13px; color: var(--text); margin-bottom: 2px; }
        .recent-item .time { font-size: 11px; color: var(--text-muted); }
        .recent-item .amount { font-weight: 600; font-size: 14px; }
        
        .quick-action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .qa-btn { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer; transition: 0.2s; font-size: 12px; font-weight: 500; color: var(--text); }
        .qa-btn:hover { border-color: var(--accent); color: var(--accent); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .qa-btn .icon { font-size: 20px; }
      </style>
    `;
  }

  function kpiCard(title, value, sub, colorClass, icon, footerText, navId) {
    return `
      <div class="kpi-card" ${navId ? `id="${navId}" style="cursor:pointer"` : ''}>
        <div class="kpi-icon-wrap ${colorClass}">${icon}</div>
        <div class="kpi-info">
          <div class="kpi-title">${title}</div>
          <div class="kpi-val">${value}</div>
          <div class="kpi-sub">${sub}</div>
          ${footerText ? `<div class="kpi-footer ${colorClass}">${footerText}</div>` : ''}
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
    document.getElementById('nav-to-advances')?.addEventListener('click',  () => {
      document.getElementById('advance-modal').style.display = 'flex';
    });
    document.getElementById('close-advance-modal')?.addEventListener('click', () => {
      document.getElementById('advance-modal').style.display = 'none';
    });
    // Close on click outside
    document.getElementById('advance-modal')?.addEventListener('click', (e) => {
      if (e.target === document.getElementById('advance-modal')) {
        document.getElementById('advance-modal').style.display = 'none';
      }
    });
    document.getElementById('nav-to-payments')?.addEventListener('click',  () => Router.navigate('payments'));
    document.getElementById('nav-to-attendance')?.addEventListener('click',() => Router.navigate('attendance'));
    document.getElementById('nav-to-absents')?.addEventListener('click', () => {
      document.getElementById('absent-modal').style.display = 'flex';
    });
    document.getElementById('close-absent-modal')?.addEventListener('click', () => {
      document.getElementById('absent-modal').style.display = 'none';
    });
    // Close on click outside
    document.getElementById('absent-modal')?.addEventListener('click', (e) => {
      if (e.target === document.getElementById('absent-modal')) {
        document.getElementById('absent-modal').style.display = 'none';
      }
    });

    document.getElementById('qa-add-employee')?.addEventListener('click',   () => { Router.navigate('employees');  setTimeout(() => document.getElementById('add-employee-btn')?.click(), 200); });
    document.getElementById('qa-mark-attendance')?.addEventListener('click', () => Router.navigate('attendance'));
    document.getElementById('qa-add-advance')?.addEventListener('click',    () => { Router.navigate('advances');   setTimeout(() => document.getElementById('add-advance-btn')?.click(), 200); });
    document.getElementById('qa-process-salary')?.addEventListener('click', () => Router.navigate('payments'));
    document.getElementById('qa-add-leave')?.addEventListener('click', () => { Router.navigate('leaves'); setTimeout(() => document.getElementById('add-leave-btn')?.click(), 200); });

    document.getElementById('qa-projects-widget')?.addEventListener('click', () => Router.navigate('projects'));
    document.getElementById('qa-leaves-widget')?.addEventListener('click', () => Router.navigate('leaves'));
    document.getElementById('qa-expenses-widget')?.addEventListener('click', () => Router.navigate('expenses'));
    document.getElementById('qa-activity-widget')?.addEventListener('click', () => Router.navigate('activity'));
    document.getElementById('qa-alerts-widget')?.addEventListener('click', () => Router.navigate('alerts'));
  }

  return { init };
})();
