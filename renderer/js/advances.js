/**
 * LocalPayroll — Advance & Recovery Management System
 * Premium Enterprise-Grade Redesign
 */

const AdvancesPage = (() => {
  const container = () => document.getElementById('page-advances');
  const headerActs = () => document.getElementById('page-header-actions');
  
  let _employees = [];
  let _projects = [];
  let _summaries = [];
  let _stats = {};
  
  let _view = 'ledger'; // 'ledger' | 'requests' | 'detail'
  let _currentEmpId = null;
  
  // Filters
  let _search = '';
  let _filterProject = '';
  let _filterStatus = '';
  let _filterOutstandingOnly = false;
  let _requestStatusFilter = 'pending';
  let _historyMonthFilter = '';
  let _historyYearFilter = '';
  let _searchTimeout = null;
  let _initialized = false;
  let _loading = false;
  let _initInProgress = false;

  async function init() {
    if (_initInProgress) return;
    _initInProgress = true;
    
    console.log('[AdvancesPage] Initializing...');
    
    const status = (msg) => {
      const cont = container();
      if (cont) {
        cont.innerHTML = `
          <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:300px; width:100%">
            <div class="btn-loader" style="width:40px; height:40px; border-width:4px; border-top-color:var(--accent); margin-bottom:15px"></div>
            <div style="color:var(--text-muted); font-size:0.9rem">${msg}</div>
          </div>
        `;
      }
    };

    try {
      status('Connecting to employee directory...');
      const empRes = await API.getEmployees({ status: 'active' });
      _employees = empRes.employees || [];
      
      status('Retrieving project list...');
      const projRes = await API.getProjects({ status: 'Ongoing', simple: true });
      _projects = projRes.projects || [];
      
      status('Calculating ledger summaries...');
      await loadData(true); // pass true to indicate it's the first load
      
      if (!_initialized) {
        EventBus.on('data:refresh', async () => {
          if (AppState.get('page') === 'advances') {
            await loadData();
          }
        });
        EventBus.on('data:advance', async () => {
          await loadData();
        });
        _initialized = true;
      }
    } catch (err) {
      console.error('[AdvancesPage.init]', err);
      container().innerHTML = `<div class="empty-state"><h3>Failed to load module</h3><p>${err.message}</p></div>`;
      Toast.error('Failed to initialize Advances module.');
    } finally {
      _initInProgress = false;
    }
  }

  function renderHeader() {
    const userRole = AppState.get('user')?.role;
    headerActs().innerHTML = `
      <div class="adv-v3-sticky-actions">
        <button id="adv-add-req-btn" class="btn-premium btn-purple">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          ${userRole === 'admin' ? 'New Advance' : 'New Request'}
        </button>
        <button id="adv-approval-queue-btn" class="btn-premium btn-warning" style="background: var(--warning); color: white; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.3);">
          Approval Queue
          ${_stats.pendingRequestsCount > 0 ? `<span class="badge" style="background: white; color: var(--warning); margin-left: 6px;">${_stats.pendingRequestsCount}</span>` : ''}
        </button>
        <button id="adv-export-ledger-btn" class="btn-premium btn-secondary">
          Export Ledger
        </button>
        <button id="adv-recovery-report-btn" class="btn-premium btn-ghost" style="border: 1.5px solid var(--border);">
          Recovery Report
        </button>
      </div>
    `;
    document.getElementById('adv-add-req-btn').addEventListener('click', openRequestForm);
    document.getElementById('adv-approval-queue-btn').addEventListener('click', () => { _view = 'requests'; loadData(); });
    document.getElementById('adv-export-ledger-btn').addEventListener('click', async () => {
      Toast.info('Generating bulk ledger export...');
      const res = await API.exportAdvanceLedgerExcel('all');
      if (res.success) Toast.success('Export completed.');
      else Toast.error(res.error);
    });
    document.getElementById('adv-recovery-report-btn').addEventListener('click', () => {
      Toast.info('Recovery Report engine initializing...');
    });
  }

  async function loadData(isInitial = false) {
    if (_loading && !isInitial) return;
    _loading = true;
    
    try {
      if (_view === 'ledger') {
        const res = await API.getAdvanceEmployeeSummaries({ 
          search: _search, 
          outstandingOnly: _filterOutstandingOnly,
          projectId: _filterProject
        });
        if (res.success) {
          _summaries = res.summaries || [];
          _summaries.sort((a, b) => {
            const outA = a.outstanding || 0;
            const outB = b.outstanding || 0;
            if (outA !== outB) return outB - outA;
            return (a.name || '').localeCompare(b.name || '');
          });
          _stats = res.stats;
          renderHeader();
          renderLedgerView();
        } else {
          container().innerHTML = '<div class="empty-state"><p>Error loading ledger: ' + res.error + '</p></div>';
        }
      } else if (_view === 'requests') {
        const res = await API.getAdvanceRequests({ status: _requestStatusFilter });
        if (res.success) {
          const reqs = res.requests || [];
          reqs.sort((a, b) => {
            const getWeight = (s) => {
              if (s === 'pending') return 1;
              if (s === 'approved') return 2;
              if (s === 'paid') return 3;
              if (s === 'rejected') return 4;
              return 5;
            };
            const wA = getWeight(a.status);
            const wB = getWeight(b.status);
            if (wA !== wB) return wA - wB;
            
            const dateA = a.request_date || '';
            const dateB = b.request_date || '';
            return dateB.localeCompare(dateA); // Newest first
          });
          renderRequestsView(reqs);
        } else {
          container().innerHTML = '<div class="empty-state"><p>Error loading requests: ' + res.error + '</p></div>';
        }
      } else if (_view === 'history') {
        const res = await API.getAdvances({ 
          month: _historyMonthFilter,
          year: _historyYearFilter
        });
        if (res.success) {
          renderHistoryView(res.advances);
        } else {
          container().innerHTML = '<div class="empty-state"><p>Error loading history: ' + res.error + '</p></div>';
        }
      } else if (_view === 'closed') {
        const res = await API.getAdvanceEmployeeSummaries({ 
          outstandingOnly: false,
          projectId: _filterProject
        });
        if (res.success) {
          const closed = res.summaries.filter(s => s.outstanding <= 0);
          closed.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          renderClosedView(closed);
        } else {
          container().innerHTML = '<div class="empty-state"><p>Error loading closed accounts: ' + res.error + '</p></div>';
        }
      }
    } catch (err) {
      console.error('[AdvancesPage.loadData]', err);
      container().innerHTML = `<div class="empty-state"><p>Critical error loading data: ${err.message}</p></div>`;
    } finally {
      _loading = false;
    }
  }

  function renderHistoryView(txs) {
    const userRole = AppState.get('user')?.role;
    const months = [
      { val: '1', name: 'January' }, { val: '2', name: 'February' }, { val: '3', name: 'March' },
      { val: '4', name: 'April' }, { val: '5', name: 'May' }, { val: '6', name: 'June' },
      { val: '7', name: 'July' }, { val: '8', name: 'August' }, { val: '9', name: 'September' },
      { val: '10', name: 'October' }, { val: '11', name: 'November' }, { val: '12', name: 'December' }
    ];
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let y = currentYear - 2; y <= currentYear + 2; y++) {
      years.push(y.toString());
    }

    container().innerHTML = `
      <div class="adv-v3-container">
        <div class="adv-v3-main">
          ${renderTabsV2()}
          <div class="adv-v3-filters" style="display:flex; gap:12px; align-items:center;">
             <div class="text-sm font-700 uppercase color-muted" style="margin-right:auto">Transaction Stream</div>
             
             <select id="adv-hist-month-filter" class="form-select" style="width:160px; margin-bottom:0">
               <option value="">All Months</option>
               ${months.map(m => `<option value="${m.val}" ${_historyMonthFilter === m.val ? 'selected' : ''}>${m.name}</option>`).join('')}
             </select>

             <select id="adv-hist-year-filter" class="form-select" style="width:120px; margin-bottom:0">
               <option value="">All Years</option>
               ${years.map(y => `<option value="${y}" ${_historyYearFilter === y ? 'selected' : ''}>${y}</option>`).join('')}
             </select>
          </div>
          <div class="table-wrap" style="border:none">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th style="text-align:right">Amount</th>
                  ${userRole === 'admin' ? '<th style="text-align:center; width: 80px;">Actions</th>' : ''}
                </tr>
              </thead>
              <tbody>
                ${txs.length === 0 ? '<tr><td colspan="5" class="text-center p-5">No recent transactions.</td></tr>' : txs.map(tx => `
                  <tr>
                    <td class="text-sm text-muted">${Helpers.formatDate(tx.date)}</td>
                    <td class="font-600">${Helpers.escapeHtml(tx.employee_name || 'System')}</td>
                    <td><span class="badge ${tx.type === 'ADVANCE' ? 'badge-danger' : 'badge-success'}">${tx.type}</span></td>
                    <td class="text-sm">
                      <div>${Helpers.escapeHtml(tx.notes || '—')}</div>
                      <div class="text-xs text-muted" style="margin-top: 4px;">
                        ${tx.mode ? 'Via ' + tx.mode : ''}
                        ${tx.requester_name ? ` • Req by: <strong>${Helpers.escapeHtml(tx.requester_name)}</strong>${tx.request_date ? ' on ' + Helpers.formatDate(tx.request_date) : ''}` : ''}
                        ${tx.approver_name ? ` • Appr by: <strong>${Helpers.escapeHtml(tx.approver_name)}</strong>` : (tx.operator_name ? ` • By: <strong>${Helpers.escapeHtml(tx.operator_name)}</strong>` : '')}
                      </div>
                    </td>
                    <td style="text-align:right" class="amount font-700">${API.fmtRupees(tx.amount)}</td>
                    ${userRole === 'admin' ? `
                      <td style="text-align:center">
                        ${tx.type === 'ADVANCE' ? `<button class="btn btn-sm btn-danger delete-adv-btn" data-id="${tx.id}" data-emp-name="${Helpers.escapeHtml(tx.employee_name || 'System')}" data-amount="${API.fmtRupees(tx.amount)}" title="Delete Payment">Delete</button>` : '—'}
                      </td>
                    ` : ''}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    if (userRole === 'admin') {
      container().querySelectorAll('.delete-adv-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const advId = parseInt(btn.dataset.id);
          const empName = btn.dataset.empName;
          const amountStr = btn.dataset.amount;
          Modal.confirm(`Are you sure you want to delete the advance payment of <strong>${amountStr}</strong> for <strong>${Helpers.escapeHtml(empName)}</strong>? This will revert the employee balance.`, async () => {
            Helpers.setLoading(btn, true);
            const res = await API.deleteAdvance(advId);
            Helpers.setLoading(btn, false);
            if (res.success) {
              Toast.success('Advance payment deleted successfully.');
              loadData(); // Reload history view
            } else {
              Toast.error(res.error);
            }
          });
        });
      });
    }

    attachEvents();
  }

  function renderClosedView(closed) {
    container().innerHTML = `
      <div class="adv-v3-container">
        <div class="adv-v3-main">
          ${renderTabsV2()}
          <div class="adv-v3-filters">
             <div class="text-sm font-700 uppercase color-muted">Settled Advance Accounts</div>
          </div>
          <div class="adv-v3-rows">
            ${closed.length === 0 
              ? '<div class="empty-state"><h3>No settled accounts found</h3><p>Accounts will appear here once fully recovered.</p></div>' 
              : closed.map(s => renderLedgerRow(s)).join('')}
          </div>
        </div>
      </div>
    `;
    attachEvents();
  }

  function renderStatsGrid() {
    return `
      <div class="adv-v3-kpi-grid">
        <div class="adv-v3-kpi-card red">
          <div class="kpi-icon">💸</div>
          <div class="kpi-label">Total Outstanding</div>
          <div class="kpi-value">${API.fmtRupees(_stats.totalOutstanding)}</div>
          <div class="kpi-subtext">Across ${_stats.activeAdvanceEmployees} employee${_stats.activeAdvanceEmployees !== 1 ? 's' : ''}</div>
        </div>
        <div class="adv-v3-kpi-card blue">
          <div class="kpi-icon">👥</div>
          <div class="kpi-label">Active Advance Accounts</div>
          <div class="kpi-value">${_stats.activeAdvanceEmployees}</div>
          <div class="kpi-subtext">Currently under recovery</div>
        </div>
        <div class="adv-v3-kpi-card green">
          <div class="kpi-icon">📥</div>
          <div class="kpi-label">Recovered This Month</div>
          <div class="kpi-value">${API.fmtRupees(_stats.recoveredThisMonth)}</div>
          <div class="kpi-subtext">From payroll deductions</div>
        </div>
        <div class="adv-v3-kpi-card orange">
          <div class="kpi-icon">🕒</div>
          <div class="kpi-label">Pending Approvals</div>
          <div class="kpi-value">${_stats.pendingRequestsCount || 0}</div>
          <div class="kpi-subtext">Awaiting admin review</div>
          ${_stats.pendingRequestsCount > 0 ? '<div class="badge badge-warning pulse" style="position:absolute; top:12px; right:12px">Action Required</div>' : ''}
        </div>
      </div>
    `;
  }

  function renderTabsV2() {
    return `
      <div class="adv-v3-tabs">
        <div class="adv-v3-tab ${_view === 'ledger' ? 'active' : ''}" data-view="ledger">
          Active Ledger
          <span class="tab-count">${_summaries.length}</span>
        </div>
        <div class="adv-v3-tab ${_view === 'requests' ? 'active' : ''}" data-view="requests">
          Pending Approvals
          ${_stats.pendingRequestsCount > 0 ? '<span class="tab-count" style="background:var(--danger-faint); color:var(--danger)">' + _stats.pendingRequestsCount + '</span>' : ''}
        </div>
        <div class="adv-v3-tab ${_view === 'history' ? 'active' : ''}" data-view="history">
          Recovery History
        </div>
        <div class="adv-v3-tab ${_view === 'closed' ? 'active' : ''}" data-view="closed">
          Closed Accounts
        </div>
      </div>
    `;
  }

  function renderLedgerView() {
    container().innerHTML = `
      <div class="adv-v3-container">
        ${renderStatsGrid()}

        <div class="adv-v3-layout">
          <div class="adv-v3-main">
            ${renderTabsV2()}
            
            <div class="adv-v3-filters">
                <div class="search-bar" style="flex: 1; max-width: 400px;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input id="adv-v2-search" class="form-input" placeholder="Search by name or ID..." value="${Helpers.escapeHtml(_search)}" />
                </div>
                <div class="text-xs text-muted font-600 uppercase ml-3">Showing All Staff Records</div>

                <div style="margin-left: auto; display: flex; gap: 8px;">
                   <button class="btn btn-icon btn-secondary" title="Refresh" onclick="AdvancesPage.init()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                   </button>
                </div>
            </div>

            <div class="adv-v3-table">
              <div class="adv-v3-table-header">
                <div>Employee & Identity</div>
                <div>Project / Site</div>
                <div>Recovery Progress</div>
                <div style="text-align:right">Outstanding</div>
                <div style="text-align:center">Action</div>
              </div>
              
              <div class="adv-v3-rows">
                ${_summaries.length === 0 
                  ? '<div class="empty-state"><h3>No active advances found</h3><p>Try adjusting your filters or add a new request.</p></div>' 
                  : _summaries.map(s => renderLedgerRow(s)).join('')}
              </div>
            </div>
          </div>

          <div class="adv-v3-sidebar">
            ${renderSidebarWidgets()}
          </div>
        </div>
      </div>
    `;

    attachEvents();
  }

  function renderLedgerRow(s) {
    const name = s.name || 'Unknown Employee';
    const avatarTxt = name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
    const progress = Math.min(100, Math.round((s.totalRecovered / s.totalGiven) * 100) || 0);
    
    return `
      <div class="adv-v3-row">
        <div class="adv-v3-emp-info">
          <div class="adv-v3-avatar">${avatarTxt}</div>
          <div>
            <div class="font-700">${Helpers.escapeHtml(s.name)}</div>
            <div class="text-xs text-muted">EMP${String(s.id).padStart(3,'0')} • ${Helpers.escapeHtml(s.role || 'Staff')}</div>
          </div>
        </div>

        <div>
          <div class="text-sm font-600">${Helpers.escapeHtml(s.projectName || 'Main Project')}</div>
          <div class="text-xs text-muted">${Helpers.escapeHtml(s.site || 'Mumbai')}</div>
        </div>

        <div class="adv-v3-metrics">
          <div class="adv-v3-progress-wrap">
            <div class="adv-v3-progress-labels">
               <span>Recovered ${API.fmtRupees(s.totalRecovered)} / ${API.fmtRupees(s.totalGiven)}</span>
               <span>${progress}%</span>
            </div>
            <div class="adv-v3-progress-bar">
               <div class="adv-v3-progress-fill" style="width: ${progress}%; background: ${progress === 100 ? 'var(--success)' : 'var(--accent)'}"></div>
            </div>
          </div>
        </div>

        <div style="text-align:right">
          <div class="amount text-danger font-800" style="font-size:1.1rem">${API.fmtRupees(s.outstanding)}</div>
          <div class="status-pill ${s.outstanding > 0 ? 'outstanding' : 'settled'}" style="margin-top:4px">
            ${s.outstanding > 0 ? 'Outstanding' : 'Settled'}
          </div>
        </div>

        <div style="text-align:center">
          <button class="btn btn-sm btn-secondary view-ledger-btn" data-id="${s.id}" style="border-radius:10px">
            View Ledger
          </button>
        </div>
      </div>
    `;
  }

  function renderSidebarWidgets() {
    const highOutstanding = _summaries.filter(s => s.outstanding > 20000); 
    
    return `
      <div class="adv-v3-widget">
        <div class="adv-v3-widget-title">
          <span>Operational Queue</span>
          <span class="badge badge-accent">${_stats.pendingRequestsCount || 0}</span>
        </div>
        <div class="adv-widget-list">
          <div class="adv-widget-item" onclick="AdvancesPage.switchView('requests')">
            <div class="icon" style="background: var(--accent-faint); color: var(--accent);">💸</div>
            <div class="text">Advance Requests</div>
            <div class="arrow">${_stats.pendingRequestsCount || 0}</div>
          </div>
          <div class="adv-widget-item" style="opacity:0.6">
            <div class="icon" style="background: var(--warning-faint); color: var(--warning);">🕒</div>
            <div class="text">Recovery Warnings</div>
            <div class="arrow">2</div>
          </div>
        </div>
      </div>

      <div class="adv-v3-widget">
        <div class="adv-v3-widget-title">Quick Actions</div>
        <div class="adv-widget-list">
          <div class="adv-widget-item" onclick="AdvancesPage.openBulkWhatsApp()">
            <div class="icon">💬</div>
            <div class="text">WhatsApp Summary</div>
            <div class="arrow">›</div>
          </div>
          <div class="adv-widget-item" onclick="API.exportAdvanceLedgerExcel('all')">
            <div class="icon">📊</div>
            <div class="text">Export Outstanding</div>
            <div class="arrow">›</div>
          </div>
        </div>
      </div>

      <div class="adv-v3-widget">
        <div class="adv-v3-widget-title">🚨 System Alerts</div>
        <div class="adv-v3-alerts">
          ${highOutstanding.length > 0 ? `
            <div class="adv-v3-alert">
              <div class="adv-v3-alert-title">High Outstanding Balance</div>
              <div class="adv-v3-alert-desc">${highOutstanding.length} employee(s) exceed ₹20,000. Review ledger.</div>
            </div>
          ` : ''}
          <div class="adv-v3-alert warning">
            <div class="adv-v3-alert-title">Recovery Alert</div>
            <div class="adv-v3-alert-desc">Check missing deductions for the current month.</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderRequestsView(requests) {
    const userRole = AppState.get('user')?.role;
    container().innerHTML = `
      <div class="adv-v3-container">
        <div class="adv-v3-main" style="min-height: 500px;">
          ${renderTabsV2()}
          
          <div class="adv-v3-filters">
             <select id="adv-req-status-filter" class="form-select" style="width:240px">
               <option value="pending" ${_requestStatusFilter === 'pending' ? 'selected' : ''}>Pending Admin Approval</option>
               <option value="approved" ${_requestStatusFilter === 'approved' ? 'selected' : ''}>Approved Requests</option>
               <option value="paid" ${_requestStatusFilter === 'paid' ? 'selected' : ''}>Paid (Released)</option>
               <option value="rejected" ${_requestStatusFilter === 'rejected' ? 'selected' : ''}>Rejected</option>
               <option value="">All Requests</option>
             </select>
          </div>

          <div class="table-wrap" style="border:none; border-radius:0">
            <table>
              <thead>
                <tr>
                  <th>Requested Date</th>
                  <th>Employee</th>
                  <th style="text-align:right">Amount</th>
                  <th style="text-align:right">Approved</th>
                  <th>Status</th>
                  <th style="text-align:center">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${requests.length === 0 ? '<tr><td colspan="6" class="text-center p-5 text-muted">No pending requests found.</td></tr>' : requests.map(r => `
                  <tr>
                    <td class="text-sm text-muted">
                      <div>${Helpers.formatDate(r.request_date)}</div>
                      ${r.paid_at ? `<div class="text-xs text-success" style="margin-top:2px; font-weight:600;">Released: ${Helpers.formatDate(r.paid_at)}</div>` : ''}
                    </td>
                    <td>
                      <div class="font-700">${Helpers.escapeHtml(r.employee_name)}</div>
                      <div class="text-xs text-muted">${Helpers.escapeHtml(r.reason || 'General Advance')}</div>
                      <div class="text-xs text-muted" style="margin-top: 4px; font-size: 0.75rem; opacity: 0.8;">
                        Requested by: <strong>${Helpers.escapeHtml(r.created_by_name || 'System')}</strong> on ${Helpers.formatDate(r.request_date)}
                        ${r.approved_by_name ? ` • Approved by: <strong>${Helpers.escapeHtml(r.approved_by_name)}</strong>${r.paid_at ? ' on ' + Helpers.formatDate(r.paid_at) : ''}` : ''}
                      </div>
                    </td>
                    <td style="text-align:right" class="amount font-700">${API.fmtRupees(r.requested_amount)}</td>
                    <td style="text-align:right" class="amount text-accent">${r.approved_amount ? API.fmtRupees(r.approved_amount) : '—'}</td>
                    <td>${statusBadge(r.status)}</td>
                    <td style="text-align:center">
                      <div class="flex gap-2 justify-center">
                        ${r.status === 'pending' && userRole === 'admin' ? `
                          <button class="btn btn-sm btn-success req-approve-btn" data-id="${r.id}" data-amount="${r.requested_amount}" data-emp-name="${Helpers.escapeHtml(r.employee_name)}" data-emp-phone="${Helpers.escapeHtml(r.employee_phone || '')}">Approve</button>
                          <button class="btn btn-sm btn-danger req-reject-btn" data-id="${r.id}">Reject</button>
                        ` : ''}
                        ${r.status === 'approved' && userRole === 'admin' ? `
                          <button class="btn btn-sm btn-primary req-pay-btn" data-id="${r.id}" data-amount="${r.approved_amount || r.requested_amount}">Release</button>
                        ` : ''}
                        ${r.status === 'paid' && userRole === 'admin' ? `
                          <button class="btn btn-sm btn-danger req-del-btn" data-id="${r.id}" title="Revert Payment & Delete Request">✕</button>
                        ` : ''}
                        <button class="btn btn-icon btn-ghost req-wa-btn" data-id="${r.id}" data-emp="${Helpers.escapeHtml(r.employee_name)}" data-phone="${Helpers.escapeHtml(r.employee_phone || '')}" data-amt="${API.toRupees(r.approved_amount || r.requested_amount)}" data-date="${Helpers.escapeHtml(r.paid_at || r.request_date || '')}" data-mode="${Helpers.escapeHtml(r.payment_mode || 'Cash')}" title="WhatsApp Confirmation">💬</button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    attachEvents();
    
    document.getElementById('adv-req-status-filter')?.addEventListener('change', e => {
      _requestStatusFilter = e.target.value;
      loadData();
    });
  }

  function statusBadge(s) {
    const map = { pending: 'badge-warning', approved: 'badge-success', rejected: 'badge-danger', paid: 'badge-accent' };
    const labels = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', paid: 'Released' };
    return '<span class="badge ' + (map[s] || 'badge-muted') + '">' + (labels[s] || s.toUpperCase()) + '</span>';
  }

  async function openLedger(empId) {
    _view = 'detail';
    _currentEmpId = empId;
    container().innerHTML = '<div class="empty-state"><h3>Loading Ledger Details...</h3></div>';
    const res = await API.getAdvanceEmployeeLedger(empId);
    if (res.success) {
      renderLedgerDetail(res.employee, res.transactions, res.summary);
    } else {
      Toast.error(res.error);
      _view = 'ledger';
      loadData();
    }
  }

  function renderLedgerDetail(emp, txs, summary) {
    const userRole = AppState.get('user')?.role;
    const avatarTxt = emp.name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
    container().innerHTML = `
      <div class="adv-v3-container">
        <div class="flex items-center gap-4">
          <button id="adv-back-btn" class="btn btn-secondary btn-sm" style="border-radius:10px">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px"><polyline points="15 18 9 12 15 6"/></svg>
            Back to Overview
          </button>
        </div>

        <div class="adv-v3-layout">
          <div class="adv-v3-main">
             <div class="p-5 flex items-center gap-4" style="background: var(--bg-card); border-bottom: 1px solid var(--border);">
                <div class="adv-v3-avatar" style="width:56px; height:56px; font-size:1.3rem">${avatarTxt}</div>
                <div class="flex-1">
                   <h2 class="h2 mb-0">${Helpers.escapeHtml(emp.name)}</h2>
                   <div class="text-sm text-muted">Employee ID: EMP${String(emp.id).padStart(3,'0')} • ${Helpers.escapeHtml(emp.role)}</div>
                </div>
                 <div class="flex gap-2">
                  <button id="adv-wa-stmt-btn" class="btn btn-success btn-sm">💬 WhatsApp Statement</button>
                  <button id="adv-export-pdf-btn" class="btn btn-secondary btn-sm">Export Excel Ledger</button>
                </div>
             </div>

             <div style="background: var(--bg-input); padding: 24px; border-bottom: 1px solid var(--border); display: flex; gap: 48px;">
                <div>
                  <div class="text-xs text-muted font-700 uppercase mb-1">Total Advance Issued</div>
                  <div class="h3 mb-0 amount">${API.fmtRupees(summary.totalGiven)}</div>
                </div>
                <div>
                  <div class="text-xs text-muted font-700 uppercase mb-1">Total Recovered</div>
                  <div class="h3 mb-0 amount text-success">${API.fmtRupees(summary.totalRecovered)}</div>
                </div>
                <div style="margin-left: auto; text-align: right;">
                  <div class="text-xs text-muted font-700 uppercase mb-1">Outstanding Advance</div>
                  <div class="h2 mb-0 amount text-danger">${API.fmtRupees(summary.outstanding)}</div>
                </div>
             </div>

             <div class="table-wrap" style="border:none; border-radius:0">
               <table>
                 <thead>
                   <tr>
                     <th>Date</th>
                     <th>Transaction Type</th>
                     <th>Notes / Description</th>
                     <th style="text-align:right">Debit (+)</th>
                     <th style="text-align:right">Credit (-)</th>
                     <th style="text-align:right">Balance</th>
                     ${userRole === 'admin' ? '<th style="text-align:center; width: 80px;">Actions</th>' : ''}
                   </tr>
                 </thead>
                 <tbody>
                   ${txs.length === 0 ? '<tr><td colspan="6" class="text-center p-5">No transaction history found.</td></tr>' : txs.map(tx => {
                     const isAdv = tx.type === 'ADVANCE';
                     const isRec = tx.type === 'RECOVERY';
                     return `
                       <tr>
                         <td class="text-sm font-600">${Helpers.formatDate(tx.date)}</td>
                         <td>
                           <span class="badge ${isAdv ? 'badge-danger' : 'badge-success'}" style="font-size:10px">
                             ${tx.type}
                           </span>
                         </td>
                         <td class="text-sm">
                           <div>${Helpers.escapeHtml(tx.notes || '—')}</div>
                           ${tx.mode ? '<div class="text-xs text-muted">Via ' + tx.mode + '</div>' : ''}
                         </td>
                         <td style="text-align:right" class="amount ${isAdv ? 'text-danger' : ''}">${tx.debit > 0 ? API.fmtRupees(tx.debit) : '—'}</td>
                         <td style="text-align:right" class="amount ${isRec ? 'text-success' : ''}">${tx.credit > 0 ? API.fmtRupees(tx.credit) : '—'}</td>
                         <td style="text-align:right" class="amount font-700">${API.fmtRupees(tx.runningBalance)}</td>
                         ${userRole === 'admin' ? `
                           <td style="text-align:center">
                             ${isAdv ? `<button class="btn btn-sm btn-danger delete-adv-btn" data-id="${tx.id}" data-emp-name="${Helpers.escapeHtml(emp.name)}" data-amount="${API.fmtRupees(tx.debit)}" title="Delete Payment">Delete</button>` : '—'}
                           </td>
                         ` : ''}
                       </tr>
                     `;
                   }).join('')}
                 </tbody>
               </table>
             </div>
          </div>

          <div class="adv-v3-sidebar">
             <div class="adv-v3-widget">
               <div class="adv-v3-widget-title">Quick Actions</div>
               <div class="adv-widget-list">
                 <div class="adv-widget-item" id="act-add-adv"><div class="icon">➕</div><div class="text">Issue New Advance</div></div>
                 <div class="adv-widget-item" id="act-add-rec"><div class="icon">📥</div><div class="text">Manual Recovery</div></div>
               </div>
             </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('adv-back-btn').addEventListener('click', () => { _view = 'ledger'; loadData(); });
    document.getElementById('adv-export-pdf-btn').addEventListener('click', () => API.exportAdvanceLedgerExcel(emp.id));
    document.getElementById('adv-wa-stmt-btn').addEventListener('click', () => openWhatsAppStatement(emp, summary));
    document.getElementById('act-add-adv').addEventListener('click', () => openManualEntryForm('ADVANCE', emp));
    document.getElementById('act-add-rec').addEventListener('click', () => openManualEntryForm('RECOVERY', emp));

    if (userRole === 'admin') {
      container().querySelectorAll('.delete-adv-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const advId = parseInt(btn.dataset.id);
          const empName = btn.dataset.empName;
          const amountStr = btn.dataset.amount;
          Modal.confirm(`Are you sure you want to delete the advance payment of <strong>${amountStr}</strong> for <strong>${Helpers.escapeHtml(empName)}</strong>? This will revert the employee balance.`, async () => {
            Helpers.setLoading(btn, true);
            const res = await API.deleteAdvance(advId);
            Helpers.setLoading(btn, false);
            if (res.success) {
              Toast.success('Advance payment deleted successfully.');
              openLedger(emp.id); // Reload the ledger detail view
            } else {
              Toast.error(res.error);
            }
          });
        });
      });
    }
  }

  function openWhatsAppStatement(emp, summary) {
    const msg = `Hello ${emp.name},\n\nYour current advance ledger status at LocalPayroll:\nTotal Advance: ${API.fmtRupees(summary.totalGiven)}\nTotal Recovered: ${API.fmtRupees(summary.totalRecovered)}\n*Outstanding Balance: ${API.fmtRupees(summary.outstanding)}*\n\nPlease contact HR for a detailed statement.`;
    
    let url = '';
    const phone = emp.phone || '';
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      const formattedPhone = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
      url = `https://api.whatsapp.com/send/?phone=${formattedPhone}&text=${encodeURIComponent(msg)}`;
    } else {
      url = `https://api.whatsapp.com/send/?text=${encodeURIComponent(msg)}`;
    }
    window.open(url, '_blank');
  }

  function openBulkWhatsApp() {
    Toast.info('Preparing bulk WhatsApp broadcasts...');
  }

  function openManualEntryForm(type, emp) {
    const isAdv = type === 'ADVANCE';
    Modal.open({
      title: isAdv ? 'Issue New Advance' : 'Manual Recovery Entry',
      body: `
        <div class="form-group mb-4">
          <label class="form-label">Employee</label>
          <input class="form-input" value="${Helpers.escapeHtml(emp.name)}" disabled />
        </div>
        <div class="form-row mb-4">
          <div class="form-group">
            <label class="form-label">Amount (₹)</label>
            <input type="number" id="mef-amount" class="form-input" placeholder="0.00" />
          </div>
          <div class="form-group">
            <label class="form-label">Date</label>
            <input type="date" id="mef-date" class="form-input" value="${Helpers.todayIso()}" />
          </div>
        </div>
        <div class="form-group mb-4">
          <label class="form-label">Payment Mode</label>
          <select id="mef-mode" class="form-select">
            <option value="Cash">Cash</option><option value="UPI">UPI</option><option value="Bank">Bank Transfer</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Internal Notes / Description</label>
          <textarea id="mef-notes" class="form-input" rows="2" placeholder="Describe the transaction..."></textarea>
        </div>
      `,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn ${isAdv ? 'btn-danger' : 'btn-success'}" id="mef-submit">Confirm Transaction</button>`
    });

    document.getElementById('mef-submit').addEventListener('click', async () => {
      const data = {
        employeeId: emp.id,
        amount: parseFloat(document.getElementById('mef-amount').value) || 0,
        date: document.getElementById('mef-date').value,
        type: type,
        mode: document.getElementById('mef-mode').value,
        notes: document.getElementById('mef-notes').value.trim(),
      };
      if (data.amount <= 0) return Toast.error('Please enter a valid amount.');
      
      Helpers.setLoading('mef-submit', true);
      const res = await API.addAdvance(data);
      Helpers.setLoading('mef-submit', false);
      
      if (res.success) {
        Toast.success('Transaction recorded successfully.');
        Modal.close();
        openLedger(emp.id); // Refresh ledger
      } else Toast.error(res.error);
    });
  }

  function attachEvents() {
    container().querySelectorAll('.adv-v3-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (tab.style.opacity === '0.5') return;
        _view = tab.dataset.view;
        loadData();
      });
    });

    document.getElementById('adv-v2-search')?.addEventListener('input', e => {
      _search = e.target.value;
      if (_searchTimeout) clearTimeout(_searchTimeout);
      _searchTimeout = setTimeout(() => loadData(), 300);
    });

    container().querySelectorAll('.view-ledger-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openLedger(parseInt(btn.dataset.id));
      });
    });

    container().querySelectorAll('.req-approve-btn').forEach(btn => {
      btn.addEventListener('click', () => openApprovalModal(
        parseInt(btn.dataset.id), 
        parseFloat(btn.dataset.amount),
        btn.dataset.empName,
        btn.dataset.empPhone
      ));
    });

    container().querySelectorAll('.req-reject-btn').forEach(btn => {
      btn.addEventListener('click', () => updateRequestStatus(parseInt(btn.dataset.id), 'rejected'));
    });

    container().querySelectorAll('.req-pay-btn').forEach(btn => {
      btn.addEventListener('click', () => openPaymentModal(parseInt(btn.dataset.id), parseFloat(btn.dataset.amount)));
    });

    container().querySelectorAll('.req-wa-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        Toast.info('WhatsApp button clicked. Preparing message...');
        const empName = btn.dataset.emp;
        const phone = btn.dataset.phone || '';
        const amt = parseFloat(btn.dataset.amt || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
        const dateRaw = btn.dataset.date || '';
        const date = dateRaw ? Helpers.formatDate(dateRaw) : '';
        const mode = btn.dataset.mode || 'Cash';
        
        const msg = `Dear ${empName},\n\nWe are pleased to inform you that your advance request has been approved and released.\n\nDetails of the Transaction:\n• Amount: ₹${amt}\n• Payment Mode: ${mode}\n• Release Date: ${date}\n\nThe advance amount will be adjusted in your upcoming salary cycle.\n\nRegards,\nPayroll Management`;
        
        let url = '';
        if (phone) {
          const cleanPhone = phone.replace(/\D/g, '');
          const formattedPhone = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
          url = `https://api.whatsapp.com/send/?phone=${formattedPhone}&text=${encodeURIComponent(msg)}`;
        } else {
          url = `https://api.whatsapp.com/send/?text=${encodeURIComponent(msg)}`;
        }
        
        Toast.info('Opening URL: ' + url);
        window.open(url, '_blank');
      });
    });

    container().querySelectorAll('.req-del-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteRequest(parseInt(btn.dataset.id)));
    });

    document.getElementById('adv-hist-month-filter')?.addEventListener('change', e => {
      _historyMonthFilter = e.target.value;
      loadData();
    });
    
    document.getElementById('adv-hist-year-filter')?.addEventListener('change', e => {
      _historyYearFilter = e.target.value;
      loadData();
    });
  }

  // --- Modals ---
  function openRequestForm() {
    let defaultEmpName = '';
    let isPreSelected = false;
    
    if (_view === 'detail' && _currentEmpId) {
       const emp = _employees.find(e => e.id === _currentEmpId);
       if (emp) {
         defaultEmpName = `${emp.name} (EMP${emp.id})`;
         isPreSelected = true;
       }
    }

    Modal.open({
      title: 'New Advance Request',
      body: `
        <div class="form-group mb-4">
          <label class="form-label">${isPreSelected ? 'Employee' : 'Search Employee'}</label>
          <input list="arf-emp-list" id="arf-emp-search" class="form-input" placeholder="Type name or ID..." autocomplete="off" value="${Helpers.escapeHtml(defaultEmpName)}" ${isPreSelected ? 'disabled' : ''} />
          <datalist id="arf-emp-list">
            ${_employees.map(e => '<option value="' + Helpers.escapeHtml(e.name) + ' (EMP' + e.id + ')"></option>').join('')}
          </datalist>
        </div>
        <div class="form-row mb-4">
          <div class="form-group">
            <label class="form-label">Requested Amount (₹)</label>
            <input type="number" id="arf-amount" class="form-input" placeholder="0.00" />
          </div>
          <div class="form-group">
            <label class="form-label">Effective Date</label>
            <input type="date" id="arf-date" class="form-input" value="${Helpers.todayIso()}" />
          </div>
        </div>
        <div class="form-group mb-4">
          <label class="form-label">Reason for Advance</label>
          <input type="text" id="arf-reason" class="form-input" placeholder="e.g. Personal Emergency, Travel" />
        </div>
        <div class="form-group">
          <label class="form-label">Internal Notes</label>
          <textarea id="arf-notes" class="form-input" rows="2" placeholder="Additional context for approval..."></textarea>
        </div>
      `,
      footer: '<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" id="arf-submit">Submit Request</button>'
    });

    document.getElementById('arf-submit').addEventListener('click', async () => {
      const empVal = document.getElementById('arf-emp-search').value;
      const match = empVal.match(/\(EMP(\d+)\)$/);
      const employeeId = match ? parseInt(match[1]) : 0;

      const data = {
        employeeId: employeeId,
        requestedAmount: parseFloat(document.getElementById('arf-amount').value) || 0,
        requestDate: document.getElementById('arf-date').value,
        reason: document.getElementById('arf-reason').value.trim(),
        notes: document.getElementById('arf-notes').value.trim(),
      };
      if (!data.employeeId || data.requestedAmount <= 0) return Toast.error('Please enter valid data.');
      Helpers.setLoading('arf-submit', true);
      const res = await API.createAdvanceRequest(data);
      Helpers.setLoading('arf-submit', false);
      if (res.success) {
        Toast.success('Request submitted for approval.');
        Modal.close();
        _view = 'requests';
        loadData();
      } else Toast.error(res.error);
    });
  }

  function openApprovalModal(requestId, reqAmountPaisa, empName, empPhone) {
    const reqAmountRs = reqAmountPaisa / 100;
    Modal.open({
      title: 'Approve & Release Advance Request',
      body: `
        <div class="alert alert-info mb-4">The employee requested <strong>₹${reqAmountRs.toLocaleString('en-IN')}</strong>.</div>
        <div class="form-group mb-4">
          <label class="form-label">Final Approved Amount (₹)</label>
          <input type="number" id="aaf-amount" class="form-input" value="${reqAmountRs}" />
        </div>
        <div class="form-row mb-4">
          <div class="form-group">
            <label class="form-label">Payment Mode</label>
            <select id="aaf-mode" class="form-select">
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Bank">Bank Transfer</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Release Date</label>
            <input type="date" id="aaf-date" class="form-input" value="${Helpers.todayIso()}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Approval Remarks</label>
          <textarea id="aaf-remarks" class="form-input" rows="2" placeholder="Notes for the employee..."></textarea>
        </div>
      `,
      footer: '<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-success" id="aaf-approve">Approve & Release</button>'
    });

    document.getElementById('aaf-approve').addEventListener('click', async () => {
      const approvedAmountRs = parseFloat(document.getElementById('aaf-amount').value) || 0;
      const remarks = document.getElementById('aaf-remarks').value.trim();
      const mode = document.getElementById('aaf-mode').value;
      const date = document.getElementById('aaf-date').value;

      Helpers.setLoading('aaf-approve', true);
      const res = await API.updateAdvanceRequestStatus({ 
        id: requestId, 
        status: 'paid', 
        approvedAmount: approvedAmountRs, 
        approvalRemarks: remarks,
        paymentMode: mode,
        paymentDate: date
      });
      Helpers.setLoading('aaf-approve', false);
      if (res.success) {
        Toast.success('Request approved and payment released.');
        Modal.close();

        // Auto send WhatsApp message
        Toast.info('Auto-preparing WhatsApp message...');
        const formattedAmt = approvedAmountRs.toLocaleString('en-IN', { minimumFractionDigits: 2 });
        const formattedDate = date ? Helpers.formatDate(date) : Helpers.formatDate(Helpers.todayIso());
        const msg = `Dear ${empName || 'Employee'},\n\nWe are pleased to inform you that your advance request has been approved and released.\n\nDetails of the Transaction:\n• Amount: ₹${formattedAmt}\n• Payment Mode: ${mode}\n• Release Date: ${formattedDate}\n\nThe advance amount will be adjusted in your upcoming salary cycle.\n\nRegards,\nPayroll Management`;
        
        let url = '';
        if (empPhone) {
          const cleanPhone = empPhone.replace(/\D/g, '');
          const formattedPhone = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
          url = `https://api.whatsapp.com/send/?phone=${formattedPhone}&text=${encodeURIComponent(msg)}`;
        } else {
          url = `https://api.whatsapp.com/send/?text=${encodeURIComponent(msg)}`;
        }
        
        Toast.info('Opening WhatsApp: ' + url);
        window.open(url, '_blank');

        loadData();
      } else Toast.error(res.error);
    });
  }

  function openPaymentModal(requestId, approvedAmountPaisa) {
    const approvedAmountRs = approvedAmountPaisa / 100;
    Modal.open({
      title: 'Release Advance Payment',
      body: `
        <div class="alert alert-success mb-4">You are releasing <strong>₹${approvedAmountRs.toLocaleString('en-IN')}</strong> to the employee.</div>
        
        <div class="form-group mb-4">
          <label class="form-label">Release Amount (₹)</label>
          <input type="number" id="apf-amount" class="form-input" value="${approvedAmountRs}" />
          <div class="text-xs text-muted mt-1">Review carefully before marking as paid.</div>
        </div>

        <div class="form-group mb-4">
          <label class="form-label">Payment Mode</label>
          <select id="apf-mode" class="form-select">
            <option value="Cash">Cash</option><option value="UPI">UPI</option><option value="Bank">Bank Transfer</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Release Date</label>
          <input type="date" id="apf-date" class="form-input" value="${Helpers.todayIso()}" />
        </div>
      `,
      footer: '<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" id="apf-pay">Mark as Paid</button>'
    });

    document.getElementById('apf-pay').addEventListener('click', async () => {
      const finalAmountRs = parseFloat(document.getElementById('apf-amount').value) || 0;
      
      Helpers.setLoading('apf-pay', true);
      const res = await API.updateAdvanceRequestStatus({ 
        id: requestId, 
        status: 'paid', 
        approvedAmount: finalAmountRs,
        paymentMode: document.getElementById('apf-mode').value
      });
      Helpers.setLoading('apf-pay', false);
      if (res.success) {
        Toast.success('Payment marked as released.');
        Modal.close();
        loadData();
      } else Toast.error(res.error);
    });
  }

  async function updateRequestStatus(id, status) {
    Modal.confirm('Are you sure you want to ' + status + ' this request?', async () => {
      const res = await API.updateAdvanceRequestStatus({ id, status });
      if (res.success) { Toast.success('Request updated.'); loadData(); }
      else Toast.error(res.error);
    });
  }

  async function deleteRequest(id) {
    Modal.confirm('Are you sure you want to delete this request and REVERT the employee balance?', async () => {
       const res = await API.deleteAdvanceRequest({ id });
       if (res.success) {
         Toast.success('Request deleted and balance reverted.');
         loadData();
       } else {
         Toast.error(res.error);
       }
    });
  }

  function switchView(view) {
    _view = view;
    loadData();
  }

  return { init, switchView };
})();

window.AdvancesPage = AdvancesPage;
