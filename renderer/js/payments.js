/**
 * LocalPayroll — Payments Page
 * Salary calculation preview, payment recording, payslip generation, WhatsApp share.
 */

const PaymentsPage = (() => {
  const container  = () => document.getElementById('page-payments');
  const headerActs = () => document.getElementById('page-header-actions');

  let _employees    = [];
  let _payments     = [];
  let _filterMonth  = AppState.get('currentMonth');
  let _filterYear   = AppState.get('currentYear');
  let _filterStatus = '';
  let _filterEmp    = AppState.get('selectedEmployeeId') || '';

  let _calcCache    = [];
  let _activeTab    = 'processing'; // 'processing' | 'history'
  let _viewMode     = localStorage.getItem('pay_view_mode') || 'card'; // 'card' | 'table'

  async function init() {
    try {
      if (AppState.get('user')?.role === 'hr') {
        Toast.error("Access Denied: HR cannot access payroll controls.");
        Router.navigate('dashboard');
        return;
      }
      AppState.set('selectedEmployeeId', null);

      headerActs().innerHTML = `
        <div class="tab-bar" style="margin-bottom:0;border:none">
          <button class="tab-btn ${_activeTab === 'processing'?'active':''}" id="pay-tab-proc">Monthly Processing</button>
          <button class="tab-btn ${_activeTab === 'history'?'active':''}" id="pay-tab-hist">Payment History</button>
        </div>
      `;

      document.getElementById('pay-tab-proc').addEventListener('click', e => switchTab('processing', e.target));
      document.getElementById('pay-tab-hist').addEventListener('click', e => switchTab('history', e.target));

      const res = await API.getEmployees({ status: 'active' });
      _employees = res.employees || [];

      await load();
    } catch (err) {
      console.error('[PaymentsPage.init ERROR]', err);
      container().innerHTML = `
        <div class="empty-state" style="padding:40px">
          <div class="empty-icon" style="color:var(--danger)">❌</div>
          <h3 style="color:var(--danger)">Payroll Initialization Failed</h3>
          <p class="text-muted">${err.message}</p>
          <button class="btn btn-primary mt-3" onclick="PaymentsPage.init()">🔄 Retry Initialization</button>
        </div>
      `;
    }
  }

  function switchTab(tab, btnEl) {
    _activeTab = tab;
    document.querySelectorAll('#page-header-actions .tab-btn').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');
    load();
  }

  // ── Load & Render ─────────────────────────────────────────────────────────
  async function load() {
    if (_activeTab === 'processing') {
      try {
        // First, check if payroll is locked by running a silent calculateAll or audit
        const res = await API.calculateAll(_filterMonth, _filterYear);
        
        if (!res.success) {
          container().innerHTML = `<div class="empty-state"><div class="empty-icon" style="color:var(--danger)">⚠️</div><h3 style="color:var(--danger)">Calculation Error</h3><p>${res.error || 'Unknown error'}</p></div>`;
          return;
        }
        _calcCache = res.calculations || [];
        _calcCache.sort((a, b) => {
          const paidA = !!a.existingPayment;
          const paidB = !!b.existingPayment;
          if (paidA !== paidB) {
            return paidA ? 1 : -1;
          }
          return a.employeeName.localeCompare(b.employeeName);
        });
        renderProcessing();
      } catch(err) {
        console.error('[Payments load ERROR]', err);
        container().innerHTML = `<div class="empty-state"><h3 style="color:var(--danger)">Error</h3><p>${err.message}</p></div>`;
      }
    } else {
      const filter = {};
      if (_filterEmp)    filter.employeeId = parseInt(_filterEmp);
      if (_filterMonth)  filter.month      = _filterMonth;
      if (_filterYear)   filter.year       = _filterYear;
      if (_filterStatus) filter.status     = _filterStatus;

      const res = await API.getPayments(filter);
      if (!res.success) {
        container().innerHTML = `<div class="empty-state"><div class="empty-icon" style="color:var(--danger)">⚠️</div><h3 style="color:var(--danger)">Failed to load history</h3><p>${res.error || 'Unknown error'}</p></div>`;
        return;
      }
      _payments = res.payments || [];
      renderHistory();
    }
  }

  // ── Tab 1: Monthly Processing ──────────────────────────────────────────────
  function renderProcessing() {
    const totalIssuesCount = _calcCache.reduce((sum, c) => sum + (c.issues ? c.issues.length : 0), 0);
    const employeesWithIssuesCount = _calcCache.filter(c => c.issues && c.issues.length > 0).length;

    container().innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left" style="align-items:center;gap:12px">
           <span class="font-600">Select Month:</span>
           ${Helpers.buildMonthSelect('pay-proc-month', _filterMonth)}
           ${Helpers.buildYearSelect('pay-proc-year', _filterYear)}
        </div>
        <div class="toolbar-right">
          <div class="view-toggle">
            <button class="view-toggle-btn ${_viewMode === 'card' ? 'active' : ''}" id="pay-view-card-btn" title="Grid Card View">
              <svg viewBox="0 0 24 24" stroke="currentColor"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              Grid
            </button>
            <button class="view-toggle-btn ${_viewMode === 'table' ? 'active' : ''}" id="pay-view-table-btn" title="Compact Table View">
              <svg viewBox="0 0 24 24" stroke="currentColor"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              Table
            </button>
          </div>
        </div>
      </div>

      ${totalIssuesCount > 0 ? `
        <div class="payroll-top-alert">
          <div class="flex items-center gap-2">
            <span>⚠️</span>
            <span>Found <strong>${totalIssuesCount}</strong> issue(s) across <strong>${employeesWithIssuesCount}</strong> employee(s) for this month. Impacted employee payroll entries are locked.</span>
          </div>
          <button class="btn btn-sm btn-secondary" onclick="Router.navigate('attendance')">Open Attendance Module</button>
        </div>
      ` : ''}

      ${_calcCache.length === 0 ? `
        <div class="empty-state"><h3>No active employees found</h3></div>
      ` : (_viewMode === 'card' ? renderProcessingCards() : renderProcessingTable())}
    `;

    document.getElementById('pay-proc-month')?.addEventListener('change', e => { _filterMonth = parseInt(e.target.value); load(); });
    document.getElementById('pay-proc-year')?.addEventListener('change', e => { _filterYear = parseInt(e.target.value); load(); });

    // View toggle listeners
    attachViewToggleListeners();

    container().querySelectorAll('.pay-now-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const empId = parseInt(btn.dataset.id);
        const calc = _calcCache.find(c => c.employeeId === empId);
        openPayModal(calc);
      });
    });

    container().querySelectorAll('.pay-slip-btn-proc').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id);
        const r = await API.exportPayslipPdf(id);
        if (r.success) Toast.success('Payslip saved!');
        else if (r.error !== 'Cancelled.') Toast.error(r.error);
      });
    });

    // Info Clickables
    container().querySelectorAll('.info-clickable').forEach(el => {
      el.addEventListener('click', (e) => {
        const idx = parseInt(el.dataset.idx);
        const type = el.dataset.type;
        showQuickPreview(idx, type);
      });
    });
  }

  function attachViewToggleListeners() {
    const cardBtn = document.getElementById('pay-view-card-btn');
    const tableBtn = document.getElementById('pay-view-table-btn');
    if (cardBtn && tableBtn) {
      cardBtn.addEventListener('click', () => {
        _viewMode = 'card';
        localStorage.setItem('pay_view_mode', 'card');
        load();
      });
      tableBtn.addEventListener('click', () => {
        _viewMode = 'table';
        localStorage.setItem('pay_view_mode', 'table');
        load();
      });
    }
  }

  function renderProcessingTable() {
    return `
      <div class="table-wrap">
        <table class="payments-table">
            <thead><tr>
              <th>Employee</th>
              <th style="text-align:center">Attendance & OT</th>
              <th style="text-align:right">Salary Details</th>
              <th style="text-align:right">Payable Summary</th>
              <th style="text-align:center">Action</th>
            </tr></thead>
            <tbody>
              ${_calcCache.map((c, idx) => {
                const perDay = c.grossSalary / c.totalDays;
                const hourly = Math.round(perDay / 8);
                const paidAmt = c.existingPayment ? c.existingPayment.net_paid : 0;
                
                let issuesHtml = '';
                let hasBlockingIssue = false;
                if (c.issues && c.issues.length > 0) {
                  issuesHtml = `<div class="flex flex-col gap-1 mt-1">` + c.issues.map(iss => {
                    const isBlocking = iss.type === 'unfinalized' || iss.type === 'missing_project' || iss.type === 'missing_attendance' || iss.type === 'mismatch';
                    if (isBlocking) hasBlockingIssue = true;
                    const icon = isBlocking ? '❌' : '⚠️';
                    const badgeClass = isBlocking ? 'error' : 'warning';
                    
                    let clickAttr = '';
                    let titleAttr = '';
                    let label = iss.message;

                    if (iss.type === 'missing_attendance' || iss.type === 'mismatch') {
                      clickAttr = `onclick="Router.navigate('attendance', { employeeId: ${c.employeeId}, mode: 'monthly' })"`;
                      titleAttr = `title="Click to go to monthly attendance view"`;
                    } else if (iss.dates && iss.dates.length > 0) {
                      const formattedDates = iss.dates.map(d => {
                        const parts = d.split('-');
                        if (parts.length !== 3) return d;
                        const day = parseInt(parts[2]);
                        const monthIdx = parseInt(parts[1]) - 1;
                        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        return `${day}-${months[monthIdx]}`;
                      });

                      if (iss.dates.length === 1) {
                        clickAttr = `onclick="Router.navigate('attendance', { date: '${iss.dates[0]}', mode: 'bulk' })"`;
                        titleAttr = `title="Click to jump to attendance sheet for ${iss.dates[0]}"`;
                        
                        if (iss.type === 'unfinalized') {
                          label = `Unfinalized on ${formattedDates[0]}`;
                        } else if (iss.type === 'missing_project') {
                          label = `Missing project on ${formattedDates[0]}`;
                        } else if (iss.type === 'pending_ot') {
                          label = `OT pending on ${formattedDates[0]}`;
                        }
                      } else if (iss.dates.length <= 3) {
                        const datesJson = JSON.stringify(iss.dates).replace(/"/g, '&quot;');
                        clickAttr = `onclick="PaymentsPage.showProblemDates('${Helpers.escapeHtml(c.employeeName)}', '${Helpers.escapeHtml(iss.type)}', ${datesJson})"`;
                        titleAttr = `title="Click to select from problem dates"`;
                        
                        const dateListStr = formattedDates.join(', ');
                        if (iss.type === 'unfinalized') {
                          label = `Unfinalized: ${dateListStr}`;
                        } else if (iss.type === 'missing_project') {
                          label = `Missing project: ${dateListStr}`;
                        } else if (iss.type === 'pending_ot') {
                          label = `OT pending: ${dateListStr}`;
                        }
                      } else {
                        const datesJson = JSON.stringify(iss.dates).replace(/"/g, '&quot;');
                        clickAttr = `onclick="PaymentsPage.showProblemDates('${Helpers.escapeHtml(c.employeeName)}', '${Helpers.escapeHtml(iss.type)}', ${datesJson})"`;
                        titleAttr = `title="Click to select from ${iss.dates.length} problem dates"`;
                      }
                    }
                    
                    const clickableClass = clickAttr ? 'clickable' : '';
                    return `<span class="payroll-issue-tag ${badgeClass} ${clickableClass}" ${clickAttr} ${titleAttr}>${icon} ${Helpers.escapeHtml(label)}</span>`;
                  }).join('') + `</div>`;
                }

                let actionHtml = '';
                if (c.existingPayment) {
                  actionHtml = `<div class="flex flex-col gap-1 items-center">
                                  <span class="badge badge-success" style="padding: 2px 8px; font-size:10px">Paid</span>
                                  <button class="btn btn-sm btn-ghost pay-slip-btn-proc" data-id="${c.existingPayment.id}" style="padding:2px" title="View Slip">📄</button>
                                </div>`;
                } else if (hasBlockingIssue) {
                  actionHtml = `<span class="payments-table-locked" title="Resolve attendance issues to unlock">🔒 Locked</span>`;
                } else {
                  actionHtml = `<button class="btn btn-sm btn-primary pay-now-btn" data-id="${c.employeeId}" style="width:100%">Pay</button>`;
                }

                let balText = '';
                if (c.openingBalance !== 0) {
                  const sign = c.openingBalance < 0 ? '-' : '+';
                  const cls = c.openingBalance < 0 ? 'amount-warning' : 'amount-success';
                  balText = `Bal: <span class="${cls}">${sign}${API.fmtRupees(Math.abs(c.openingBalance))}</span>`;
                }

                let paymentStatusText = '';
                if (c.existingPayment) {
                  const closingBal = c.openingBalance + c.salaryEarned - (c.existingPayment.other_deductions || 0) - paidAmt;
                  const isSettled = Math.abs(closingBal) < 1;
                  
                  if (isSettled) {
                    paymentStatusText = `<span class="text-success">Paid: ${API.fmtRupees(paidAmt)} (Settled)</span>`;
                  } else if (closingBal < 0) {
                    paymentStatusText = `<span class="text-danger">Paid: ${API.fmtRupees(paidAmt)} (Adv: ${API.fmtRupees(Math.abs(closingBal))})</span>`;
                  } else {
                    paymentStatusText = `<span class="text-warning">Paid: ${API.fmtRupees(paidAmt)} (Pend: +${API.fmtRupees(closingBal)})</span>`;
                  }
                }

                const detailsSubText = paymentStatusText || balText || '<span class="text-muted">—</span>';

                return `
                <tr>
                  <td>
                    <div class="payments-stacked-cell">
                      <span class="primary">${Helpers.escapeHtml(c.employeeName)}</span>
                      <span class="secondary">${Helpers.escapeHtml(c.employeeRole || '')}</span>
                      ${issuesHtml}
                    </div>
                  </td>
                  <td style="text-align:center">
                    <div class="payments-table-att-summary">
                      <div class="badge-row">
                        <span class="badge ${c.presentDays > 0 ? 'badge-success' : 'badge-muted'}" title="Present">P:${c.presentDays}</span>
                        <span class="badge ${c.halfDays > 0 ? 'badge-warning' : 'badge-muted'}" title="Half Day">H:${c.halfDays}</span>
                        <span class="badge ${c.woDays > 0 ? 'badge-accent' : 'badge-muted'}" title="Weekly Off">W:${c.woDays}</span>
                        <span class="badge ${c.absentDays > 0 ? 'badge-danger' : 'badge-muted'}" title="Absent">A:${c.absentDays}</span>
                      </div>
                      <div style="font-size: 10px; font-weight: 500; color: var(--text-muted);">
                        ${c.attendanceDays} / ${c.totalDays} Days Paid
                        ${c.totalOvertimeHours > 0 ? ` · <span class="text-accent" style="font-weight: 600;">${c.totalOvertimeHours}h OT</span>` : ''}
                      </div>
                    </div>
                  </td>
                  <td style="text-align:right">
                    <div class="payments-stacked-cell" style="text-align:right; align-items:flex-end">
                      <span class="primary info-clickable" data-idx="${idx}" data-type="earned" style="font-size:0.9rem">
                        ${API.fmtRupees(c.salaryEarned)}
                        ${c.isMismatch ? '<span style="color:var(--danger); cursor:help" title="Attendance has changed since payment!"> ⚠️</span>' : ''}
                      </span>
                      <span class="secondary">Base: ${API.fmtRupees(c.grossSalary)}</span>
                    </div>
                  </td>
                  <td style="text-align:right; background:var(--bg-subtle)">
                    <div class="payments-stacked-cell" style="text-align:right; align-items:flex-end">
                      <span class="primary amount amount-success info-clickable" data-idx="${idx}" data-type="summary" style="font-size:0.95rem">
                        ${API.fmtRupees(c.netPayable)}
                      </span>
                      <span class="secondary">${detailsSubText}</span>
                    </div>
                  </td>
                  <td style="text-align:center">
                    ${actionHtml}
                  </td>
                </tr>
                `;
              }).join('')}
            </tbody>
        </table>
      </div>
    `;
  }

  function renderProcessingCards() {
    const colors = [
      ['#6366f1', '#818cf8'], // indigo
      ['#10b981', '#34d399'], // emerald
      ['#f59e0b', '#fbbf24'], // amber
      ['#ec4899', '#f472b6'], // pink
      ['#3b82f6', '#60a5fa'], // blue
      ['#8b5cf6', '#a78bfa']  // violet
    ];

    return `
      <div class="payroll-grid">
        ${_calcCache.map((c, idx) => {
          const perDay = c.grossSalary / c.totalDays;
          const hourly = Math.round(perDay / 8);
          const paidAmt = c.existingPayment ? c.existingPayment.net_paid : 0;
          const closingBal = c.existingPayment
            ? (c.openingBalance + c.salaryEarned - (c.existingPayment.other_deductions || 0) - paidAmt)
            : null;
          const isSettled = c.existingPayment && Math.abs(closingBal) < 1;

          let issuesHtml = '';
          let hasBlockingIssue = false;
          if (c.issues && c.issues.length > 0) {
            issuesHtml = `<div class="payroll-card-issues">` + c.issues.map(iss => {
              const isBlocking = iss.type === 'unfinalized' || iss.type === 'missing_project' || iss.type === 'missing_attendance' || iss.type === 'mismatch';
              if (isBlocking) hasBlockingIssue = true;
              const icon = isBlocking ? '❌' : '⚠️';
              const badgeClass = isBlocking ? 'error' : 'warning';
              
              let clickAttr = '';
              let titleAttr = '';
              let label = iss.message;

              if (iss.type === 'missing_attendance' || iss.type === 'mismatch') {
                clickAttr = `onclick="Router.navigate('attendance', { employeeId: ${c.employeeId}, mode: 'monthly' })"`;
                titleAttr = `title="Click to go to monthly attendance view"`;
              } else if (iss.dates && iss.dates.length > 0) {
                const formattedDates = iss.dates.map(d => {
                  const parts = d.split('-');
                  if (parts.length !== 3) return d;
                  const day = parseInt(parts[2]);
                  const monthIdx = parseInt(parts[1]) - 1;
                  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                  return `${day}-${months[monthIdx]}`;
                });

                if (iss.dates.length === 1) {
                  clickAttr = `onclick="Router.navigate('attendance', { date: '${iss.dates[0]}', mode: 'bulk' })"`;
                  titleAttr = `title="Click to jump to attendance sheet for ${iss.dates[0]}"`;
                  
                  if (iss.type === 'unfinalized') {
                    label = `Unfinalized on ${formattedDates[0]}`;
                  } else if (iss.type === 'missing_project') {
                    label = `Missing project on ${formattedDates[0]}`;
                  } else if (iss.type === 'pending_ot') {
                    label = `OT pending on ${formattedDates[0]}`;
                  }
                } else if (iss.dates.length <= 3) {
                  const datesJson = JSON.stringify(iss.dates).replace(/"/g, '&quot;');
                  clickAttr = `onclick="PaymentsPage.showProblemDates('${Helpers.escapeHtml(c.employeeName)}', '${Helpers.escapeHtml(iss.type)}', ${datesJson})"`;
                  titleAttr = `title="Click to select from problem dates"`;
                  
                  const dateListStr = formattedDates.join(', ');
                  if (iss.type === 'unfinalized') {
                    label = `Unfinalized: ${dateListStr}`;
                  } else if (iss.type === 'missing_project') {
                    label = `Missing project: ${dateListStr}`;
                  } else if (iss.type === 'pending_ot') {
                    label = `OT pending: ${dateListStr}`;
                  }
                } else {
                  const datesJson = JSON.stringify(iss.dates).replace(/"/g, '&quot;');
                  clickAttr = `onclick="PaymentsPage.showProblemDates('${Helpers.escapeHtml(c.employeeName)}', '${Helpers.escapeHtml(iss.type)}', ${datesJson})"`;
                  titleAttr = `title="Click to select from ${iss.dates.length} problem dates"`;
                }
              }
              
              const clickableClass = clickAttr ? 'clickable' : '';
              return `<span class="payroll-issue-tag ${badgeClass} ${clickableClass}" ${clickAttr} ${titleAttr}>${icon} ${Helpers.escapeHtml(label)}</span>`;
            }).join('') + `</div>`;
          }

          const avatarChar = c.employeeName ? c.employeeName.charAt(0).toUpperCase() : 'E';
          const colorIdx = (c.employeeName ? c.employeeName.charCodeAt(0) : 0) % colors.length;
          const avatarStyle = `background: linear-gradient(135deg, ${colors[colorIdx][0]}, ${colors[colorIdx][1]})`;

          return `
          <div class="payroll-card">
            <div class="payroll-card-header">
              <div class="payroll-card-avatar" style="${avatarStyle}">${avatarChar}</div>
              <div class="payroll-card-info">
                <div class="payroll-card-name" title="${Helpers.escapeHtml(c.employeeName)}">${Helpers.escapeHtml(c.employeeName)}</div>
                <div class="payroll-card-role" title="${Helpers.escapeHtml(c.employeeRole || '')}">${Helpers.escapeHtml(c.employeeRole || 'Staff')}</div>
              </div>
            </div>

            ${issuesHtml}

            <div class="payroll-card-attendance">
              <div class="payroll-card-attendance-header">
                <span>Attendance Summary</span>
                <span class="text-xs text-muted" style="font-size: 10px;">${c.attendanceDays} / ${c.totalDays} Days Paid</span>
              </div>
              <div class="payroll-card-progress-bg">
                <div class="payroll-card-progress-fill" style="width: ${(c.attendanceDays / c.totalDays * 100).toFixed(0)}%"></div>
              </div>
              <div class="payroll-card-attendance-pills">
                <span class="badge ${c.presentDays > 0 ? 'badge-success' : 'badge-muted'}" title="Present">P:${c.presentDays}</span>
                <span class="badge ${c.halfDays > 0 ? 'badge-warning' : 'badge-muted'}" title="Half Day">H:${c.halfDays}</span>
                <span class="badge ${c.woDays > 0 ? 'badge-accent' : 'badge-muted'}" title="Weekly Off">W:${c.woDays}</span>
                <span class="badge ${c.absentDays > 0 ? 'badge-danger' : 'badge-muted'}" title="Absent">A:${c.absentDays}</span>
              </div>
            </div>

            <div class="payroll-card-finances">
              <div class="payroll-card-finance-row">
                <span>Monthly Base</span>
                <span class="val">${API.fmtRupees(c.grossSalary)}</span>
              </div>
              <div class="payroll-card-finance-row">
                <span>Salary Earned</span>
                <span class="val info-clickable" data-idx="${idx}" data-type="earned">
                  ${API.fmtRupees(c.salaryEarned)}
                  ${c.isMismatch ? ' ⚠️' : ''}
                </span>
              </div>

              ${c.openingBalance !== 0 ? `
                <div class="payroll-card-finance-row">
                  <span>Opening Balance</span>
                  <span class="val info-clickable ${c.openingBalance < 0 ? 'amount-warning' : 'amount-success'}" data-idx="${idx}" data-type="balance">
                    ${c.openingBalance < 0 ? '-' : '+'}${API.fmtRupees(Math.abs(c.openingBalance))}
                  </span>
                </div>
              ` : ''}

              ${c.totalOvertimeHours > 0 ? `
                <div class="payroll-card-finance-row">
                  <span>Overtime (${c.totalOvertimeHours}h)</span>
                  <span class="val text-accent font-600">${API.fmtRupees(c.overtimePay)}</span>
                </div>
              ` : ''}

              ${c.existingPayment ? `
                <div class="payroll-card-finance-row">
                  <span>Amount Paid</span>
                  <span class="val text-accent font-600">${API.fmtRupees(paidAmt)}</span>
                </div>
                <div class="payroll-card-finance-row">
                  <span>Closing Balance</span>
                  <span class="val ${isSettled ? 'text-success' : (closingBal < 0 ? 'text-danger' : 'text-warning')}">
                    ${isSettled ? 'Settled' : (closingBal < 0 ? `${API.fmtRupees(Math.abs(closingBal))} Adv` : `+${API.fmtRupees(closingBal)} Pend`)}
                  </span>
                </div>
              ` : ''}

              <div class="payroll-card-finance-row net">
                <span>Net Payable</span>
                <span class="val info-clickable" data-idx="${idx}" data-type="summary">${API.fmtRupees(c.netPayable)}</span>
              </div>
            </div>

            <div class="payroll-card-footer">
              <div class="payroll-card-footer-status">
                ${c.existingPayment ? `<span class="badge badge-success">Paid</span>` : (hasBlockingIssue ? `<span class="payments-table-locked">🔒 Locked</span>` : `<span class="text-muted">Unpaid</span>`)}
              </div>
              <div>
                ${c.existingPayment ? `
                  <button class="btn btn-sm btn-secondary pay-slip-btn-proc" data-id="${c.existingPayment.id}">View Slip 📄</button>
                ` : (hasBlockingIssue ? `
                  <button class="btn btn-sm btn-secondary" disabled title="Resolve issues to unlock">Locked</button>
                ` : `
                  <button class="btn btn-sm btn-primary pay-now-btn" data-id="${c.employeeId}">Pay</button>
                `)}
              </div>
            </div>
          </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function showQuickPreview(idx, type) {
    const c = _calcCache[idx];
    if (!c) return;

    let content = '';
    let title = '';

    const perDay = c.grossSalary / c.totalDays;
    const hourly = Math.round(perDay / 8);

    if (type === 'earned') {
      title = 'Earnings Breakdown';
      content = `
        <div class="calc-row"><span>Monthly Base</span> <span>${API.fmtRupees(c.grossSalary)}</span></div>
        <div class="calc-row text-xs text-muted mb-2"><span>Daily Rate (Base/${c.totalDays})</span> <span>${API.fmtRupees(perDay)}</span></div>
        <div style="border-top:1px solid var(--border); padding-top:8px">
          <div class="calc-row"><span>Present (${c.presentDays}d × ${API.fmtRupees(perDay)})</span> <span>${API.fmtRupees(c.presentDays * perDay)}</span></div>
          <div class="calc-row"><span>Half Day (${c.halfDays}d × 0.5 × ${API.fmtRupees(perDay)})</span> <span>${API.fmtRupees(c.halfDays * 0.5 * perDay)}</span></div>
          <div class="calc-row"><span>Weekly Off (${c.woDays}d × ${API.fmtRupees(perDay)})</span> <span>${API.fmtRupees(c.woDays * perDay)}</span></div>
          ${c.totalOvertimeHours > 0 ? `<div class="calc-row"><span>Overtime (${c.totalOvertimeHours}h × ${API.fmtRupees(hourly)})</span> <span>${API.fmtRupees(c.overtimePay)}</span></div>` : ''}
          ${c.reimbursedExpenses > 0 ? `<div class="calc-row text-success"><span>Expenses Reimbursed</span> <span>+${API.fmtRupees(c.reimbursedExpenses)}</span></div>` : ''}
          ${c.bonusAmount > 0 ? `<div class="calc-row text-success"><span>Bonus</span> <span>+${API.fmtRupees(c.bonusAmount)}</span></div>` : ''}
        </div>
        <div class="calc-row mt-2 font-600" style="border-top:1px solid var(--border); padding-top:8px">
          <span>Total Earned</span> <span class="amount amount-success">${API.fmtRupees(c.totalEarnings)}</span>
        </div>
      `;
    } else if (type === 'balance') {
      title = 'Opening Balance Details';
      content = `
        <div class="calc-row">
          <span>Current Running Balance</span>
          <span class="${c.openingBalance < 0 ? 'text-danger' : (c.openingBalance > 0 ? 'text-success' : 'text-muted')}">
             ${c.openingBalance === 0 ? '₹0.00' : (c.openingBalance < 0 ? '-' : '+') + API.fmtRupees(Math.abs(c.openingBalance))}
          </span>
        </div>
        <div class="text-xs text-muted mt-2">
          ${c.openingBalance < 0 ? 'Employee owes company (Advance)' : (c.openingBalance > 0 ? 'Company owes employee (Pending)' : 'No pending balance')}
        </div>
      `;
    } else if (type === 'summary') {
      title = 'Salary Summary';
      content = `
        <div class="calc-row"><span>Opening Balance</span> <span class="${c.openingBalance < 0 ? 'text-danger' : 'text-success'}">${c.openingBalance < 0 ? '-' : '+'}${API.fmtRupees(Math.abs(c.openingBalance))}</span></div>
        <div class="calc-row"><span>Salary Earned</span> <span>${API.fmtRupees(c.salaryEarned)}</span></div>
        
        ${c.recoverableAmount > 0 ? `
          <div class="calc-row text-warning" style="border-top:1px dashed var(--border); margin-top:4px; padding-top:4px">
            <span>Advance Recovery</span>
            <span>-${API.fmtRupees(c.recoverableAmount)}</span>
          </div>
          <div class="calc-row font-600">
            <span>Adjusted Salary</span>
            <span>${API.fmtRupees(c.adjustedSalary)}</span>
          </div>
        ` : ''}

        ${c.otherDeductions > 0 ? `<div class="calc-row"><span>Other Deductions</span> <span>-${API.fmtRupees(c.otherDeductions)}</span></div>` : ''}
        
        <div class="calc-row mt-2 font-700 text-lg" style="border-top:2px solid var(--border); padding-top:8px">
          <span>Total Net Payable</span> <span class="amount amount-success">${API.fmtRupees(c.netPayable)}</span>
        </div>
      `;
    }

    Modal.open({
      title: title,
      size: 'modal-sm',
      body: `<div style="padding:10px">${content}</div>`,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Close</button>`
    });
  }

  // ── Tab 2: Payment History ────────────────────────────────────────────────
  function renderHistory() {
    const totalNet  = _payments.reduce((s, p) => s + p.net_paid, 0);
    const paidCount = _payments.filter(p => p.status === 'paid').length;

    container().innerHTML = `
      <div class="toolbar" style="flex-wrap:wrap">
        <div class="toolbar-left" style="flex-wrap:wrap;gap:10px">
          <select id="pay-hist-emp" class="form-select" style="width:200px">
            <option value="">All Employees</option>
            ${_employees.map(e => `<option value="${e.id}" ${String(e.id) === String(_filterEmp) ? 'selected' : ''}>${Helpers.escapeHtml(e.name)}</option>`).join('')}
          </select>
          ${Helpers.buildMonthSelect('pay-hist-month', _filterMonth)}
          ${Helpers.buildYearSelect('pay-hist-year', _filterYear)}
          <select id="pay-hist-status" class="form-select" style="width:130px" hidden>
            <option value="paid" selected>Paid</option>
          </select>
          <button id="pay-clear-filter" class="btn btn-ghost btn-sm">Clear</button>
        </div>
        <div class="toolbar-right flex items-center gap-2" style="flex-wrap:wrap">
          <div class="view-toggle" style="margin-right:10px">
            <button class="view-toggle-btn ${_viewMode === 'card' ? 'active' : ''}" id="pay-view-card-btn" title="Grid Card View">
              <svg viewBox="0 0 24 24" stroke="currentColor"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              Grid
            </button>
            <button class="view-toggle-btn ${_viewMode === 'table' ? 'active' : ''}" id="pay-view-table-btn" title="Compact Table View">
              <svg viewBox="0 0 24 24" stroke="currentColor"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              Table
            </button>
          </div>
          <div class="card" style="padding:8px 14px; border-radius: var(--radius-md)">
             <span class="text-sm">${paidCount} records</span>
          </div>
          <div class="card" style="padding:8px 14px; border-radius: var(--radius-md)">
            <span class="text-sm font-600">Total: <span class="amount amount-success">${API.fmtRupees(totalNet)}</span></span>
          </div>
        </div>
      </div>

      ${_payments.length === 0 ? `
        <div class="empty-state"><h3>No payment records</h3></div>
      ` : (_viewMode === 'card' ? renderHistoryCards() : renderHistoryTable())}
    `;

    document.getElementById('pay-hist-emp')?.addEventListener('change',    e => { _filterEmp = e.target.value; load(); });
    document.getElementById('pay-hist-month')?.addEventListener('change',  e => { _filterMonth = parseInt(e.target.value); load(); });
    document.getElementById('pay-hist-year')?.addEventListener('change',   e => { _filterYear  = parseInt(e.target.value); load(); });
    document.getElementById('pay-clear-filter')?.addEventListener('click', () => { _filterEmp = ''; _filterMonth = AppState.get('currentMonth'); _filterYear = AppState.get('currentYear'); load(); });

    // View toggle listeners
    attachViewToggleListeners();

    container().querySelectorAll('.pay-slip-btn').forEach(btn =>
      btn.addEventListener('click', async () => {
        const r = await API.exportPayslipPdf(parseInt(btn.dataset.id));
        if (r.success) Toast.success('Payslip saved!');
        else if (r.error !== 'Cancelled.') Toast.error(r.error);
      })
    );
    container().querySelectorAll('.pay-whatsapp-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // Sanitise phone: remove non-digits, then ensure 12-digit international format
        let phone = btn.dataset.phone.replace(/\D/g, '');
        if (phone.length === 10) phone = '91' + phone; // add India code only for bare 10-digit numbers
        const msg   = encodeURIComponent(`Dear ${btn.dataset.name},\n\nYour salary for ${btn.dataset.month} ${btn.dataset.year} is *${btn.dataset.net}*.\n\nThank you!`);
        if (!phone) { Toast.warning('No phone for this employee.'); return; }
        window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
      });
    });
    container().querySelectorAll('.pay-del-btn').forEach(btn =>
      btn.addEventListener('click', () =>
        Modal.confirm('Delete this payment record?', async () => {
          const r = await API.deletePayment(parseInt(btn.dataset.id));
          if (r.success) { Toast.success('Deleted.'); load(); EventBus.emit('data:refresh'); }
          else Toast.error(r.error);
        }, { title: 'Delete Payment', danger: true })
      )
    );
  }

  function renderHistoryTable() {
    return `
      <div class="table-wrap">
        <table class="payments-table">
          <thead><tr>
            <th>Employee</th>
            <th>Month / Year & Mode</th>
            <th style="text-align:right">Salary & Advance</th>
            <th style="text-align:right">Final Paid</th>
            <th style="text-align:center">Actions</th>
          </tr></thead>
          <tbody>
            ${_payments.map(p => `
              <tr>
                <td>
                  <div class="payments-stacked-cell">
                    <span class="primary">${Helpers.escapeHtml(p.employee_name)}</span>
                    <span class="secondary">${Helpers.escapeHtml(p.employee_role || 'Staff')}</span>
                  </div>
                </td>
                <td>
                  <div class="payments-stacked-cell">
                    <span class="primary">${Helpers.shortMonth(p.month)} ${p.year}</span>
                    <span class="secondary">${modeBadge(p.mode)}</span>
                  </div>
                </td>
                <td style="text-align:right">
                  <div class="payments-stacked-cell" style="text-align:right; align-items:flex-end">
                    <span class="primary"><small>Base: ${API.fmtRupees(p.gross_salary)}</small></span>
                    <span class="secondary ${p.advance_deducted > 0 ? 'amount-warning' : (p.advance_deducted < 0 ? 'amount-success' : 'text-muted')}">
                      Adv Recovery: ${p.advance_deducted === 0 ? '—' : (p.advance_deducted > 0 ? '-' : '+') + API.fmtRupees(Math.abs(p.advance_deducted))}
                    </span>
                  </div>
                </td>
                <td style="text-align:right" class="amount amount-success font-600">${API.fmtRupees(p.net_paid)}</td>
                <td style="text-align:center">
                  <div class="flex gap-2 justify-center">
                    <button class="btn btn-sm btn-secondary pay-slip-btn" data-id="${p.id}" title="Payslip PDF">📄</button>
                    <button class="btn btn-sm btn-secondary pay-whatsapp-btn"
                      data-phone="${Helpers.escapeHtml(p.employee_phone || '')}"
                      data-name="${Helpers.escapeHtml(p.employee_name)}"
                      data-net="${API.fmtRupees(p.net_paid)}"
                      data-month="${Helpers.monthName(p.month)}"
                      data-year="${p.year}" title="Share via WhatsApp">💬</button>
                    <button class="btn btn-sm btn-danger pay-del-btn" data-id="${p.id}" title="Delete">✕</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderHistoryCards() {
    const colors = [
      ['#6366f1', '#818cf8'], // indigo
      ['#10b981', '#34d399'], // emerald
      ['#f59e0b', '#fbbf24'], // amber
      ['#ec4899', '#f472b6'], // pink
      ['#3b82f6', '#60a5fa'], // blue
      ['#8b5cf6', '#a78bfa']  // violet
    ];

    return `
      <div class="payroll-grid">
        ${_payments.map(p => {
          const avatarChar = p.employee_name ? p.employee_name.charAt(0).toUpperCase() : 'E';
          const colorIdx = (p.employee_name ? p.employee_name.charCodeAt(0) : 0) % colors.length;
          const avatarStyle = `background: linear-gradient(135deg, ${colors[colorIdx][0]}, ${colors[colorIdx][1]})`;

          return `
          <div class="payroll-card">
            <div class="payroll-card-header">
              <div class="payroll-card-avatar" style="${avatarStyle}">${avatarChar}</div>
              <div class="payroll-card-info">
                <div class="payroll-card-name" title="${Helpers.escapeHtml(p.employee_name)}">${Helpers.escapeHtml(p.employee_name)}</div>
                <div class="payroll-card-role" title="${Helpers.escapeHtml(p.employee_role || '')}">${Helpers.escapeHtml(p.employee_role || 'Staff')}</div>
              </div>
            </div>

            <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
              <span class="badge badge-muted" style="text-transform: none; font-size:0.75rem">${Helpers.shortMonth(p.month)} ${p.year}</span>
              ${modeBadge(p.mode)}
            </div>

            <div class="payroll-card-finances" style="border-top: none; padding-top: 0; margin-bottom: 14px;">
              <div class="payroll-card-finance-row">
                <span>Gross Salary</span>
                <span class="val">${API.fmtRupees(p.gross_salary)}</span>
              </div>
              <div class="payroll-card-finance-row">
                <span>Advance Deducted</span>
                <span class="val ${p.advance_deducted > 0 ? 'amount-warning' : 'text-muted'}">
                  ${p.advance_deducted === 0 ? '—' : '-' + API.fmtRupees(p.advance_deducted)}
                </span>
              </div>
              ${p.notes ? `
                <div style="font-size:0.75rem; color:var(--text-muted); background:var(--bg-row-alt); padding:6px 10px; border-radius:6px; border:1px solid var(--border); margin-top:8px; font-style: italic;">
                  Note: ${Helpers.escapeHtml(p.notes)}
                </div>
              ` : ''}
              <div class="payroll-card-finance-row net" style="border-top:1px dashed var(--border); padding-top:10px; margin-top:8px;">
                <span>Total Paid</span>
                <span class="val" style="color:var(--success)">${API.fmtRupees(p.net_paid)}</span>
              </div>
            </div>

            <div class="payroll-card-footer" style="padding-top:12px;">
              <span class="badge badge-success">Completed</span>
              <div class="flex gap-2">
                <button class="btn btn-sm btn-secondary pay-slip-btn" data-id="${p.id}" title="Payslip PDF">📄</button>
                <button class="btn btn-sm btn-secondary pay-whatsapp-btn"
                  data-phone="${Helpers.escapeHtml(p.employee_phone || '')}"
                  data-name="${Helpers.escapeHtml(p.employee_name)}"
                  data-net="${API.fmtRupees(p.net_paid)}"
                  data-month="${Helpers.monthName(p.month)}"
                  data-year="${p.year}" title="Share via WhatsApp">💬</button>
                <button class="btn btn-sm btn-danger pay-del-btn" data-id="${p.id}" title="Delete">✕</button>
              </div>
            </div>
          </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // ── NEW: Validation Panel ──────────────────────────────────────────────────
  function renderValidationPanel(issues, stats) {
    container().innerHTML = `
      <div class="payroll-audit-container" style="padding:24px; max-width:1200px; margin:0 auto">
        
        <div class="audit-header card" style="background:var(--danger); color:white; border:none; margin-bottom:24px">
          <div class="flex items-center gap-4">
             <div style="font-size:32px">🛡️</div>
             <div>
               <h2 class="font-700" style="margin:0">Payroll Processing Blocked</h2>
               <p style="margin:5px 0 0; opacity:0.9">Operational validation found ${issues.length} blocking issues for ${Helpers.monthName(_filterMonth)} ${_filterYear}.</p>
             </div>
          </div>
        </div>

        <!-- Summary Stats -->
        <div class="grid grid-cols-4 gap-4 mb-6">
          <div class="card p-4 text-center">
             <div class="text-2xl font-700 text-danger">${stats.unlocked || 0}</div>
             <div class="text-xs text-muted font-600 uppercase">Unlocked Records</div>
          </div>
          <div class="card p-4 text-center">
             <div class="text-2xl font-700 text-warning">${stats.pendingOT || 0}</div>
             <div class="text-xs text-muted font-600 uppercase">Pending OT</div>
          </div>
          <div class="card p-4 text-center">
             <div class="text-2xl font-700 text-danger">${stats.missingProject || 0}</div>
             <div class="text-xs text-muted font-600 uppercase">Missing Projects</div>
          </div>
          <div class="card p-4 text-center">
             <div class="text-2xl font-700 text-accent">${stats.missingAttendance || 0}</div>
             <div class="text-xs text-muted font-600 uppercase">Gaps Found</div>
          </div>
        </div>

        <!-- Issues Table -->
        <div class="card p-0 overflow-hidden">
          <div class="p-4 bg-subtle flex justify-between items-center border-bottom">
            <h3 class="font-600">🚨 Attendance Issues Needing Resolution</h3>
            <div class="flex gap-2">
              <button class="btn btn-sm btn-accent" id="audit-lock-all">Lock All Finalized</button>
              <button class="btn btn-sm btn-ghost" onclick="PaymentsPage.load()">🔄 Refresh Audit</button>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Project/Site</th>
                  <th>Issue Type</th>
                  <th>Detail</th>
                  <th style="text-align:right">Action</th>
                </tr>
              </thead>
              <tbody>
                ${issues.length === 0 ? '<tr><td colspan="6" class="text-center p-8">No issues found. Refresh to re-audit.</td></tr>' : issues.map(item => `
                  <tr style="border-left: 4px solid ${item.severity === 'error' ? 'var(--danger)' : 'var(--warning)'}">
                    <td>
                      <div class="font-600">${Helpers.escapeHtml(item.employee)}</div>
                      <div class="text-xs text-muted">ID: EMP${String(item.employeeId).padStart(3,'0')}</div>
                    </td>
                    <td><div class="badge badge-muted">${item.date === 'Entire Month' ? 'Month View' : Helpers.formatDate(item.date)}</div></td>
                    <td>${Helpers.escapeHtml(item.project)}</td>
                    <td><span class="tag-mini ${item.severity === 'error' ? 'red' : 'yellow'}">${item.type}</span></td>
                    <td class="text-sm font-500">${item.issue}</td>
                    <td style="text-align:right">
                      <button class="btn btn-sm ${item.actionId === 'lock' ? 'btn-success' : 'btn-primary'} audit-action-btn" 
                        data-action="${item.actionId}" 
                        data-date="${item.date}" 
                        data-empid="${item.employeeId}"
                        data-refid="${item.refId}">
                        ${item.action}
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Quick Actions Footer -->
        <div class="flex justify-between mt-6 p-4 bg-body rounded-lg">
           <div class="text-sm text-muted">
             <strong>Note:</strong> Once all issues above are resolved, the payroll processing table will automatically become available.
           </div>
           <button class="btn btn-secondary" onclick="Router.navigate('attendance')">Open Attendance Module</button>
        </div>

      </div>
    `;

    // Attach Events
    container().querySelectorAll('.audit-action-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        const date   = btn.dataset.date;
        const empId  = btn.dataset.empid;
        const refId  = btn.dataset.refid;

        if (action === 'lock') {
          const res = await API.finalizeAttendance({ date, employeeId: empId });
          if (res.success) {
            Toast.success(`Attendance locked for ${date}`);
            load(); // Re-audit
          } else Toast.error(res.error);
        } else if (action === 'open') {
          Router.navigate('attendance', { date, employeeId: empId, mode: 'bulk' });
        } else if (action === 'open_month') {
          Router.navigate('attendance', { employeeId: empId, mode: 'monthly' });
        } else if (action === 'review_ot') {
          Router.navigate('attendance', { date, employeeId: empId, mode: 'bulk' });
        }
      });
    });

    document.getElementById('audit-lock-all')?.addEventListener('click', async () => {
      Modal.confirm('Lock all finalized records for this month?', async () => {
        // In a real system, we'd have a bulkLock IPC. Here we do it via existing finalize
        Toast.info('Processing bulk lock...');
        const toLock = issues.filter(i => i.actionId === 'lock');
        for (const item of toLock) {
           await API.finalizeAttendance({ date: item.date, employeeId: item.employeeId });
        }
        Toast.success('Bulk locking complete.');
        load();
      });
    });
  }

  function modeBadge(mode) {
    const map = { Cash: 'badge-accent', UPI: 'badge-success', Bank: 'badge-warning' };
    return `<span class="badge ${map[mode] || 'badge-muted'}">${mode}</span>`;
  }

  // ── Auto-Calculate Pay Modal ───────────────────────────────────────────────
  function openPayModal(calc) {
    const perDayRs       = (calc.grossSalary / calc.totalDays) / 100;
    const openingRs      = (calc.openingBalance / 100);
    const salaryEarnedRs = (calc.salaryEarned / 100);
    const otPayRs        = (calc.overtimePay / 100);
    const effectiveRs    = (calc.effectiveSalary / 100);
    const foodRs         = (calc.foodAllowance / 100);
    const travelRs       = (calc.travelAllowance / 100);
    const otherDedRs     = (calc.otherDeductions / 100);
    const reimbursedRs   = ((calc.reimbursedExpenses || 0) / 100);
    const bonusRs        = ((calc.bonusAmount || 0) / 100);
    let   netPayableRs   = (calc.netPayable / 100);

    const fmtR = (v) => '\u20b9' + Math.round(v).toLocaleString('en-IN');

    Modal.open({
      title: 'Pay ' + Helpers.escapeHtml(calc.employeeName),
      size: 'modal-xl',
      body: `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start;">
          <!-- LEFT COLUMN: BREAKDOWN -->
          <div style="background:var(--bg-subtle); padding:20px; border-radius:12px; border:1px solid var(--border); height: 100%;">
            <div class="calc-row" style="margin-bottom:12px;">
              <span class="text-muted">Month/Year</span>
              <span class="font-600">${Helpers.monthName(_filterMonth)} ${_filterYear}</span>
            </div>

            <div style="border-top:1px solid var(--border); margin:12px 0; padding-top:12px">
              <div class="text-sm font-600" style="margin-bottom:8px; color:var(--accent)">📊 Attendance Breakdown</div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px 20px; font-size:0.85rem">
                <div class="calc-row" style="padding:2px 0"><span class="text-muted">Per Day Salary</span><span class="font-600">${fmtR(perDayRs)}</span></div>
                <div class="calc-row" style="padding:2px 0"><span class="text-muted">Present (P)</span><span class="font-600">${calc.presentDays} days</span></div>
                <div class="calc-row" style="padding:2px 0"><span class="text-muted">Half Day (H)</span><span class="font-600">${calc.halfDays} days</span></div>
                <div class="calc-row" style="padding:2px 0"><span class="text-muted">Weekly Off (WO)</span><span class="font-600">${calc.woDays} days</span></div>
                <div class="calc-row" style="padding:2px 0"><span class="text-muted">Absent (A)</span><span class="font-600 text-danger">${calc.absentDays} days</span></div>
                <div class="calc-row" style="padding:2px 0"><span class="text-muted">Effective Days</span><span class="font-600">${calc.attendanceDays} / ${calc.totalDays}</span></div>
              </div>
            </div>

            <div style="border-top:1px solid var(--border); margin:12px 0; padding-top:12px">
              <div class="text-sm font-600" style="margin-bottom:8px; color:var(--accent)">💰 Earnings</div>
              <div class="calc-row"><span class="text-muted">Attendance Earnings</span><span class="font-600">${fmtR(effectiveRs)}</span></div>
              <div class="calc-row"><span class="text-muted">OT Amount (${calc.totalOvertimeHours}h)</span><span class="font-600">${fmtR(otPayRs)}</span></div>
              <div class="calc-row"><span class="text-muted">Food Allowance</span><span class="font-600" id="pay-food-display">${fmtR(foodRs)}</span></div>
              <div class="calc-row"><span class="text-muted">Travel Allowance</span><span class="font-600" id="pay-travel-display">${fmtR(travelRs)}</span></div>
              <div class="calc-row"><span class="text-muted">Expenses Reimbursed</span><span class="font-600 text-success" id="pay-reimbursed-display">+${fmtR(reimbursedRs)}</span></div>
              <div class="calc-row"><span class="text-muted">Bonus</span><span class="font-600 text-success">+${fmtR(bonusRs)}</span></div>
              <div class="calc-row" style="border-top:1px dashed var(--border); padding-top:8px; margin-top:8px">
                <span class="font-600">Gross Salary Earned</span><span class="font-600" id="pay-gross-display">${fmtR(salaryEarnedRs)}</span>
              </div>
            </div>

            <div style="border-top:1px solid var(--border); margin:12px 0; padding-top:12px">
               <div class="calc-row">
                 <span class="text-muted">Opening Balance</span>
                 <span class="font-600 ${openingRs < 0 ? 'text-danger' : (openingRs > 0 ? 'text-success' : '')}">
                   ${openingRs === 0 ? '₹0' : (openingRs < 0 ? '-' : '+') + fmtR(Math.abs(openingRs))}
                 </span>
               </div>
               <div id="recovery-row" class="calc-row text-warning" style="display:${calc.recoverableAmount > 0 ? 'flex' : 'none'}">
                 <span class="text-sm">Advance Recovery</span>
                 <span class="font-600">-${fmtR(calc.recoverableAmount / 100)}</span>
               </div>
               <div class="calc-row" style="border-top:1px dashed var(--border); margin-top:4px; padding-top:4px">
                 <span class="font-600">Adjusted Salary</span>
                 <span class="font-600" id="pay-adjusted-display">${fmtR(calc.adjustedSalary / 100)}</span>
               </div>
            </div>

            <div class="calc-row text-lg" style="border-top:2px solid var(--border); padding-top:12px; margin-top:12px">
              <span class="font-600">Total Net Payable:</span>
              <span class="amount amount-success font-700" style="font-size:1.4rem" id="pay-modal-net-view">${fmtR(netPayableRs)}</span>
            </div>
          </div>

          <!-- RIGHT COLUMN: PAYMENT INPUTS -->
          <div>
            <div class="form-group mb-4">
              <label class="form-label" style="color:var(--accent); font-size:1rem">Actual Amount Paid (₹)</label>
              <input id="ps-actual-paid" type="number" class="form-input" style="font-size:1.5rem; font-weight:800; padding:12px 16px; border-width:2px; border-color:var(--accent)" value="${Math.round(calc.suggestedPaidAmount / 100)}" min="0" step="10" />
              <div id="ps-carry-msg" class="text-sm mt-2 p-2 rounded" style="background:var(--bg-body); border-radius:8px">Match exactly to settle all dues.</div>
            </div>

            <div class="form-row mb-3">
              <div class="form-group">
                <label class="form-label">Food Allowance (₹)</label>
                <input id="ps-food-allow" type="number" class="form-input" value="${Math.round(foodRs)}" min="0" />
              </div>
              <div class="form-group">
                <label class="form-label">Travel Allowance (₹)</label>
                <input id="ps-travel-allow" type="number" class="form-input" value="${Math.round(travelRs)}" min="0" />
              </div>
            </div>

            <div class="form-row mb-3">
              <div class="form-group">
                <label class="form-label">Payment Mode</label>
                <select id="ps-mode" class="form-select">
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Bank">Bank Transfer</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Payment Date</label>
                <input id="ps-pay-date" type="date" class="form-input" value="${Helpers.todayIso()}" />
              </div>
            </div>

            <div class="form-group mb-3">
              <label class="form-label text-warning">Other Deductions (₹)</label>
              <input id="ps-other-ded" type="number" class="form-input" value="${Math.round(otherDedRs)}" min="0" />
            </div>

            <div class="form-group mb-2">
              <label class="form-label">Notes</label>
              <input id="ps-notes" class="form-input" placeholder="e.g. Paid via cash, check #123" />
            </div>
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" id="ps-cancel">Cancel</button>
        <button class="btn btn-primary" id="ps-save" style="padding: 10px 24px;">
          <span class="btn-text">Confirm & Save Payment</span>
          <span class="btn-loader" hidden></span>
        </button>
      `
    });

    const paidInp = document.getElementById('ps-actual-paid');
    const msgEl   = document.getElementById('ps-carry-msg');

    function recalculate(autoUpdatePaid) {
      const addedFood = parseFloat(document.getElementById('ps-food-allow').value) || 0;
      const addedTravel = parseFloat(document.getElementById('ps-travel-allow').value) || 0;
      const addedOtherDed = parseFloat(document.getElementById('ps-other-ded').value) || 0;

      document.getElementById('pay-food-display').textContent = fmtR(addedFood);
      document.getElementById('pay-travel-display').textContent = fmtR(addedTravel);

      const grossEarned = effectiveRs + otPayRs + addedFood + addedTravel + reimbursedRs + bonusRs;
      document.getElementById('pay-gross-display').textContent = fmtR(grossEarned);

      // Recovery logic in UI
      let recov = 0;
      if (openingRs < 0 && grossEarned > 0) {
        recov = Math.min(Math.abs(openingRs), grossEarned);
      }
      const adjSalary = grossEarned - recov;
      
      const recovRow = document.getElementById('recovery-row');
      if (recov > 0) {
        recovRow.style.display = 'flex';
        recovRow.querySelector('span:last-child').textContent = '-' + fmtR(recov);
      } else {
        recovRow.style.display = 'none';
      }
      document.getElementById('pay-adjusted-display').textContent = fmtR(adjSalary);

      const realTimeNet = Math.max(0, openingRs + grossEarned - addedOtherDed);
      document.getElementById('pay-modal-net-view').textContent = fmtR(realTimeNet);

      if (autoUpdatePaid) {
        paidInp.value = Math.round(realTimeNet);
      }

      const paying = parseFloat(paidInp.value) || 0;
      const closingBalance = openingRs + grossEarned - addedOtherDed - paying;

      if (Math.abs(closingBalance) < 0.01) {
         msgEl.innerHTML = '<span class="text-success">Settled. Closing Balance will be ₹0.</span>';
      } else if (closingBalance < 0) {
         msgEl.innerHTML = '<span class="text-danger">Closing Balance: ' + fmtR(closingBalance) + ' (Advance)</span>';
      } else {
         msgEl.innerHTML = '<span class="text-warning">Closing Balance: +' + fmtR(closingBalance) + ' (Pending)</span>';
      }
    }

    paidInp.addEventListener('input', function() { recalculate(false); });
    document.getElementById('ps-food-allow').addEventListener('input', function() { recalculate(true); });
    document.getElementById('ps-travel-allow').addEventListener('input', function() { recalculate(true); });
    document.getElementById('ps-other-ded').addEventListener('input', function() { recalculate(true); });
    recalculate(false);

    document.getElementById('ps-cancel').addEventListener('click', Modal.close);
    document.getElementById('ps-save').addEventListener('click', async () => {
      Helpers.setLoading('ps-save', true);

      const foodVal = parseFloat(document.getElementById('ps-food-allow').value) || 0;
      const travelVal = parseFloat(document.getElementById('ps-travel-allow').value) || 0;
      const salaryEarned = calc.effectiveSalary + calc.overtimePay + (foodVal * 100) + (travelVal * 100) + (calc.reimbursedExpenses || 0) + (calc.bonusAmount || 0);

      const payload = {
        employeeId:      calc.employeeId,
        month:           _filterMonth,
        year:            _filterYear,
        grossSalary:     calc.grossSalary,
        attendanceDays:  calc.attendanceDays,
        totalDays:       calc.totalDays,
        useAttendance:   calc.useAttendance,
        effectiveSalary: calc.effectiveSalary,
        salaryEarned:    salaryEarned,
        advanceDeducted: calc.recoverableAmount, // New system: advanceDeducted = amount recovered from balance
        otherDeductionsRupees: parseFloat(document.getElementById('ps-other-ded').value) || 0,
        foodAllowanceRupees:   foodVal,
        travelAllowanceRupees: travelVal,
        reimbursedExpenses:    calc.reimbursedExpenses || 0,
        bonusAmount:           calc.bonusAmount || 0,
        paidAmountRupees: parseFloat(paidInp.value) || 0,
        mode:            document.getElementById('ps-mode').value,
        paymentDate:     document.getElementById('ps-pay-date').value,
        notes:           document.getElementById('ps-notes').value,
        status:          'paid',
        createdBy:       AppState.get('user')?.id,
        presentDays:     calc.presentDays,
        halfDays:        calc.halfDays,
        absentDays:      calc.absentDays,
        woDays:          calc.woDays,
        overtimeHours:   calc.totalOvertimeHours,
        overtimePay:     calc.overtimePay
      };

      const r = await API.createPayment(payload);
      Helpers.setLoading('ps-save', false);

      if (r.success) {
        Toast.success('Payment recorded successfully!');
        Modal.close();
        load();
        EventBus.emit('data:refresh');
      } else {
        Toast.error(r.error);
      }
    });
  }

  function showProblemDates(empName, type, dates) {
    let title = '';
    if (type === 'unfinalized') title = 'Unfinalized Attendance Dates';
    else if (type === 'missing_project') title = 'Missing Project Dates';
    else if (type === 'pending_ot') title = 'Pending OT Review Dates';
    else title = 'Problem Dates';

    Modal.open({
      title: `${title} — ${empName}`,
      size: 'modal-sm',
      body: `
        <div class="alert alert-info mb-3" style="font-size: 0.82rem; padding: 8px 12px; margin-bottom: 12px">
          Click a date below to open that daily attendance sheet.
        </div>
        <div style="display:flex; flex-direction:column; gap:8px; max-height:260px; overflow-y:auto; padding:2px;">
          ${dates.map(date => `
            <button class="btn btn-secondary text-left flex justify-between items-center" 
                    style="width: 100%; font-size: 0.85rem; padding: 8px 12px;"
                    onclick="Modal.close(); Router.navigate('attendance', { date: '${date}', mode: 'bulk' })">
              <span>📅 ${Helpers.formatDate(date)}</span>
              <span class="text-xs" style="color:var(--accent)">Go to date →</span>
            </button>
          `).join('')}
        </div>
      `,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Close</button>`
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  return { init, showProblemDates };
})();
