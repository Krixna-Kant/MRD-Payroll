/**
 * LocalPayroll — Leaves Module
 */
const LeavesPage = (() => {
  const container = () => document.getElementById('page-leaves');
  const headerActs = () => document.getElementById('page-header-actions');

  let _leaves = [];
  let _employees = [];
  let _filterStatus = '';
  let _stats = null;

  async function init() {
    headerActs().innerHTML = `
      <button class="btn btn-primary" id="add-leave-btn" style="box-shadow: 0 4px 12px rgba(var(--accent-rgb), 0.3)">
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
      _leaves.sort((a, b) => {
        const getWeight = (s) => {
          if (s === 'pending') return 1;
          if (s === 'approved') return 2;
          if (s === 'rejected') return 3;
          return 4;
        };
        const wA = getWeight(a.status);
        const wB = getWeight(b.status);
        if (wA !== wB) return wA - wB;
        
        const dateA = a.from_date || '';
        const dateB = b.from_date || '';
        return dateB.localeCompare(dateA); // Newest first
      });
      
      // Load global stats
      const statsRes = await window.API.getLeaves({ status: 'pending' });
      const pendingCount = (statsRes.leaves || []).length;
      
      const today = Helpers.todayIso();
      const activeRes = await window.API.getLeaves({ status: 'approved' });
      const onLeaveToday = (activeRes.leaves || []).filter(l => today >= l.from_date && today <= l.to_date).length;

      _stats = { pendingCount, onLeaveToday };

      render();
    } catch (err) {
      Toast.error('Failed to load leaves: ' + err.message);
    }
  }

  function render() {
    container().innerHTML = `
      <!-- KPI HEADER -->
      <div class="grid grid-cols-3 gap-4 mb-6">
        <div class="kpi-card-v3 blue">
          <div class="icon-box">🏖️</div>
          <div class="title">On Leave Today</div>
          <div class="metric">${_stats?.onLeaveToday || 0}</div>
          <div class="footer"><span class="sub">Active leave records</span></div>
        </div>
        <div class="kpi-card-v3 orange">
          <div class="icon-box">⏳</div>
          <div class="title">Pending Approvals</div>
          <div class="metric">${_stats?.pendingCount || 0}</div>
          <div class="footer"><span class="sub">Requires action</span></div>
        </div>
        <div class="kpi-card-v3 green">
          <div class="icon-box">✅</div>
          <div class="title">Leave Balance Info</div>
          <div class="footer">
            <select id="leave-main-emp-sel" class="form-select" style="background:transparent; border:none; padding:0; color:inherit; font-weight:700">
               <option value="">Quick Check Balance...</option>
               ${_employees.map(e => `<option value="${e.id}">${Helpers.escapeHtml(e.name)}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <div id="leave-summary-container"></div>

      <div class="toolbar" style="background:var(--bg-card); border-radius:16px; padding:12px 20px; border:1px solid var(--border-subtle); box-shadow:var(--shadow-sm); margin-bottom:20px">
        <div class="toolbar-left flex gap-4 items-center">
          <h3 class="font-700 m-0" style="font-size:1.1rem">Leave History</h3>
          <div style="width:1px; height:24px; background:var(--border-subtle)"></div>
          <select id="leave-filter-status" class="form-select" style="width:160px; border-radius:10px">
            <option value="">All Applications</option>
            <option value="pending" ${_filterStatus === 'pending' ? 'selected' : ''}>⏳ Pending</option>
            <option value="approved" ${_filterStatus === 'approved' ? 'selected' : ''}>✅ Approved</option>
            <option value="rejected" ${_filterStatus === 'rejected' ? 'selected' : ''}>❌ Rejected</option>
          </select>
        </div>
      </div>

      ${_leaves.length === 0 ? `
        <div class="card p-10 text-center" style="border-radius:24px; background:var(--bg-card); border:2px dashed var(--border-subtle)">
          <div style="font-size:3rem; margin-bottom:1rem">📭</div>
          <h3 class="font-700">No leave records found</h3>
          <p class="text-muted">No leaves match your criteria or none recorded yet.</p>
          <button class="btn btn-primary mt-4" onclick="document.getElementById('add-leave-btn').click()">Record First Application</button>
        </div>
      ` : `
        <div class="card" style="border-radius:24px; overflow:hidden; border:1px solid var(--border-subtle); box-shadow:var(--shadow-md)">
          <table class="premium-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type & Reason</th>
                <th>Leave Period</th>
                <th style="text-align:center">Days</th>
                <th style="text-align:center">Status</th>
                <th style="text-align:right">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${_leaves.map(l => `
                <tr class="hover-row">
                  <td>
                    <div class="flex items-center gap-3">
                       <div class="avatar-sm" style="background: linear-gradient(135deg, var(--accent), var(--accent-hover)); color:#fff; width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.8rem">
                         ${l.employee_name.charAt(0)}
                       </div>
                       <div>
                         <div class="font-700">${Helpers.escapeHtml(l.employee_name)}</div>
                         <div class="text-xs text-muted">Applied: ${Helpers.formatDateShort(l.created_at)}</div>
                       </div>
                    </div>
                  </td>
                  <td>
                    <span class="badge ${l.type === 'LWP' ? 'badge-danger' : 'badge-warning'}" style="border-radius:6px; font-weight:700">${l.type}</span>
                    <div class="text-xs text-muted mt-1 max-w-[200px] truncate" title="${Helpers.escapeHtml(l.reason)}">${Helpers.escapeHtml(l.reason) || 'No reason provided'}</div>
                  </td>
                  <td>
                    <div class="font-600" style="font-size:0.9rem">${Helpers.formatDate(l.from_date)}</div>
                    <div class="text-xs text-muted">to ${Helpers.formatDate(l.to_date)}</div>
                  </td>
                  <td style="text-align:center"><span class="font-800" style="font-size:1rem">${l.total_days}</span></td>
                  <td style="text-align:center">${statusBadge(l.status)}</td>
                  <td style="text-align:right">
                    <div class="flex gap-2 justify-end">
                      ${l.status === 'pending' ? `
                        <button class="btn btn-sm btn-success leave-approve-btn" data-id="${l.id}" title="Approve">✓</button>
                        <button class="btn btn-sm btn-danger leave-reject-btn" data-id="${l.id}" title="Reject">✕</button>
                      ` : ''}
                      ${l.status === 'approved' ? `
                         <button class="btn btn-sm btn-ghost leave-wa-btn" 
                            style="color:#25D366"
                            data-phone="${_employees.find(e => e.id === l.employee_id)?.phone || ''}"
                            data-name="${Helpers.escapeHtml(l.employee_name)}"
                            data-type="${l.type}"
                            data-days="${l.total_days}"
                            data-from="${l.from_date}"
                            data-to="${l.to_date}" title="Notify on WhatsApp">📱</button>
                      ` : ''}
                      <button class="btn btn-sm btn-ghost leave-del-btn" data-id="${l.id}" title="Delete Record">🗑️</button>
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

    document.getElementById('leave-main-emp-sel')?.addEventListener('change', e => {
       renderSummary(parseInt(e.target.value));
    });

    renderSummary();

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
      btn.addEventListener('click', async () => {
        let phone = btn.dataset.phone.replace(/\D/g, '');
        if (phone.length === 10) phone = '91' + phone;
        const from = Helpers.formatDateShort(btn.dataset.from);
        const to = Helpers.formatDateShort(btn.dataset.to);
        
        // Fetch current balance for WhatsApp
        const empId = _leaves.find(l => l.id === parseInt(btn.parentNode.querySelector('.leave-del-btn').dataset.id))?.employee_id;
        const statsRes = await window.API.getLeaveStats(empId, new Date().getFullYear());
        const remaining = statsRes.success ? statsRes.stats.remaining : '??';

        const msg = encodeURIComponent(`Hello ${btn.dataset.name},\n\nYour leave from ${from} to ${to} has been approved.\n\nRemaining Paid Leave:\n${remaining} Days\n\n— HR Department`);
        
        if (!phone) { Toast.warning('No phone for this employee.'); return; }
        window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
      });
    });
  }

  function statusBadge(s) {
    const map = { pending: 'badge-warning', approved: 'badge-success', rejected: 'badge-danger' };
    return `<span class="badge ${map[s] || 'badge-muted'}">${s.toUpperCase()}</span>`;
  }

  async function renderSummary(empId) {
    const sumEl = document.getElementById('leave-summary-container');
    if (!sumEl) return;
    
    if (!empId) {
       sumEl.innerHTML = ''; // Keep it clean if no employee selected
       return;
    }

    const res = await window.API.getLeaveStats(empId, new Date().getFullYear());
    const emp = _employees.find(e => e.id === empId);

    if (res.success) {
      const s = res.stats;
      sumEl.innerHTML = `
        <div class="alert alert-info mb-6 flex justify-between items-center" style="border-radius:20px; background: linear-gradient(135deg, rgba(var(--accent-rgb), 0.05), rgba(var(--accent-rgb), 0.1)); border: 1px solid rgba(var(--accent-rgb), 0.2); padding: 16px 24px">
          <div class="flex items-center gap-4">
             <div style="font-size:2rem">📊</div>
             <div>
                <h4 class="font-800 m-0" style="font-size:1.1rem">${emp?.name} — Leave Balance (${new Date().getFullYear()})</h4>
                <p class="text-sm m-0 opacity-70">Policy: 15 Paid Days / Year</p>
             </div>
          </div>
          <div class="flex gap-6 items-center">
            <div class="text-center">
              <div class="text-xs uppercase font-700 opacity-60">Paid Used</div>
              <div class="font-800 text-lg">${s.usedPaid}</div>
            </div>
            <div style="width:1px; height:30px; background:rgba(0,0,0,0.1)"></div>
            <div class="text-center">
              <div class="text-xs uppercase font-700 opacity-60">Remaining</div>
              <div class="font-800 text-lg text-primary">${s.remaining}</div>
            </div>
            <div style="width:1px; height:30px; background:rgba(0,0,0,0.1)"></div>
            <div class="text-center">
              <div class="text-xs uppercase font-700 opacity-60">LWP Count</div>
              <div class="font-800 text-lg text-danger">${s.unpaid}</div>
            </div>
            <button class="btn btn-sm btn-ghost" onclick="renderSummary(null)" title="Clear Summary">✕</button>
          </div>
        </div>
      `;
    }
  }

  async function updateStatus(id, newStatus) {
    Modal.confirm(`Mark this leave as ${newStatus}?`, async () => {
      const r = await window.API.updateLeaveStatus({ id, status: newStatus });
      if (r.success) {
        Toast.success(`Leave ${newStatus}.`);
        EventBus.emit('data:leave', { action: 'update', id, status: newStatus });
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
        EventBus.emit('data:leave', { action: 'delete', id });
        load();
      } else {
        Toast.error(r.error);
      }
    }, { danger: true });
  }

  function openForm() {
    Modal.open({
      title: 'Record Leave Application',
      size: 'modal-lg',
      body: `
        <div class="form-group mb-3">
          <label class="form-label">Search Employee</label>
          <input list="lf-emp-list" id="lf-emp-search" class="form-input" placeholder="Type name or ID..." autocomplete="off" />
          <datalist id="lf-emp-list">
            ${_employees.map(e => '<option value="' + Helpers.escapeHtml(e.name) + ' (EMP' + e.id + ')"></option>').join('')}
          </datalist>
        </div>
        <div id="lf-balance-preview" class="mb-3"></div>
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

    const empSearch = document.getElementById('lf-emp-search');
    empSearch.addEventListener('input', async () => {
      const val = empSearch.value;
      const match = val.match(/\(EMP(\d+)\)$/);
      const empId = match ? parseInt(match[1]) : 0;
      if (!empId) {
        document.getElementById('lf-balance-preview').innerHTML = '';
        return;
      }
      
      const res = await window.API.getLeaveStats(empId, new Date().getFullYear());
      const previewEl = document.getElementById('lf-balance-preview');
      if (res.success) {
        previewEl.innerHTML = `
          <div class="alert alert-info py-2 px-3 text-sm flex justify-between items-center" style="border-radius:12px; margin-top:8px">
            <span>Remaining Paid Leave: <strong>${res.stats.remaining} Days</strong></span>
            ${res.stats.remaining === 0 ? '<span class="text-danger font-600">LIMIT CROSSED (LWP)</span>' : ''}
          </div>
        `;
        // Also update summary in background
        renderSummary(empId);
      }
    });

    document.getElementById('lf-save').addEventListener('click', async () => {
      const empVal = document.getElementById('lf-emp-search').value;
      const match = empVal.match(/\(EMP(\d+)\)$/);
      const empId = match ? parseInt(match[1]) : 0;
      const type = document.getElementById('lf-type').value;
      const from = document.getElementById('lf-from').value;
      const to = document.getElementById('lf-to').value;
      const reason = document.getElementById('lf-reason').value;

      if (!empId) return Toast.error('Please select a valid employee.');
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
        EventBus.emit('data:leave', { action: 'create' });
        Modal.close();
        load();
      } else {
        Toast.error(r.error);
      }
    });
  }

  return { init };
})();
