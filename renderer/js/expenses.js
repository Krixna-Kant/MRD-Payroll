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

  async function init() {
    headerActs().innerHTML = `
      <button class="btn btn-primary" id="add-exp-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span class="btn-text">Submit Expense</span>
      </button>
    `;
    document.getElementById('add-exp-btn').addEventListener('click', openForm);

    const empRes = await window.API.getEmployees({ status: 'active' });
    _employees = empRes.employees || [];

    const projRes = await window.API.getProjects({ status: 'Ongoing' });
    if (projRes.success) _projects = projRes.projects;

    await load();
  }

  async function load() {
    try {
      const res = await window.API.getExpenses({ status: _filterStatus });
      _expenses = res.expenses || [];
      render();
    } catch (err) {
      Toast.error('Failed to load expenses: ' + err.message);
    }
  }

  function render() {
    const totalAmount = _expenses.reduce((sum, e) => sum + e.amount, 0);

    container().innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left flex gap-2 items-center">
          <select id="exp-filter-status" class="form-select" style="width:150px">
            <option value="">All Statuses</option>
            <option value="pending" ${_filterStatus === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="approved" ${_filterStatus === 'approved' ? 'selected' : ''}>Approved</option>
            <option value="rejected" ${_filterStatus === 'rejected' ? 'selected' : ''}>Rejected</option>
          </select>
        </div>
        <div class="toolbar-right">
          <div class="card" style="padding:10px 18px">
            <span class="text-sm font-600">Total: <span class="amount">${window.API.fmtRupees(totalAmount)}</span></span>
          </div>
        </div>
      </div>

      ${_expenses.length === 0 ? `
        <div class="empty-state">
          <h3>No expense claims found</h3>
          <p class="text-muted">No expenses match your criteria.</p>
        </div>
      ` : `
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
              ${_expenses.map(e => `
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
      `}
    `;

    document.getElementById('exp-filter-status')?.addEventListener('change', e => {
      _filterStatus = e.target.value;
      load();
    });

    container().querySelectorAll('.exp-approve-btn').forEach(btn => {
      btn.addEventListener('click', () => updateStatus(parseInt(btn.dataset.id), 'approved'));
    });
    container().querySelectorAll('.exp-reject-btn').forEach(btn => {
      btn.addEventListener('click', () => updateStatus(parseInt(btn.dataset.id), 'rejected'));
    });
    container().querySelectorAll('.exp-del-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteExpense(parseInt(btn.dataset.id)));
    });
    container().querySelectorAll('.exp-wa-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        let phone = btn.dataset.phone.replace(/\D/g, '');
        if (phone.length === 10) phone = '91' + phone;
        const msg = encodeURIComponent(`Dear ${btn.dataset.name},\n\nYour expense claim of *${btn.dataset.amount}* for ${btn.dataset.project} project has been *APPROVED*. It will be credited with your upcoming salary.\n\nThank you!`);
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
    Modal.confirm(`Mark this expense as ${newStatus}?`, async () => {
      const r = await window.API.updateExpenseStatus({ id, status: newStatus });
      if (r.success) {
        Toast.success(`Expense ${newStatus}.`);
        load();
      } else {
        Toast.error(r.error);
      }
    });
  }

  async function deleteExpense(id) {
    Modal.confirm('Delete this expense claim? If it was settled, it will NOT adjust the salary payment.', async () => {
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
      title: 'Submit Expense Claim',
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
              <option value="Travel">Travel</option>
              <option value="Materials">Materials/Supplies</option>
              <option value="Meals">Meals</option>
              <option value="Other">Other</option>
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
        amount: Math.round(amountRs * 100), // convert to paisa
        date,
        status: 'approved' // auto-approve when admin creates
      });
      Helpers.setLoading('ef-save', false);

      if (r.success) {
        Toast.success('Expense claim approved. Will be settled in next payroll.');
        Modal.close();
        load();
      } else {
        Toast.error(r.error);
      }
    });
  }

  return { init };
})();
