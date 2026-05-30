/**
 * LocalPayroll — Alerts & Reminders Module (Premium Redesign V2)
 * Smart operational monitoring center with proactive analytics.
 */

const AlertsPage = (() => {
  const container = () => document.getElementById('page-alerts');
  const headerActs = () => document.getElementById('page-header-actions');
  
  let _alerts = [];
  let _summary = {};
  let _filter = { module: '', priority: '' };

  async function init() {
    renderHeader();
    await load();
  }

  function renderHeader() {
    const isAdmin = AppState.get('user')?.role === 'admin';
    headerActs().innerHTML = `
      <div class="flex gap-2">
        <button class="btn btn-primary" id="alr-run-btn" style="padding: 10px 20px; border-radius: 12px; font-weight: 600;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 6px;"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          Run Rule Engine
        </button>
        ${isAdmin ? `
          <button class="btn btn-ghost" id="alr-clear-btn" style="border:1px solid var(--border); border-radius:12px; color:var(--danger)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Clear All
          </button>
        ` : ''}
      </div>
    `;

    document.getElementById('alr-run-btn').addEventListener('click', async () => {
      Helpers.setLoading('alr-run-btn', true);
      const r = await window.API.runAlertRules();
      Helpers.setLoading('alr-run-btn', false);
      if (r.success) {
        Toast.success('Rule engine complete!');
        await load();
      } else Toast.error(r.error);
    });

    if (isAdmin) {
      document.getElementById('alr-clear-btn').addEventListener('click', async () => {
        Modal.confirm('Clear all alerts permanently?', async () => {
          await window.API.deleteAlert('all');
          load();
        });
      });
    }
  }

  async function load() {
    // Show skeleton/loader
    container().innerHTML = `<div class="alr-v2-container"><div class="skeleton" style="height:300px"></div></div>`;
    
    const res = await window.API.getAlerts(_filter);
    _alerts = res.alerts || [];
    _summary = res.summary || {};
    
    render();
  }

  function render() {
    container().innerHTML = `
      <div class="alr-v2-container">
        <!-- Stats Row -->
        <div class="alr-stat-grid">
          <div class="alr-v2-stat-card red">
            <div class="icon-box">🚨</div>
            <div class="content">
              <div class="label">Critical Alerts</div>
              <div class="value">${_summary.criticalCount || 0}</div>
              <div class="subtext">Requires immediate action</div>
            </div>
          </div>
          <div class="alr-v2-stat-card orange">
            <div class="icon-box">🔔</div>
            <div class="content">
              <div class="label">Pending Approvals</div>
              <div class="value">${_summary.pendingApprovals || 0}</div>
              <div class="subtext">Waiting for Admin/HR</div>
            </div>
          </div>
          <div class="alr-v2-stat-card blue">
            <div class="icon-box">🕒</div>
            <div class="content">
              <div class="label">Unresolved Issues</div>
              <div class="value">${_summary.unreadCount || 0}</div>
              <div class="subtext">Needs attention</div>
            </div>
          </div>
          <div class="alr-v2-stat-card green">
            <div class="icon-box">✅</div>
            <div class="content">
              <div class="label">Auto Resolved Today</div>
              <div class="value">${_summary.resolvedToday || 0}</div>
              <div class="subtext">Resolved automatically</div>
            </div>
          </div>
        </div>

        <!-- Main + Sidebar Layout -->
        <div class="alr-main-layout">
          
          <!-- Left: Filter + List -->
          <div class="alr-content-area">
             <div class="alr-toolbar-v2">
                <div class="flex items-center gap-2" style="flex:1">
                  <select class="form-select w-40" id="alr-filter-module">
                    <option value="">All Modules</option>
                    <option value="Attendance" ${_filter.module === 'Attendance' ? 'selected' : ''}>Attendance</option>
                    <option value="Projects" ${_filter.module === 'Projects' ? 'selected' : ''}>Projects</option>
                    <option value="Advances" ${_filter.module === 'Advances' ? 'selected' : ''}>Advances</option>
                    <option value="Leaves" ${_filter.module === 'Leaves' ? 'selected' : ''}>Leaves</option>
                    <option value="Expenses" ${_filter.module === 'Expenses' ? 'selected' : ''}>Expenses</option>
                    <option value="Documents" ${_filter.module === 'Documents' ? 'selected' : ''}>Documents</option>
                    <option value="Personal" ${_filter.module === 'Personal' ? 'selected' : ''}>Personal Reminders</option>
                  </select>
                  <select class="form-select w-40" id="alr-filter-priority">
                    <option value="">All Priorities</option>
                    <option value="Critical" ${_filter.priority === 'Critical' ? 'selected' : ''}>Critical</option>
                    <option value="Warning" ${_filter.priority === 'Warning' ? 'selected' : ''}>Warning</option>
                    <option value="Info" ${_filter.priority === 'Info' ? 'selected' : ''}>Info</option>
                  </select>
                  <div class="form-input flex items-center gap-2" style="width:240px; cursor:not-allowed; opacity:0.6">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <span>11 May 2026 - 18 May 2026</span>
                  </div>
                </div>
                <button class="btn btn-primary" id="alr-filter-btn">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                  Filter
                </button>
             </div>

             <div class="alr-list-header">
                <div class="alr-list-title">Alerts (${_alerts.length})</div>
                <div class="text-sm text-muted">Sort by: <strong>Newest First</strong> ▾</div>
             </div>

             <div class="alr-list">
                ${_alerts.length === 0 ? `
                  <div class="empty-state" style="padding: 60px 20px;">
                    <div style="font-size:3rem; margin-bottom:16px">🎉</div>
                    <h3>All caught up!</h3>
                    <p class="text-muted">No active alerts or reminders found in this category.</p>
                  </div>
                ` : _alerts.map(a => renderAlertCard(a)).join('')}
             </div>
             
             <!-- Mock Pagination -->
             <div class="flex justify-center mt-6 gap-2">
                <button class="btn btn-sm btn-ghost" disabled>‹</button>
                <button class="btn btn-sm btn-primary">1</button>
                <button class="btn btn-sm btn-ghost">2</button>
                <button class="btn btn-sm btn-ghost">3</button>
                <span class="text-muted" style="padding:0 8px">...</span>
                <button class="btn btn-sm btn-ghost">5</button>
                <button class="btn btn-sm btn-ghost">›</button>
             </div>
          </div>

          <!-- Right Sidebar -->
          <div class="alr-sidebar">
             <div class="alr-widget-v2">
                <div class="alr-widget-title-v2">Critical Alerts <span class="badge badge-danger">${_summary.criticalCount || 0}</span></div>
                <div class="alr-sidebar-list">
                   ${_alerts.filter(x => x.type === 'Critical').slice(0,3).map(a => `
                     <div class="alr-sidebar-item" onclick="AlertsPage.focusAlert(${a.id})">
                        <div class="text">${Helpers.escapeHtml(a.title)}</div>
                        <div class="arrow">›</div>
                     </div>
                   `).join('')}
                   ${_summary.criticalCount > 3 ? `<div class="text-xs text-accent mt-3 font-600 cursor-pointer">View all critical alerts →</div>` : ''}
                </div>
             </div>

             <div class="alr-widget-v2">
                <div class="alr-widget-title-v2">Quick Actions</div>
                <div class="alr-sidebar-list">
                   <div class="alr-sidebar-item"><div class="text">💬 Send Reminder to All</div><div class="arrow">›</div></div>
                   <div class="alr-sidebar-item" id="alr-add-manual"><div class="text">🚨 Add Manual Alert</div><div class="arrow">›</div></div>
                   <div class="alr-sidebar-item"><div class="text">🕒 View Alert History</div><div class="arrow">›</div></div>
                   <div class="alr-sidebar-item"><div class="text">⚙️ Manage Alert Rules</div><div class="arrow">›</div></div>
                </div>
             </div>

             <div class="alr-widget-v2">
                <div class="alr-widget-title-v2">Alert Analytics <span class="text-xs text-muted font-400">This Week ▾</span></div>
                <div class="flex justify-center py-4" style="position:relative">
                   <div style="width:120px; height:120px; border-radius:50%; border:16px solid var(--border-light); border-top-color: var(--danger); border-right-color: var(--warning); border-bottom-color: var(--info); transform: rotate(45deg);"></div>
                   <div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-weight:800; font-size:1.2rem; color:var(--text-main)">${_alerts.length}</div>
                </div>
                <div class="text-xs flex flex-col gap-2 mt-2">
                   <div class="flex justify-between items-center"><span class="flex items-center gap-2"><span style="width:8px;height:8px;border-radius:50%;background:var(--danger)"></span> Critical</span> <span>${_summary.criticalCount || 0}</span></div>
                   <div class="flex justify-between items-center"><span class="flex items-center gap-2"><span style="width:8px;height:8px;border-radius:50%;background:var(--warning)"></span> Warning</span> <span>${_alerts.filter(x => x.type === 'Warning').length}</span></div>
                   <div class="flex justify-between items-center"><span class="flex items-center gap-2"><span style="width:8px;height:8px;border-radius:50%;background:var(--info)"></span> Info</span> <span>${_alerts.filter(x => x.type === 'Info').length}</span></div>
                </div>
             </div>
          </div>
        </div>
      </div>
    `;

    attachEvents();
  }

  function renderAlertCard(a) {
    const typeClass = a.type.toLowerCase();
    const icons = { 'Critical': '⚠️', 'Warning': '⚡', 'Info': 'ℹ️', 'Success': '✅' };
    
    return `
      <div class="alr-card-v2 ${typeClass} ${!a.is_read ? 'unread' : ''}" id="alr-card-${a.id}">
        <div class="icon-circle">${icons[a.type] || '🔔'}</div>
        <div class="main-content">
          <div class="meta-top">
            <span class="tag-pill" style="background:${a.type === 'Critical' ? 'var(--danger-faint)' : 'var(--border-light)'}; color:${a.type === 'Critical' ? 'var(--danger)' : 'var(--text-muted)'}">${a.type}</span>
            <span class="tag-pill" style="background:var(--bg-body); color:var(--text-muted); border:1px solid var(--border)">${a.module}</span>
            <span class="text-xs text-muted">${Helpers.formatDateTime(a.created_at)}</span>
          </div>
          <div class="title">${Helpers.escapeHtml(a.title)}</div>
          <div class="desc">${Helpers.escapeHtml(a.message)}</div>
          <div class="text-xs text-muted mt-2">Assigned to: ${a.module} Team</div>
        </div>
        <div class="actions-v2">
          ${!a.is_read ? `
            <button class="btn btn-sm btn-primary w-100" onclick="AlertsPage.markRead(${a.id})">Mark Resolved</button>
          ` : `
            <span class="tag-pill text-center w-100" style="background:var(--success-faint); color:var(--success)">RESOLVED</span>
          `}
          <button class="btn btn-sm btn-ghost w-100" style="border:1px solid var(--border)">View Details</button>
        </div>
      </div>
    `;
  }

  function attachEvents() {
    document.getElementById('alr-filter-btn').addEventListener('click', () => {
      _filter.module = document.getElementById('alr-filter-module').value;
      _filter.priority = document.getElementById('alr-filter-priority').value;
      load();
    });

    document.getElementById('alr-add-manual').addEventListener('click', () => {
      showManualAlertModal();
    });
  }

  function showManualAlertModal() {
    Modal.open({
      title: 'Add Personal Reminder / Manual Alert',
      body: `
        <div style="padding:10px">
          <div class="form-group">
            <label class="form-label">Reminder Title</label>
            <input type="text" id="m-alr-title" class="form-input" placeholder="e.g. Call client for payment" />
          </div>
          <div class="form-group mt-3">
            <label class="form-label">Message Details</label>
            <textarea id="m-alr-message" class="form-input" rows="3" placeholder="Additional details..."></textarea>
          </div>
          <div class="form-row mt-3">
            <div class="form-group">
              <label class="form-label">Category</label>
              <select id="m-alr-module" class="form-select">
                <option value="Personal">Personal</option>
                <option value="General">General System</option>
                <option value="Attendance">Attendance</option>
                <option value="Advances">Advances</option>
                <option value="Projects">Projects</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Priority</label>
              <select id="m-alr-priority" class="form-select">
                <option value="Info">Low (Info)</option>
                <option value="Warning">Medium (Warning)</option>
                <option value="Critical">High (Critical)</option>
              </select>
            </div>
          </div>
          <div class="form-group mt-3">
            <label class="form-label">Due Date (Optional)</label>
            <input type="date" id="m-alr-date" class="form-input" />
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="m-alr-save-btn">Save Reminder</button>
      `
    });

    document.getElementById('m-alr-save-btn').addEventListener('click', async () => {
      const data = {
        title: document.getElementById('m-alr-title').value,
        message: document.getElementById('m-alr-message').value,
        type: document.getElementById('m-alr-priority').value,
        module: document.getElementById('m-alr-module').value,
        due_date: document.getElementById('m-alr-date').value || null,
        user_id: AppState.get('user')?.id
      };

      if (!data.title) return Toast.error('Title is required');

      const res = await window.API.createAlert(data);
      if (res.success) {
        Toast.success('Reminder saved successfully!');
        Modal.close();
        load();
      } else Toast.error(res.error);
    });
  }

  async function markRead(id) {
    const res = await window.API.markAlertRead(id, true);
    if (res.success) {
      Toast.success('Alert resolved.');
      load();
    }
  }

  async function deleteLog(id) {
    Modal.confirm('Delete this alert?', async () => {
      await window.API.deleteAlert(id);
      load();
    });
  }

  function focusAlert(id) {
    const el = document.getElementById(`alr-card-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.borderColor = 'var(--danger)';
      setTimeout(() => el.style.borderColor = '', 2000);
    }
  }

  return { init, markRead, deleteLog, focusAlert };
})();

window.AlertsPage = AlertsPage;
