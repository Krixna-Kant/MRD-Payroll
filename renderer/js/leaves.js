/**
 * LocalPayroll — Leaves Module
 */
const LeavesPage = (() => {
  const container = () => document.getElementById('page-leaves');
  const headerActs = () => document.getElementById('page-header-actions');

  let _leaves = [];
  let _employees = [];
  let _filterStatus = '';

  async function init() {
    headerActs().innerHTML = `
      <button class="btn btn-primary" id="add-leave-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span class="btn-text">Record Leave</span>
      </button>
    `;
    document.getElementById('add-leave-btn').addEventListener('click', openForm);

    const empRes = await window.API.getEmployees({ status: 'active' });
    _employees = empRes.employees || [];

    await load();
  }

  async function load() {
    try {
      const res = await window.API.getLeaves({ status: _filterStatus });
      _leaves = res.leaves || [];
      render();
    } catch (err) {
      Toast.error('Failed to load leaves: ' + err.message);
    }
  }

  function render() {
    container().innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left flex gap-2 items-center">
          <select id="leave-filter-status" class="form-select" style="width:150px">
            <option value="">All Statuses</option>
            <option value="pending" ${_filterStatus === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="approved" ${_filterStatus === 'approved' ? 'selected' : ''}>Approved</option>
            <option value="rejected" ${_filterStatus === 'rejected' ? 'selected' : ''}>Rejected</option>
          </select>
        </div>
      </div>

      ${_leaves.length === 0 ? `
        <div class="empty-state">
          <h3>No leave records found</h3>
          <p class="text-muted">No leaves match your criteria.</p>
        </div>
      ` : `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Leave Details</th>
                <th>Duration</th>
                <th>Days</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${_leaves.map(l => `
                <tr>
                  <td>
                    <div class="font-600">${Helpers.escapeHtml(l.employee_name)}</div>
                    <div class="text-xs text-muted">Req: ${Helpers.formatDateShort(l.created_at)}</div>
                  </td>
                  <td>
                    <div class="flex items-center gap-2">
                      <span class="badge ${l.type === 'LWP' ? 'badge-danger' : 'badge-warning'}">${l.type}</span>
                    </div>
                    <div class="text-xs text-muted mt-1 max-w-[200px] truncate" title="${Helpers.escapeHtml(l.reason)}">${Helpers.escapeHtml(l.reason)}</div>
                  </td>
                  <td>
                    <div class="text-sm">${Helpers.formatDate(l.from_date)}</div>
                    <div class="text-sm text-muted">to ${Helpers.formatDate(l.to_date)}</div>
                  </td>
                  <td class="font-600">${l.total_days}</td>
                  <td>${statusBadge(l.status)}</td>
                  <td>
                    <div class="flex gap-2">
                      ${l.status === 'pending' ? `
                        <button class="btn btn-sm btn-success leave-approve-btn" data-id="${l.id}">Approve</button>
                        <button class="btn btn-sm btn-danger leave-reject-btn" data-id="${l.id}">Reject</button>
                      ` : ''}
                      ${l.status === 'approved' ? `
                         <button class="btn btn-sm btn-accent leave-wa-btn" 
                            data-phone="${_employees.find(e => e.id === l.employee_id)?.phone || ''}"
                            data-name="${Helpers.escapeHtml(l.employee_name)}"
                            data-type="${l.type}"
                            data-days="${l.total_days}"
                            data-from="${l.from_date}"
                            data-to="${l.to_date}">💬 Notify</button>
                      ` : ''}
                      <button class="btn btn-sm btn-ghost leave-del-btn" data-id="${l.id}" title="Delete">✕</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    `;

    document.getElementById('leave-filter-status')?.addEventListener('change', e => {
      _filterStatus = e.target.value;
      load();
    });

    container().querySelectorAll('.leave-approve-btn').forEach(btn => {
      btn.addEventListener('click', () => updateStatus(parseInt(btn.dataset.id), 'approved'));
    });
    container().querySelectorAll('.leave-reject-btn').forEach(btn => {
      btn.addEventListener('click', () => updateStatus(parseInt(btn.dataset.id), 'rejected'));
    });
    container().querySelectorAll('.leave-del-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteLeave(parseInt(btn.dataset.id)));
    });
    container().querySelectorAll('.leave-wa-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        let phone = btn.dataset.phone.replace(/\D/g, '');
        if (phone.length === 10) phone = '91' + phone;
        const from = Helpers.formatDateShort(btn.dataset.from);
        const to = Helpers.formatDateShort(btn.dataset.to);
        const msg = encodeURIComponent(`Dear ${btn.dataset.name},\n\nYour leave application (${btn.dataset.type}) for ${btn.dataset.days} day(s) from ${from} to ${to} has been *APPROVED*.\n\nThank you!`);
        if (!phone) { Toast.warning('No phone for this employee.'); return; }
        window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
      });
    });
  }

  function statusBadge(s) {
    const map = { pending: 'badge-warning', approved: 'badge-success', rejected: 'badge-danger' };
    return `<span class="badge ${map[s] || 'badge-muted'}">${s.toUpperCase()}</span>`;
  }

  async function updateStatus(id, newStatus) {
    Modal.confirm(`Mark this leave as ${newStatus}?`, async () => {
      const r = await window.API.updateLeaveStatus({ id, status: newStatus });
      if (r.success) {
        Toast.success(`Leave ${newStatus}.`);
        load();
      } else {
        Toast.error(r.error);
      }
    });
  }

  async function deleteLeave(id) {
    Modal.confirm('Delete this leave record? (This does not undo attendance changes)', async () => {
      const r = await window.API.deleteLeave(id);
      if (r.success) {
        Toast.success('Deleted.');
        load();
      } else {
        Toast.error(r.error);
      }
    }, { danger: true });
  }

  function openForm() {
    Modal.open({
      title: 'Record Leave Application',
      body: `
        <div class="form-group mb-3">
          <label class="form-label">Employee</label>
          <select id="lf-emp" class="form-select">
            ${_employees.map(e => `<option value="${e.id}">${Helpers.escapeHtml(e.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group mb-3">
          <label class="form-label">Leave Type</label>
          <select id="lf-type" class="form-select">
            <option value="CL">Casual Leave (Paid)</option>
            <option value="SL">Sick Leave (Paid)</option>
            <option value="LWP">Leave Without Pay</option>
          </select>
        </div>
        <div class="form-row mb-3">
          <div class="form-group">
            <label class="form-label">From Date</label>
            <input type="date" id="lf-from" class="form-input" value="${Helpers.todayIso()}" />
          </div>
          <div class="form-group">
            <label class="form-label">To Date</label>
            <input type="date" id="lf-to" class="form-input" value="${Helpers.todayIso()}" />
          </div>
        </div>
        <div class="form-group mb-3">
          <label class="form-label">Reason</label>
          <input type="text" id="lf-reason" class="form-input" placeholder="Optional notes" />
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="lf-save">Save & Auto-Approve</button>
      `
    });

    document.getElementById('lf-save').addEventListener('click', async () => {
      const empId = parseInt(document.getElementById('lf-emp').value);
      const type = document.getElementById('lf-type').value;
      const from = document.getElementById('lf-from').value;
      const to = document.getElementById('lf-to').value;
      const reason = document.getElementById('lf-reason').value;

      if (!from || !to) return Toast.error('Dates required.');
      
      const fDate = new Date(from);
      const tDate = new Date(to);
      const days = Math.round((tDate - fDate) / (1000 * 60 * 60 * 24)) + 1;
      
      if (days <= 0) return Toast.error('Invalid date range.');

      Helpers.setLoading('lf-save', true);
      const r = await window.API.createLeave({
        employeeId: empId,
        type,
        fromDate: from,
        toDate: to,
        totalDays: days,
        reason,
        status: 'approved' // Automatically approve if created by admin
      });
      Helpers.setLoading('lf-save', false);

      if (r.success) {
        Toast.success('Leave saved and attendance updated.');
        Modal.close();
        load();
      } else {
        Toast.error(r.error);
      }
    });
  }

  return { init };
})();
