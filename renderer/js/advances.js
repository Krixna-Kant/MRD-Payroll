/**
 * LocalPayroll — Advances Page
 * Add advances, view ledger filterable by employee/month.
 */

const AdvancesPage = (() => {
  const container  = () => document.getElementById('page-advances');
  const headerActs = () => document.getElementById('page-header-actions');

  let _employees  = [];
  let _filterEmp  = AppState.get('selectedEmployeeId') || '';
  let _filterMonth= AppState.get('currentMonth');
  let _filterYear = AppState.get('currentYear');

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    // Clear preselection
    AppState.set('selectedEmployeeId', null);

    headerActs().innerHTML = `
      <button id="add-advance-btn" class="btn btn-primary">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Advance
      </button>
    `;
    document.getElementById('add-advance-btn').addEventListener('click', openForm);

    const res = await API.getEmployees({ status: 'active' });
    _employees = res.employees || [];

    await load();
  }

  // ── Load & Render ─────────────────────────────────────────────────────────
  async function load() {
    const filter = {};
    if (_filterEmp)   filter.employeeId = parseInt(_filterEmp);
    if (_filterMonth) filter.month      = _filterMonth;
    if (_filterYear)  filter.year       = _filterYear;

    const res = await API.getAdvances(filter);
    const advances = res.advances || [];
    render(advances);
  }

  function render(advances) {
    const totalPaisa = advances.reduce((s, a) => s + a.amount, 0);

    container().innerHTML = `
      <!-- Filters -->
      <div class="toolbar">
        <div class="toolbar-left" style="flex-wrap:wrap;gap:10px">
          <select id="adv-filter-emp" class="form-select" style="width:200px">
            <option value="">All Employees</option>
            ${_employees.map(e => `<option value="${e.id}" ${String(e.id) === String(_filterEmp) ? 'selected' : ''}>${Helpers.escapeHtml(e.name)}</option>`).join('')}
          </select>
          ${Helpers.buildMonthSelect('adv-filter-month', _filterMonth)}
          ${Helpers.buildYearSelect('adv-filter-year', _filterYear)}
          <button id="adv-clear-filter" class="btn btn-ghost btn-sm">Clear Filters</button>
        </div>
        <div class="toolbar-right">
          <div class="card" style="padding:10px 18px;display:flex;gap:16px;align-items:center">
            <span class="text-sm text-muted">${advances.length} record${advances.length !== 1 ? 's' : ''}</span>
            <span class="text-sm font-600">Total: <span class="amount amount-warning">${API.fmtRupees(totalPaisa)}</span></span>
          </div>
        </div>
      </div>

      <!-- Table -->
      ${advances.length === 0 ? `
        <div class="empty-state">
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6"/></svg>
          <h3>No advances found</h3>
          <p>Click "Add Advance" to record a cash or UPI advance.</p>
        </div>
      ` : `
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>#</th>
              <th>Employee</th>
              <th>Date</th>
              <th>Month</th>
              <th>Amount</th>
              <th>Mode</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr></thead>
            <tbody>
              ${advances.map((a, i) => `
                <tr>
                  <td class="td-muted">${i + 1}</td>
                  <td><span class="font-600">${Helpers.escapeHtml(a.employee_name)}</span></td>
                  <td class="td-muted">${Helpers.formatDate(a.date)}</td>
                  <td class="td-muted">${a.month ? Helpers.shortMonth(a.month) + ' ' + a.year : '—'}</td>
                  <td><span class="amount amount-warning">${API.fmtRupees(a.amount)}</span></td>
                  <td>${modeBadge(a.mode)}</td>
                  <td class="td-muted">${Helpers.escapeHtml(a.notes || '—')}</td>
                  <td>
                    <button class="btn btn-sm btn-danger adv-del-btn" data-id="${a.id}" data-name="${Helpers.escapeHtml(a.employee_name)}" data-amount="${API.fmtRupees(a.amount)}" title="Delete">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    `;

    // Filter listeners
    document.getElementById('adv-filter-emp').addEventListener('change', e => { _filterEmp = e.target.value; load(); });
    document.getElementById('adv-filter-month').addEventListener('change', e => { _filterMonth = parseInt(e.target.value); load(); });
    document.getElementById('adv-filter-year').addEventListener('change',  e => { _filterYear  = parseInt(e.target.value); load(); });
    document.getElementById('adv-clear-filter').addEventListener('click',  () => { _filterEmp = ''; _filterMonth = null; _filterYear = null; load(); });

    // Delete
    container().querySelectorAll('.adv-del-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteAdvance(parseInt(btn.dataset.id), btn.dataset.name, btn.dataset.amount));
    });
  }

  function modeBadge(mode) {
    const map = { Cash: 'badge-accent', UPI: 'badge-success', Bank: 'badge-warning' };
    return `<span class="badge ${map[mode] || 'badge-muted'}">${mode}</span>`;
  }

  // ── Add Advance Form ───────────────────────────────────────────────────────
  function openForm() {
    const today = Helpers.todayIso();
    const now   = new Date();

    Modal.open({
      title: 'Record Advance',
      body: `
        <div class="form-group">
          <label class="form-label">Employee *</label>
          <select id="af-emp" class="form-select">
            <option value="">— Select Employee —</option>
            ${_employees.map(e => `<option value="${e.id}" ${String(e.id) === String(_filterEmp) ? 'selected' : ''}>${Helpers.escapeHtml(e.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row mt-3">
          <div class="form-group">
            <label class="form-label">Amount (₹) *</label>
            <input id="af-amount" type="number" class="form-input" min="1" step="50" placeholder="e.g. 2000" />
          </div>
          <div class="form-group">
            <label class="form-label">Payment Mode *</label>
            <select id="af-mode" class="form-select">
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Bank">Bank Transfer</option>
            </select>
          </div>
        </div>
        <div class="form-row mt-3">
          <div class="form-group">
            <label class="form-label">Date</label>
            <input id="af-date" type="date" class="form-input" value="${today}" />
          </div>
          <div class="form-group">
            <label class="form-label">Against Month</label>
            <div style="display:flex;gap:6px">
              ${Helpers.buildMonthSelect('af-month', now.getMonth() + 1)}
              ${Helpers.buildYearSelect('af-year', now.getFullYear())}
            </div>
          </div>
        </div>
        <div class="form-group mt-3">
          <label class="form-label">Notes (optional)</label>
          <input id="af-notes" class="form-input" placeholder="Reason for advance..." />
        </div>
        <div id="af-error" class="form-error mt-3" hidden></div>
      `,
      footer: `
        <button class="btn btn-secondary" id="af-cancel">Cancel</button>
        <button class="btn btn-primary" id="af-save">
          <span class="btn-text">Record Advance</span>
          <span class="btn-loader" hidden></span>
        </button>
      `
    });

    document.getElementById('af-cancel').addEventListener('click', Modal.close);
    document.getElementById('af-save').addEventListener('click', saveAdvance);
  }

  async function saveAdvance() {
    const errEl = document.getElementById('af-error');
    errEl.hidden = true;

    const empId  = document.getElementById('af-emp').value;
    const amount = document.getElementById('af-amount').value;
    const mode   = document.getElementById('af-mode').value;
    const date   = document.getElementById('af-date').value;
    const month  = parseInt(document.getElementById('af-month').value);
    const year   = parseInt(document.getElementById('af-year').value);
    const notes  = document.getElementById('af-notes').value.trim();

    if (!empId)            { errEl.textContent = 'Please select an employee.'; errEl.hidden = false; return; }
    if (!amount || amount <= 0) { errEl.textContent = 'Enter a valid amount.'; errEl.hidden = false; return; }

    Helpers.setLoading('af-save', true);
    const res = await API.addAdvance({
      employeeId: parseInt(empId),
      amount,   // ₹ — API.addAdvance converts to paisa
      mode, date, month, year, notes,
      createdBy: AppState.get('user')?.id,
    });
    Helpers.setLoading('af-save', false);

    if (!res.success) { errEl.textContent = res.error; errEl.hidden = false; return; }

    Modal.close();
    Toast.success('Advance recorded successfully!');
    await load();
    EventBus.emit('data:refresh');
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  function deleteAdvance(id, name, amount) {
    Modal.confirm(
      `Delete advance of <strong>${amount}</strong> for <strong>${Helpers.escapeHtml(name)}</strong>?`,
      async () => {
        const res = await API.deleteAdvance(id);
        if (!res.success) { Toast.error(res.error); return; }
        Toast.success('Advance deleted.');
        await load();
        EventBus.emit('data:refresh');
      },
      { title: 'Delete Advance', danger: true }
    );
  }

  return { init };
})();
