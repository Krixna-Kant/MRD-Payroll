/**
 * LocalPayroll — Activity Logs Page
 */

const ActivityLogsPage = (() => {
  const container = () => document.getElementById('page-activity');
  const headerActs = () => document.getElementById('page-header-actions');
  let _logs = [];

  async function init() {
    headerActs().innerHTML = `
      <button class="btn btn-secondary" id="al-export-btn">
        <span class="btn-text">Export Excel</span>
      </button>
    `;

    document.getElementById('al-export-btn').addEventListener('click', async () => {
      const r = await window.API.exportAuditExcel();
      if (r.success) Toast.success('Audit logs exported!');
      else if (r.error !== 'Cancelled.') Toast.error(r.error);
    });

    await load();
  }

  async function load(filter = {}) {
    container().innerHTML = `
      <div style="display:flex; justify-content:center; padding: 40px">
        <div class="loader"></div>
      </div>
    `;

    const res = await window.API.getAuditLogs(filter);
    _logs = res.logs || [];
    render();
  }

  function render() {
    let html = `
      <div class="card mb-4" style="padding:16px; display:flex; gap:16px; align-items:center;">
        <select class="form-select" id="al-filter-module" style="width:180px">
          <option value="">All Modules</option>
          <option value="Attendance">Attendance</option>
          <option value="Payroll">Payroll</option>
          <option value="Advances">Advances</option>
          <option value="Leaves">Leaves</option>
          <option value="Expenses">Expenses</option>
          <option value="Projects">Projects</option>
          <option value="Documents">Documents</option>
        </select>
        <input type="text" class="form-input" id="al-filter-search" placeholder="Search user or action..." style="flex:1" />
        <button class="btn btn-primary" id="al-search-btn">Search</button>
      </div>
    `;

    if (_logs.length === 0) {
      html += `<div class="empty-state"><p>No activity logs found.</p></div>`;
    } else {
      html += `
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th style="width:150px">Date & Time</th>
                <th>User</th>
                <th>Module</th>
                <th>Action</th>
                <th>Description</th>
                <th>Changes</th>
              </tr>
            </thead>
            <tbody>
              ${_logs.map(log => {
                let badgeClass = 'badge-secondary';
                if (['Deleted', 'Rejected'].includes(log.action)) badgeClass = 'badge-danger-soft';
                if (['Added', 'Created', 'Applied', 'Marked', 'Uploaded'].includes(log.action)) badgeClass = 'badge-success-soft';
                if (['Updated', 'Edited', 'Processed'].includes(log.action)) badgeClass = 'badge-warning-soft';

                const changes = (log.old_value || log.new_value) 
                  ? `<div style="font-size:11px; margin-top:4px;">
                       ${log.old_value ? `<span class="text-danger" style="text-decoration:line-through">${Helpers.escapeHtml(log.old_value)}</span><br>` : ''}
                       ${log.new_value ? `<span class="text-success">${Helpers.escapeHtml(log.new_value)}</span>` : ''}
                     </div>`
                  : '-';

                return `
                  <tr>
                    <td class="text-muted text-sm">${log.timestamp}</td>
                    <td class="font-600">${Helpers.escapeHtml(log.user_name)}</td>
                    <td><span class="badge badge-secondary-soft">${Helpers.escapeHtml(log.module)}</span></td>
                    <td><span class="badge ${badgeClass}">${Helpers.escapeHtml(log.action)}</span></td>
                    <td class="text-sm">${Helpers.escapeHtml(log.description || '-')}</td>
                    <td>${changes}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    container().innerHTML = html;

    document.getElementById('al-search-btn').addEventListener('click', () => {
      const mod = document.getElementById('al-filter-module').value;
      const search = document.getElementById('al-filter-search').value.trim();
      const filter = {};
      if (mod) filter.module = mod;
      if (search) filter.action = search; // very basic search
      load(filter);
    });
  }

  return { init };
})();
