/**
 * LocalPayroll — Alerts & Reminders Page
 */

const AlertsPage = (() => {
  const container = () => document.getElementById('page-alerts');
  const headerActs = () => document.getElementById('page-header-actions');
  let _alerts = [];

  async function init() {
    headerActs().innerHTML = `
      <button class="btn btn-secondary" id="alr-run-btn">Run Rule Engine</button>
      <button class="btn btn-danger-soft" id="alr-clear-btn" style="margin-left:8px">Clear All</button>
    `;

    document.getElementById('alr-run-btn').addEventListener('click', async () => {
      Toast.info('Analyzing system data...');
      const r = await window.API.runAlertRules();
      if (r.success) {
        Toast.success('Rule engine complete!');
        await load();
      } else Toast.error(r.error);
    });

    document.getElementById('alr-clear-btn').addEventListener('click', async () => {
      if (!confirm('Are you sure you want to clear all alerts?')) return;
      await window.API.deleteAlert('all');
      await load();
    });

    await load();
  }

  async function load(filter = {}) {
    container().innerHTML = `<div class="p-8 flex justify-center"><div class="loader"></div></div>`;
    const res = await window.API.getAlerts(filter);
    _alerts = res.alerts || [];
    render();
  }

  function render() {
    let html = `
      <div class="card mb-6 p-4 flex gap-4 items-center">
        <select class="form-select w-40" id="alr-filter-module">
          <option value="">All Modules</option>
          <option value="Attendance">Attendance</option>
          <option value="Projects">Projects</option>
          <option value="Advances">Advances</option>
          <option value="Leaves">Leaves</option>
          <option value="Expenses">Expenses</option>
          <option value="Documents">Documents</option>
        </select>
        <select class="form-select w-40" id="alr-filter-priority">
          <option value="">All Priorities</option>
          <option value="Critical">Critical</option>
          <option value="Warning">Warning</option>
          <option value="Info">Info</option>
        </select>
        <button class="btn btn-primary" id="alr-filter-btn">Filter</button>
      </div>
    `;

    if (_alerts.length === 0) {
      html += `<div class="empty-state"><h3>All caught up!</h3><p>No active alerts or reminders found.</p></div>`;
    } else {
      html += `
        <div class="grid gap-4">
          ${_alerts.map(a => {
            const colors = {
              'Critical': 'border-left: 4px solid var(--danger); background: #fee2e210;',
              'Warning':  'border-left: 4px solid var(--warning); background: #fef3c710;',
              'Info':     'border-left: 4px solid var(--accent); background: #e0e7ff10;',
              'Success':  'border-left: 4px solid var(--success); background: #dcfce710;'
            };
            const badgeClass = a.type === 'Critical' ? 'badge-danger' : (a.type === 'Warning' ? 'badge-warning' : 'badge-secondary');
            
            return `
              <div class="card flex justify-between items-center p-4" style="${colors[a.type] || ''} ${a.is_read ? 'opacity: 0.6;' : ''}">
                <div>
                  <div class="flex items-center gap-2 mb-1">
                    <span class="badge ${badgeClass} text-xs">${a.type}</span>
                    <span class="badge badge-secondary-soft text-xs">${a.module}</span>
                    <span class="text-xs text-muted">${a.created_at}</span>
                  </div>
                  <h4 class="font-600 m-0">${Helpers.escapeHtml(a.title)}</h4>
                  <p class="text-sm text-muted m-0 mt-1">${Helpers.escapeHtml(a.message)}</p>
                </div>
                <div class="flex gap-2">
                  ${!a.is_read ? `<button class="btn btn-sm btn-success-soft" onclick="AlertsPage.markRead(${a.id})">Mark Read</button>` : ''}
                  <button class="btn btn-sm btn-danger-soft" onclick="AlertsPage.deleteLog(${a.id})">Delete</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    container().innerHTML = html;

    document.getElementById('alr-filter-btn').addEventListener('click', () => {
      const module = document.getElementById('alr-filter-module').value;
      const priority = document.getElementById('alr-filter-priority').value;
      load({ module, priority });
    });
  }

  async function markRead(id) {
    await window.API.markAlertRead(id, true);
    await load();
  }

  async function deleteLog(id) {
    await window.API.deleteAlert(id);
    await load();
  }

  return { init, markRead, deleteLog };
})();
