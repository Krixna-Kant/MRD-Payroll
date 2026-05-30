/**
 * LocalPayroll — Enterprise Activity Monitoring System
 * High-fidelity audit trail with advanced filtering and detail drawer.
 */

const ActivityLogsPage = (() => {
  const container = () => document.getElementById('page-activity');
  const headerActs = () => document.getElementById('page-header-actions');
  
  let _logs = [];
  let _stats = {};
  let _filter = {
    date: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    module: '',
    action: '',
    search: ''
  };

  async function init() {
    if (AppState.get('user')?.role === 'hr') {
      Toast.error("Access Denied: HR cannot view system activity logs.");
      Router.navigate('dashboard');
      return;
    }
    
    headerActs().innerHTML = `
      <div class="flex gap-2">
        <button class="btn btn-secondary" id="al-export-excel">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          <span>Excel</span>
        </button>
        <button class="btn btn-secondary" id="al-export-csv">
          <span>CSV</span>
        </button>
      </div>
    `;

    document.getElementById('al-export-excel').addEventListener('click', async () => {
      const r = await window.API.exportAuditExcel();
      if (r.success) Toast.success('Audit logs exported!');
    });

    await load();
  }

  async function load() {
    container().innerHTML = `
      <div style="display:flex; justify-content:center; padding: 100px">
        <div class="loader"></div>
      </div>
    `;

    const res = await window.API.getAuditLogs(_filter);
    _logs = res.logs || [];
    _stats = res.stats || {};
    render();
  }

  function render() {
    container().innerHTML = `
      <div class="activity-root">
        
        <!-- SUMMARY CARDS -->
        <div class="grid-4 mb-4">
          ${statCard('Total Activities', _stats.total || 0, 'accent', '📋')}
          ${statCard('Payroll Actions', _stats.payroll || 0, 'success', '🏦')}
          ${statCard('Attendance Changes', _stats.attendance || 0, 'warning', '📅')}
          ${statCard('Critical Actions', _stats.critical || 0, 'danger', '🚨')}
        </div>

        <!-- ENTERPRISE FILTER BAR -->
        <div class="audit-filter-bar">
          <div class="form-group">
            <label class="form-label">Date</label>
            <input type="date" class="form-input" id="filter-date" value="${_filter.date}">
          </div>
          <div class="form-group">
            <label class="form-label">Month</label>
            ${Helpers.buildMonthSelect('filter-month', _filter.month, true)}
          </div>
          <div class="form-group">
            <label class="form-label">Year</label>
            ${Helpers.buildYearSelect('filter-year', _filter.year, false)}
          </div>
          <div class="form-group">
            <label class="form-label">Module</label>
            <select class="form-select" id="filter-module">
              <option value="">All Modules</option>
              <option value="Attendance" ${_filter.module === 'Attendance' ? 'selected' : ''}>Attendance</option>
              <option value="Payroll" ${_filter.module === 'Payroll' ? 'selected' : ''}>Payroll</option>
              <option value="Advances" ${_filter.module === 'Advances' ? 'selected' : ''}>Advances</option>
              <option value="Employees" ${_filter.module === 'Employees' ? 'selected' : ''}>Employees</option>
              <option value="Leaves" ${_filter.module === 'Leaves' ? 'selected' : ''}>Leaves</option>
              <option value="Documents" ${_filter.module === 'Documents' ? 'selected' : ''}>Documents</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Action</label>
            <select class="form-select" id="filter-action">
              <option value="">All Actions</option>
              <option value="Added" ${_filter.action === 'Added' ? 'selected' : ''}>Added / Created</option>
              <option value="Edited" ${_filter.action === 'Edited' ? 'selected' : ''}>Edited / Updated</option>
              <option value="Deleted" ${_filter.action === 'Deleted' ? 'selected' : ''}>Deleted</option>
              <option value="Approved" ${_filter.action === 'Approved' ? 'selected' : ''}>Approved</option>
              <option value="Rejected" ${_filter.action === 'Rejected' ? 'selected' : ''}>Rejected</option>
            </select>
          </div>
          <div class="form-group" style="flex: 2">
            <label class="form-label">Search</label>
            <div class="search-bar">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
               <input type="text" class="form-input" id="filter-search" placeholder="Search user, description, ID..." value="${_filter.search}">
            </div>
          </div>
          <div class="audit-filter-actions">
            <button class="btn btn-primary" id="btn-apply-filters" style="height:38px">Search</button>
            <button class="btn btn-secondary" id="btn-reset-filters" style="height:38px">Reset</button>
          </div>
        </div>

        <!-- LOG TABLE -->
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th style="width:160px">Date & Time</th>
                <th style="width:120px">User</th>
                <th style="width:120px">Module</th>
                <th style="width:140px">Action</th>
                <th>Description</th>
                <th style="width:60px"></th>
              </tr>
            </thead>
            <tbody>
              ${_logs.length === 0 ? '<tr><td colspan="6" class="text-center p-8 text-muted">No activities found matching filters.</td></tr>' : 
                _logs.map(log => `
                <tr class="clickable-row" data-id="${log.id}">
                  <td class="td-muted">${Helpers.formatDateTime(log.timestamp)}</td>
                  <td class="font-600">${Helpers.escapeHtml(log.user_name)}</td>
                  <td><span class="badge badge-accent">${log.module}</span></td>
                  <td>${actionBadge(log.action)}</td>
                  <td class="text-sm">${Helpers.escapeHtml(log.description || '-')}</td>
                  <td class="text-right"><span class="text-muted">→</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

      </div>

      <!-- DETAILS DRAWER OVERLAY -->
      <div class="activity-drawer-overlay" id="drawer-overlay">
        <div class="activity-drawer">
          <div class="drawer-header">
             <h2 class="modal-title">Activity Details</h2>
             <button class="modal-close" id="drawer-close">✕</button>
          </div>
          <div class="drawer-body" id="drawer-content">
             <!-- Content via JS -->
          </div>
          <div class="drawer-footer">
             <button class="btn btn-secondary btn-full" id="drawer-close-btn">Close Drawer</button>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function statCard(label, val, color, ico) {
    return `
      <div class="stat-card ${color}">
        <div class="stat-icon ${color}">${ico}</div>
        <div class="stat-body">
          <div class="stat-label">${label}</div>
          <div class="stat-value">${val}</div>
        </div>
      </div>
    `;
  }

  function actionBadge(action) {
    let cls = 'badge-muted';
    if (['Added', 'Created', 'Applied'].includes(action)) cls = 'badge-success';
    if (['Edited', 'Updated', 'Processed'].includes(action)) cls = 'badge-warning';
    if (['Deleted', 'Rejected'].includes(action)) cls = 'badge-critical';
    if (['Approved'].includes(action)) cls = 'badge-accent';
    return `<span class="badge ${cls}">${action}</span>`;
  }

  function bindEvents() {
    // Filter Applier
    document.getElementById('btn-apply-filters').addEventListener('click', () => {
      _filter.date = document.getElementById('filter-date').value;
      _filter.month = document.getElementById('filter-month').value ? parseInt(document.getElementById('filter-month').value) : '';
      _filter.year = document.getElementById('filter-year').value ? parseInt(document.getElementById('filter-year').value) : '';
      _filter.module = document.getElementById('filter-module').value;
      _filter.action = document.getElementById('filter-action').value;
      _filter.search = document.getElementById('filter-search').value.trim();
      
      // If a specific date is selected, clear month to avoid conflict in logic
      if (_filter.date) {
        _filter.month = '';
      }
      
      load();
    });

    document.getElementById('btn-reset-filters').addEventListener('click', () => {
      _filter = { date: '', month: new Date().getMonth()+1, year: 2026, module: '', action: '', search: '' };
      load();
    });

    // Row Click -> Open Drawer
    document.querySelectorAll('.clickable-row').forEach(row => {
      row.addEventListener('click', () => {
        const id = parseInt(row.dataset.id);
        const log = _logs.find(l => l.id === id);
        if (log) openDrawer(log);
      });
    });

    // Close Drawer
    const close = () => document.getElementById('drawer-overlay').classList.remove('active');
    document.getElementById('drawer-close').addEventListener('click', close);
    document.getElementById('drawer-close-btn').addEventListener('click', close);
    document.getElementById('drawer-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'drawer-overlay') close();
    });
  }

  function openDrawer(log) {
    const content = document.getElementById('drawer-content');
    content.innerHTML = `
      <div class="detail-item">
        <div class="detail-label">Action / Module</div>
        <div class="detail-value">${actionBadge(log.action)} in <strong>${log.module}</strong></div>
      </div>
      
      <div class="detail-item">
        <div class="detail-label">Description</div>
        <div class="detail-value" style="font-size:1.1rem; color:var(--text-primary)">${Helpers.escapeHtml(log.description || '-')}</div>
      </div>

      <div class="detail-item">
        <div class="detail-label">Performed By</div>
        <div class="detail-value flex items-center gap-2">
           <div class="user-avatar" style="width:24px; height:24px; font-size:0.6rem">${log.user_name[0]}</div>
           <span>${Helpers.escapeHtml(log.user_name)}</span>
        </div>
      </div>

      <div class="detail-item">
        <div class="detail-label">Timestamp</div>
        <div class="detail-value">${Helpers.formatDateTime(log.timestamp)}</div>
      </div>

      <div class="detail-item">
        <div class="detail-label">System Info</div>
        <div class="detail-value text-muted text-sm">${Helpers.escapeHtml(log.device_info || 'Local Desktop')}</div>
      </div>

      <div class="divider"></div>

      ${(log.old_value || log.new_value) ? `
        <div class="detail-item">
          <div class="detail-label">Data Changes</div>
          <div class="change-box">
             ${log.old_value ? `
               <div class="text-xs mb-1 text-muted">BEFORE:</div>
               <div class="change-line text-danger" style="margin-bottom:10px">${Helpers.escapeHtml(log.old_value)}</div>
             ` : ''}
             ${log.new_value ? `
               <div class="text-xs mb-1 text-muted">AFTER:</div>
               <div class="change-line text-success">${Helpers.escapeHtml(log.new_value)}</div>
             ` : ''}
          </div>
        </div>
      ` : ''}
      
      <div class="detail-item mt-5">
        <div class="text-xs text-muted italic">Reference ID: AL-${log.id.toString().padStart(6, '0')}</div>
      </div>
    `;
    
    document.getElementById('drawer-overlay').classList.add('active');
  }

  return { init };
})();
