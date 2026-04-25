/**
 * LocalPayroll — Employees Page
 * Add / Edit / Delete employees. Live search. Employee detail view.
 */

const EmployeesPage = (() => {
  const container   = () => document.getElementById('page-employees');
  const headerActs  = () => document.getElementById('page-header-actions');
  let _employees    = [];
  let _searchQ      = '';

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    headerActs().innerHTML = `<button id="add-employee-btn" class="btn btn-primary">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add Employee
    </button>`;
    document.getElementById('add-employee-btn').addEventListener('click', () => openForm());
    await load();
  }

  // ── Load list ─────────────────────────────────────────────────────────────
  async function load() {
    const res = await API.getEmployees({ search: _searchQ, status: 'active' });
    _employees = res.employees || [];
    render();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function render() {
    const filtered = _employees.filter(e =>
      !_searchQ ||
      e.name.toLowerCase().includes(_searchQ.toLowerCase()) ||
      (e.phone || '').includes(_searchQ)
    );

    container().innerHTML = `
      <!-- Toolbar -->
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-bar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="emp-search" class="form-input" placeholder="Search by name or phone..." value="${Helpers.escapeHtml(_searchQ)}" style="width:260px" />
          </div>
          <span class="text-muted text-sm">${filtered.length} employee${filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <!-- Table -->
      ${filtered.length === 0 ? emptyState() : `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Role / Designation</th>
                <th>Per Day Salary</th>
                <th>Joining Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((e, i) => `
                <tr>
                  <td class="td-muted">${i + 1}</td>
                  <td>
                    <div class="flex items-center gap-2">
                      <div class="user-avatar" style="background:${avatarColor(e.name)};width:30px;height:30px;font-size:0.72rem">
                        ${e.name[0].toUpperCase()}
                      </div>
                      <span class="font-600">${Helpers.escapeHtml(e.name)}</span>
                    </div>
                  </td>
                  <td class="td-muted">${Helpers.escapeHtml(e.phone || '—')}</td>
                  <td class="td-muted">${Helpers.escapeHtml(e.role || '—')}</td>
                  <td><span class="amount amount-success">${API.fmtRupees(e.salary)}</span></td>
                  <td class="td-muted">${Helpers.formatDate(e.joining_date)}</td>
                  <td><span class="badge ${e.status === 'active' ? 'badge-success' : 'badge-muted'}">${e.status}</span></td>
                  <td>
                    <div class="flex gap-2">
                      <button class="btn btn-sm btn-secondary emp-view-btn" data-id="${e.id}" title="View Details">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </button>
                      <button class="btn btn-sm btn-secondary emp-edit-btn" data-id="${e.id}" title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button class="btn btn-sm btn-danger emp-del-btn" data-id="${e.id}" data-name="${Helpers.escapeHtml(e.name)}" title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    `;

    // Bind search
    const searchEl = document.getElementById('emp-search');
    searchEl?.addEventListener('input', Helpers.debounce(e => {
      _searchQ = e.target.value;
      render();
    }, 200));

    // Bind action buttons
    container().querySelectorAll('.emp-view-btn').forEach(btn =>
      btn.addEventListener('click', () => viewEmployee(parseInt(btn.dataset.id))));
    container().querySelectorAll('.emp-edit-btn').forEach(btn =>
      btn.addEventListener('click', () => openForm(parseInt(btn.dataset.id))));
    container().querySelectorAll('.emp-del-btn').forEach(btn =>
      btn.addEventListener('click', () => deleteEmployee(parseInt(btn.dataset.id), btn.dataset.name)));
  }

  function emptyState() {
    return `<div class="empty-state">
      <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
      <h3>No employees found</h3>
      <p>${_searchQ ? 'No results match your search.' : 'Click "Add Employee" to get started.'}</p>
    </div>`;
  }

  // ── Avatar color from name ────────────────────────────────────────────────
  function avatarColor(name) {
    const colors = ['#6366f1','#8b5cf6','#ec4899','#10b981','#f59e0b','#ef4444','#3b82f6'];
    let h = 0;
    for (let c of name) h = (h * 31 + c.charCodeAt(0)) % colors.length;
    return colors[Math.abs(h)];
  }

  // ── Add / Edit Form ───────────────────────────────────────────────────────
  async function openForm(id = null) {
    let emp = null;
    if (id) {
      const res = await API.getEmployee(id);
      emp = res.employee;
    }

    const isEdit = !!emp;
    const salaryRupees = emp ? API.toRupees(emp.salary) : '';

    Modal.open({
      title: isEdit ? `Edit Employee — ${emp.name}` : 'Add New Employee',
      size: 'modal-lg',
      body: `
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Full Name *</label>
            <input id="ef-name" class="form-input" placeholder="e.g. Ravi Kumar" value="${Helpers.escapeHtml(emp?.name || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Phone Number</label>
            <input id="ef-phone" class="form-input" placeholder="10-digit mobile number" value="${Helpers.escapeHtml(emp?.phone || '')}" />
          </div>
        </div>
        <div class="form-row mt-3">
          <div class="form-group">
            <label class="form-label">Role / Designation</label>
            <input id="ef-role" class="form-input" placeholder="e.g. Driver, Cook, Guard" value="${Helpers.escapeHtml(emp?.role || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Per Day Salary (₹) *</label>
            <input id="ef-salary" class="form-input" type="number" min="0" step="50" placeholder="e.g. 400" value="${salaryRupees}" />
          </div>
        </div>
        <div class="form-row mt-3">
          <div class="form-group">
            <label class="form-label">Joining Date</label>
            <input id="ef-joining" class="form-input" type="date" value="${emp?.joining_date || ''}" />
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select id="ef-status" class="form-select">
              <option value="active"   ${(emp?.status || 'active') === 'active'   ? 'selected' : ''}>Active</option>
              <option value="inactive" ${emp?.status === 'inactive' ? 'selected' : ''}>Inactive</option>
            </select>
          </div>
        </div>
        <div class="form-group mt-3">
          <label class="form-label">Notes (optional)</label>
          <input id="ef-notes" class="form-input" placeholder="Any additional information" value="${Helpers.escapeHtml(emp?.notes || '')}" />
        </div>

        <div id="ef-error" class="form-error mt-3" hidden></div>
      `,
      footer: `
        <button class="btn btn-secondary" id="ef-cancel">Cancel</button>
        <button class="btn btn-primary" id="ef-save">
          <span class="btn-text">${isEdit ? 'Save Changes' : 'Add Employee'}</span>
          <span class="btn-loader" hidden></span>
        </button>
      `
    });

    document.getElementById('ef-cancel').addEventListener('click', Modal.close);
    document.getElementById('ef-save').addEventListener('click', () => saveEmployee(id));
  }

  async function saveEmployee(id) {
    const errEl = document.getElementById('ef-error');
    errEl.hidden = true;

    const data = {
      name:             document.getElementById('ef-name').value.trim(),
      phone:            document.getElementById('ef-phone').value.trim(),
      role:             document.getElementById('ef-role').value.trim(),
      salary:           document.getElementById('ef-salary').value,  // ₹
      fixedGrossSalary: 0, // removed feature
      joiningDate:      document.getElementById('ef-joining').value,
      status:           document.getElementById('ef-status').value,
      notes:            document.getElementById('ef-notes').value.trim(),
    };

    if (!data.name) { errEl.textContent = 'Employee name is required.'; errEl.hidden = false; return; }

    Helpers.setLoading('ef-save', true);
    const res = id ? await API.updateEmployee(id, data) : await API.createEmployee(data);
    Helpers.setLoading('ef-save', false);

    if (!res.success) { errEl.textContent = res.error; errEl.hidden = false; return; }

    Modal.close();
    Toast.success(id ? 'Employee updated.' : 'Employee added successfully!');
    await load();
    EventBus.emit('data:refresh');
  }

  // ── View Employee Detail ───────────────────────────────────────────────────
  async function viewEmployee(id) {
    const res = await API.getEmployee(id);
    if (!res.success) { Toast.error('Employee not found.'); return; }
    const e = res.employee;

    Modal.open({
      title: `Employee Profile`,
      size: 'modal-lg',
      body: `
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
          <div class="user-avatar" style="background:${avatarColor(e.name)};width:54px;height:54px;font-size:1.4rem;border-radius:14px">
            ${e.name[0].toUpperCase()}
          </div>
          <div>
            <div style="font-size:1.2rem;font-weight:700">${Helpers.escapeHtml(e.name)}</div>
            <div class="text-muted">${Helpers.escapeHtml(e.role || 'No role assigned')}</div>
            <span class="badge ${e.status === 'active' ? 'badge-success' : 'badge-muted'}">${e.status}</span>
          </div>
        </div>
        <div class="grid-2">
          ${profileRow('📱 Phone', e.phone || '—')}
          ${profileRow('💰 Per Day Salary', API.fmtRupees(e.salary))}
          ${profileRow('📅 Joining Date', Helpers.formatDate(e.joining_date))}
        </div>
        <div style="margin-top:20px;margin-bottom:20px">
          ${profileRow('📝 Notes', e.notes || '—')}
        </div>
        <div class="divider"></div>
        <div class="flex gap-2">
          <button class="btn btn-secondary" id="vw-att"  data-id="${e.id}">View Attendance</button>
          <button class="btn btn-secondary" id="vw-adv"  data-id="${e.id}">View Advances</button>
          <button class="btn btn-secondary" id="vw-pay"  data-id="${e.id}">View Payments</button>
          <button class="btn btn-secondary" id="vw-excel" data-id="${e.id}" style="margin-left:auto">
            📊 Export Excel
          </button>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" id="vw-edit" data-id="${e.id}">Edit</button>
        <button class="btn btn-secondary modal-close-btn">Close</button>
      `
    });

    document.querySelector('.modal-close-btn')?.addEventListener('click', Modal.close);
    document.getElementById('vw-edit')?.addEventListener('click', () => { Modal.close(); openForm(e.id); });
    document.getElementById('vw-att')?.addEventListener('click',  () => { Modal.close(); AppState.set('selectedEmployeeId', e.id); Router.navigate('attendance'); });
    document.getElementById('vw-adv')?.addEventListener('click',  () => { Modal.close(); AppState.set('selectedEmployeeId', e.id); Router.navigate('advances'); });
    document.getElementById('vw-pay')?.addEventListener('click',  () => { Modal.close(); AppState.set('selectedEmployeeId', e.id); Router.navigate('payments'); });
    document.getElementById('vw-excel')?.addEventListener('click', async () => {
      const r = await API.exportEmployeeExcel(e.id);
      if (r.success) Toast.success('Excel exported!'); else if (r.error !== 'Cancelled.') Toast.error(r.error);
    });
  }

  function profileRow(label, value) {
    return `<div class="card" style="padding:14px">
      <div class="text-xs text-muted">${label}</div>
      <div class="font-600" style="margin-top:4px">${Helpers.escapeHtml(String(value))}</div>
    </div>`;
  }

  // ── Delete Employee ────────────────────────────────────────────────────────
  function deleteEmployee(id, name) {
    Modal.confirm(
      `Delete <strong>${Helpers.escapeHtml(name)}</strong>?<br><span class="text-muted text-sm">All attendance, advances, and payment records will also be deleted.</span>`,
      async () => {
        const res = await API.deleteEmployee(id);
        if (!res.success) { Toast.error(res.error); return; }
        Toast.success('Employee deleted.');
        await load();
        EventBus.emit('data:refresh');
      },
      { title: 'Confirm Delete', danger: true }
    );
  }

  return { init };
})();
