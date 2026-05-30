/**
 * LocalPayroll — Expenses Module
 */
const ExpensesPage = (() => {
  const container = () => document.getElementById('page-expenses');
  const headerActs = () => document.getElementById('page-header-actions');

  let _expenses = [];
  let _employees = [];
  let _filterStatus = '';
  let _projects = [];
  let _searchQuery = '';

  async function init() {
    if (AppState.get('user')?.role === 'hr') {
      Toast.error("Access Denied: HR cannot manage financial allowances.");
      Router.navigate('dashboard');
      return;
    }
    headerActs().innerHTML = `
      <button class="btn btn-primary" id="add-exp-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span class="btn-text">Log Allowance</span>
      </button>
    `;
    document.getElementById('add-exp-btn').addEventListener('click', openForm);

    const empRes = await window.API.getEmployees({ status: 'active' });
    _employees = empRes.employees || [];

    const projRes = await window.API.getProjects({ status: 'Ongoing' });
    if (projRes.success) _projects = projRes.projects;

    _filterStatus = '';
    _searchQuery = '';

    container().innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left flex gap-2 items-center">
          <select id="exp-filter-status" class="form-select" style="width:150px">
            <option value="">All Statuses</option>
            <option value="pending" ${_filterStatus === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="approved" ${_filterStatus === 'approved' ? 'selected' : ''}>Approved</option>
            <option value="rejected" ${_filterStatus === 'rejected' ? 'selected' : ''}>Rejected</option>
          </select>
          <div class="search-bar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="exp-search" class="form-input" placeholder="Search by name, project, category..." value="" style="width:280px" />
          </div>
        </div>
        <div class="toolbar-right">
          <div class="card" style="padding:10px 18px">
            <span class="text-sm font-600">Total: <span class="amount" id="exp-total-amount">₹0.00</span></span>
          </div>
        </div>
      </div>
      <div id="expenses-list-container"></div>
    `;

    document.getElementById('exp-filter-status')?.addEventListener('change', e => {
      _filterStatus = e.target.value;
      load();
    });

    const searchEl = document.getElementById('exp-search');
    searchEl?.addEventListener('input', Helpers.debounce(e => {
      _searchQuery = e.target.value;
      renderList();
    }, 200));

    await load();
  }

  async function load() {
    try {
      const res = await window.API.getExpenses({ status: _filterStatus });
      _expenses = res.expenses || [];
      _expenses.sort((a, b) => {
        const getWeight = (s) => {
          if (s === 'pending') return 1;
          if (s === 'approved') return 2;
          if (s === 'rejected') return 3;
          return 4;
        };
        const wA = getWeight(a.status);
        const wB = getWeight(b.status);
        if (wA !== wB) return wA - wB;
        
        const dateA = a.date || '';
        const dateB = b.date || '';
        return dateB.localeCompare(dateA); // Newest first
      });
      renderList();
    } catch (err) {
      Toast.error('Failed to load allowances: ' + err.message);
    }
  }

  function renderList() {
    const listContainer = document.getElementById('expenses-list-container');
    if (!listContainer) return;

    const filteredExpenses = _expenses.filter(e => {
      const query = _searchQuery.toLowerCase().trim();
      if (!query) return true;
      const empName = (e.employee_name || '').toLowerCase();
      const projName = (e.project_name || '').toLowerCase();
      const category = (e.category || '').toLowerCase();
      const amountStr = String(e.amount / 100).toLowerCase();
      const dateStr = Helpers.formatDate(e.date).toLowerCase();
      return empName.includes(query) || projName.includes(query) || category.includes(query) || amountStr.includes(query) || dateStr.includes(query);
    });

    const totalAmount = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
    const totalEl = document.getElementById('exp-total-amount');
    if (totalEl) {
      totalEl.textContent = window.API.fmtRupees(totalAmount);
    }

    if (filteredExpenses.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <h3>No allowance records found</h3>
          <p class="text-muted">${_searchQuery ? 'No results match your search query.' : 'No allowance records match your criteria.'}</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Employee / Project</th>
              <th>Category</th>
              <th style="text-align:right">Amount</th>
              <th>Status</th>
              <th>Reimbursement</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filteredExpenses.map(e => `
              <tr>
                <td class="text-muted text-sm">${Helpers.formatDate(e.date)}</td>
                <td>
                  <div class="font-600">${Helpers.escapeHtml(e.employee_name)}</div>
                  <div class="text-xs text-muted">Project: ${Helpers.escapeHtml(e.project_name || 'N/A')}</div>
                </td>
                <td>
                  <span class="badge badge-subtle">${Helpers.escapeHtml(e.category)}</span>
                </td>
                <td style="text-align:right" class="amount font-600">
                  ${window.API.fmtRupees(e.amount)}
                </td>
                <td>${statusBadge(e.status)}</td>
                <td>
                  ${e.payment_id 
                    ? `<span class="badge badge-success">Settled in Salary</span>` 
                    : (e.status === 'approved' ? `<span class="badge badge-warning">Pending Salary</span>` : '—')}
                </td>
                <td>
                  <div class="flex gap-2">
                    ${e.status === 'pending' ? `
                      <button class="btn btn-sm btn-success exp-approve-btn" data-id="${e.id}">Approve</button>
                      <button class="btn btn-sm btn-danger exp-reject-btn" data-id="${e.id}">Reject</button>
                    ` : ''}
                    ${e.status === 'approved' ? `
                       <button class="btn btn-sm btn-accent exp-wa-btn" 
                          data-phone="${_employees.find(emp => emp.id === e.employee_id)?.phone || ''}"
                          data-name="${Helpers.escapeHtml(e.employee_name)}"
                          data-amount="${window.API.fmtRupees(e.amount)}"
                          data-project="${Helpers.escapeHtml(e.project_name || 'General')}">💬 Notify</button>
                    ` : ''}
                    <button class="btn btn-sm btn-ghost exp-del-btn" data-id="${e.id}" title="Delete">✕</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    listContainer.querySelectorAll('.exp-approve-btn').forEach(btn => {
      btn.addEventListener('click', () => updateStatus(parseInt(btn.dataset.id), 'approved'));
    });
    listContainer.querySelectorAll('.exp-reject-btn').forEach(btn => {
      btn.addEventListener('click', () => updateStatus(parseInt(btn.dataset.id), 'rejected'));
    });
    listContainer.querySelectorAll('.exp-del-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteExpense(parseInt(btn.dataset.id)));
    });
    listContainer.querySelectorAll('.exp-wa-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        let phone = btn.dataset.phone.replace(/\D/g, '');
        if (phone.length === 10) phone = '91' + phone;
        const msg = encodeURIComponent(`Dear ${btn.dataset.name},\n\nYour allowance record of *${btn.dataset.amount}* for ${btn.dataset.project} project has been *APPROVED*. It will be credited with your upcoming salary.\n\nThank you!`);
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
    Modal.confirm(`Mark this allowance as ${newStatus}?`, async () => {
      const r = await window.API.updateExpenseStatus({ id, status: newStatus });
      if (r.success) {
        Toast.success(`Allowance ${newStatus}.`);
        load();
      } else {
        Toast.error(r.error);
      }
    });
  }

  async function deleteExpense(id) {
    Modal.confirm('Delete this allowance record? If it was settled, it will NOT adjust the salary payment.', async () => {
      const r = await window.API.deleteExpense(id);
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
      title: 'Log Food & Travel Allowance',
      body: `
        <div class="form-group mb-3">
          <label class="form-label">Employee</label>
          <select id="ef-emp" class="form-select">
            ${_employees.map(e => `<option value="${e.id}">${Helpers.escapeHtml(e.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group mb-3">
          <label class="form-label">Project Name</label>
          <select id="ef-project" class="form-select">
            <option value="">-- General / No Project --</option>
            ${_projects.map(p => `<option value="${p.id}" data-name="${Helpers.escapeHtml(p.name)}">${Helpers.escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row mb-3">
          <div class="form-group">
            <label class="form-label">Category</label>
            <select id="ef-category" class="form-select">
              <option value="Food">Food</option>
              <option value="Travel">Travel</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Date</label>
            <input type="date" id="ef-date" class="form-input" value="${Helpers.todayIso()}" />
          </div>
        </div>
        <div class="form-group mb-3">
          <label class="form-label">Amount (₹)</label>
          <input type="number" id="ef-amount" class="form-input" placeholder="0" min="1" />
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="ef-save">Save & Approve</button>
      `
    });

    document.getElementById('ef-save').addEventListener('click', async () => {
      const empId = parseInt(document.getElementById('ef-emp').value);
      const projSel = document.getElementById('ef-project');
      const projectId = projSel.value ? parseInt(projSel.value) : null;
      const projectName = projectId ? projSel.options[projSel.selectedIndex].dataset.name : null;
      const category = document.getElementById('ef-category').value;
      const date = document.getElementById('ef-date').value;
      const amountRs = parseFloat(document.getElementById('ef-amount').value) || 0;

      if (!date || amountRs <= 0) return Toast.error('Valid date and amount required.');

      Helpers.setLoading('ef-save', true);
      const r = await window.API.createExpense({
        employeeId: empId,
        projectId,
        projectName,
        category,
        amount: amountRs, 
        date,
        status: 'approved' // auto-approve when admin creates
      });
      Helpers.setLoading('ef-save', false);

      if (r.success) {
        Toast.success('Allowance recorded successfully.');
        Modal.close();
        load();
      } else {
        Toast.error(r.error);
      }
    });
  }

  return { init };
})();
