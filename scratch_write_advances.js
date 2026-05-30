const fs = require('fs');
const code = `/**
 * LocalPayroll — Advances Ledger Page
 * Employee-wise advance ledger with running balance tracking.
 */

const AdvancesPage = (() => {
  const container = () => document.getElementById('page-advances');
  const headerActs = () => document.getElementById('page-header-actions');
  let _employees = [];
  let _view = 'cards';
  let _currentEmpId = null;
  let _search = '';
  let _filterOutstanding = false;

  async function init() {
    if (sessionStorage.getItem('advances_clear_filter') === 'true') {
      sessionStorage.removeItem('advances_clear_filter');
    }
    AppState.set('selectedEmployeeId', null);
    const res = await API.getEmployees({ status: 'active' });
    _employees = res.employees || [];
    renderHeader();
    await loadCards();
  }

  function renderHeader() {
    headerActs().innerHTML = \`
      <button id="adv-add-btn" class="btn btn-primary">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Advance
      </button>
    \`;
    document.getElementById('adv-add-btn').addEventListener('click', () => openForm(null));
  }

  // ── Cards View ──────────────────────────────────────────────────────────────
  async function loadCards() {
    _view = 'cards';
    _currentEmpId = null;
    container().innerHTML = '<div class="empty-state"><p>Loading...</p></div>';
    const res = await API.getAdvanceEmployeeSummaries({ search: _search, outstandingOnly: _filterOutstanding });
    if (!res.success) { container().innerHTML = '<div class="empty-state"><p>Error loading data.</p></div>'; return; }
    renderCards(res.summaries, res.stats);
  }

  function renderCards(summaries, stats) {
    const totalOut = stats.totalOutstanding;
    container().innerHTML = \`
      <div class="adv-stats-bar">
        <div class="adv-stat-item danger">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6"/></svg>
          <div>
            <div class="adv-stat-label">Total Outstanding</div>
            <div class="adv-stat-value">\${API.fmtRupees(totalOut)}</div>
          </div>
        </div>
        <div class="adv-stat-item accent">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          <div>
            <div class="adv-stat-label">Employees With Advances</div>
            <div class="adv-stat-value">\${stats.totalEmployeesWithAdvance}</div>
          </div>
        </div>
        <div class="adv-stat-item success">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          <div>
            <div class="adv-stat-label">Total Given (All Time)</div>
            <div class="adv-stat-value">\${API.fmtRupees(stats.totalGivenAll)}</div>
          </div>
        </div>
      </div>
      <div class="adv-toolbar">
        <div class="search-bar" style="flex:1;max-width:320px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input id="adv-search" class="form-input" placeholder="Search employee..." value="\${Helpers.escapeHtml(_search)}" />
        </div>
        <label class="adv-toggle-label">
          <input type="checkbox" id="adv-outstanding-only" \${_filterOutstanding ? 'checked' : ''} />
          <span>Outstanding only</span>
        </label>
      </div>
      <div class="adv-cards-grid">
        \${summaries.length === 0
          ? \`<div class="empty-state" style="grid-column:1/-1">
              <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6"/></svg>
              <h3>No employees found</h3>
              <p>Add an advance or clear the filters.</p>
            </div>\`
          : summaries.map(s => renderCard(s)).join('')}
      </div>
    \`;
    document.getElementById('adv-search').addEventListener('input', e => { _search = e.target.value; loadCards(); });
    document.getElementById('adv-outstanding-only').addEventListener('change', e => { _filterOutstanding = e.target.checked; loadCards(); });
    container().querySelectorAll('.adv-card').forEach(card => {
      card.addEventListener('click', () => openLedger(parseInt(card.dataset.empId)));
    });
  }

  function renderCard(s) {
    const hasOut = s.outstanding > 0;
    return \`<div class="adv-card \${hasOut ? 'has-outstanding' : 'is-settled'}" data-emp-id="\${s.id}">
      <div class="adv-card-header">
        <div class="adv-card-avatar">\${s.name.charAt(0).toUpperCase()}</div>
        <div class="adv-card-info">
          <div class="adv-card-name">\${Helpers.escapeHtml(s.name)}</div>
          <div class="adv-card-role">\${Helpers.escapeHtml(s.role || 'Employee')}</div>
        </div>
        <div class="adv-card-status \${hasOut ? 'danger' : 'success'}">\${hasOut ? 'Outstanding' : 'Settled'}</div>
      </div>
      <div class="adv-card-metrics">
        <div class="adv-card-metric">
          <span class="adv-metric-label">Given</span>
          <span class="adv-metric-val">\${API.fmtRupees(s.totalGiven)}</span>
        </div>
        <div class="adv-card-metric">
          <span class="adv-metric-label">Recovered</span>
          <span class="adv-metric-val amount-success">\${API.fmtRupees(s.totalRecovered)}</span>
        </div>
      </div>
      <div class="adv-card-outstanding \${hasOut ? 'danger' : 'success'}">
        <span class="adv-outstanding-label">Outstanding</span>
        <span class="adv-outstanding-val">\${API.fmtRupees(s.outstanding)}</span>
      </div>
      <div class="adv-card-footer">\${s.lastTxDate ? 'Last: ' + Helpers.formatDate(s.lastTxDate) : 'No transactions yet'}</div>
    </div>\`;
  }

  // ── Ledger View ─────────────────────────────────────────────────────────────
  async function openLedger(empId) {
    _view = 'ledger';
    _currentEmpId = empId;
    container().innerHTML = '<div class="empty-state"><p>Loading ledger...</p></div>';
    const res = await API.getAdvanceEmployeeLedger(empId, {});
    if (!res.success) { container().innerHTML = '<div class="empty-state"><p>Error loading ledger.</p></div>'; return; }
    renderLedger(res.employee, res.transactions, res.summary);
  }

  function renderLedger(emp, txns, summary) {
    const hasOut = summary.outstanding > 0;
    container().innerHTML = \`
      <div class="adv-ledger-topbar">
        <button class="btn btn-ghost btn-sm" id="adv-back-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          All Employees
        </button>
        <div class="adv-ledger-identity">
          <div class="adv-ledger-avatar">\${emp.name.charAt(0).toUpperCase()}</div>
          <div>
            <div class="adv-ledger-name">\${Helpers.escapeHtml(emp.name)}</div>
            <div class="adv-ledger-sub">\${Helpers.escapeHtml(emp.role || 'Employee')}\${emp.phone ? ' · ' + emp.phone : ''}</div>
          </div>
        </div>
        <div class="adv-ledger-actions">
          <button class="btn btn-secondary btn-sm" id="adv-wa-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
            Send Statement
          </button>
          <button class="btn btn-secondary btn-sm" id="adv-excel-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Export Excel
          </button>
          <button class="btn btn-primary btn-sm" id="adv-add-ledger-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Advance
          </button>
        </div>
      </div>

      <div class="adv-sum-row">
        <div class="adv-sum-card accent">
          <div class="adv-sum-label">Total Advance Given</div>
          <div class="adv-sum-val">\${API.fmtRupees(summary.totalGiven)}</div>
        </div>
        <div class="adv-sum-card success">
          <div class="adv-sum-label">Total Recovered</div>
          <div class="adv-sum-val">\${API.fmtRupees(summary.totalRecovered)}</div>
        </div>
        <div class="adv-sum-card \${hasOut ? 'danger' : 'success'}">
          <div class="adv-sum-label">Outstanding Balance</div>
          <div class="adv-sum-val">\${API.fmtRupees(summary.outstanding)}</div>
        </div>
        <div class="adv-sum-card muted">
          <div class="adv-sum-label">Transactions</div>
          <div class="adv-sum-val">\${summary.txCount}</div>
        </div>
      </div>

      \${txns.length === 0
        ? '<div class="empty-state"><h3>No transactions</h3><p>Add the first advance for this employee.</p></div>'
        : \`<div class="adv-timeline">
            <div class="adv-timeline-header">
              <span>Date / Type</span>
              <span>Details</span>
              <span style="text-align:right">Debit</span>
              <span style="text-align:right">Credit</span>
              <span style="text-align:right">Balance</span>
              <span></span>
            </div>
            \${txns.map(tx => renderTxRow(tx)).join('')}
          </div>\`}
    \`;

    document.getElementById('adv-back-btn').addEventListener('click', loadCards);
    document.getElementById('adv-add-ledger-btn').addEventListener('click', () => openForm(emp.id));
    document.getElementById('adv-excel-btn').addEventListener('click', async () => {
      const r = await API.exportAdvanceLedgerExcel(emp.id);
      if (r.success) Toast.success('Ledger exported!');
      else if (r.error !== 'Cancelled.') Toast.error(r.error);
    });
    document.getElementById('adv-wa-btn').addEventListener('click', () => sendWhatsApp(emp, summary));
    container().querySelectorAll('.adv-tx-del-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        deleteAdvance(parseInt(btn.dataset.id), emp.name, btn.dataset.amount);
      });
    });
  }

  function renderTxRow(tx) {
    const isAdv = tx.type === 'ADVANCE';
    const isRec = tx.type === 'RECOVERY';
    const label = isAdv ? 'Advance Given' : isRec ? 'Salary Recovery' : 'Adjustment';
    const colorCls = isAdv ? 'danger' : isRec ? 'success' : 'muted';
    const monthNote = tx.month ? Helpers.shortMonth(tx.month) + ' ' + tx.year : '';
    const debitAmt = (tx.debit || 0) > 0 ? API.fmtRupees(tx.debit) : '—';
    const creditAmt = (tx.credit || 0) > 0 ? API.fmtRupees(tx.credit) : '—';
    return \`<div class="adv-tx-row">
      <div class="adv-tx-cell adv-tx-date">
        <div class="adv-tx-type-badge \${colorCls}">\${label}</div>
        <div class="adv-tx-date-val">\${Helpers.formatDate(tx.date || '')}</div>
      </div>
      <div class="adv-tx-cell adv-tx-detail">
        \${monthNote ? \`<span class="badge badge-muted">\${monthNote}</span> \` : ''}
        \${tx.mode ? \`<span class="badge badge-accent">\${tx.mode}</span> \` : ''}
        \${tx.notes ? \`<span class="adv-tx-notes">\${Helpers.escapeHtml(tx.notes)}</span>\` : ''}
      </div>
      <div class="adv-tx-cell adv-tx-num \${isAdv ? 'amount-danger' : ''}">\${debitAmt}</div>
      <div class="adv-tx-cell adv-tx-num \${isRec ? 'amount-success' : ''}">\${creditAmt}</div>
      <div class="adv-tx-cell adv-tx-num adv-tx-bal">\${API.fmtRupees(Math.max(0, tx.runningBalance))}</div>
      <div class="adv-tx-cell">
        \${isAdv ? \`<button class="btn btn-sm btn-danger adv-tx-del-btn" data-id="\${tx.id}" data-amount="\${API.fmtRupees(tx.debit)}" title="Delete">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/></svg>
        </button>\` : ''}
      </div>
    </div>\`;
  }

  // ── WhatsApp Statement ──────────────────────────────────────────────────────
  async function sendWhatsApp(emp, summary) {
    if (!emp.phone) { Toast.error('No phone number for this employee.'); return; }
    const settingsRes = await API.getSettings();
    const company = settingsRes.settings?.company_name || 'MRD Electric';
    const msg = \`Hello \${emp.name},

Your advance statement:
Total Given  : \${API.fmtRupees(summary.totalGiven)}
Recovered    : \${API.fmtRupees(summary.totalRecovered)}
Outstanding  : \${API.fmtRupees(summary.outstanding)}

\${summary.outstanding > 0 ? 'Please note the above balance is yet to be recovered.' : 'Your advance account is fully settled.'}

— \${company}\`;
    Modal.confirm(\`Send advance statement to <strong>\${Helpers.escapeHtml(emp.name)}</strong>?\`, () => {
      let phone = emp.phone.replace(/\\D/g, '');
      if (phone.length === 10) phone = '91' + phone;
      window.open(\`https://wa.me/\${phone}?text=\${encodeURIComponent(msg)}\`, '_blank');
    }, { title: 'WhatsApp Statement', confirmText: 'Send', cancelText: 'Cancel' });
  }

  // ── Add Advance Form ────────────────────────────────────────────────────────
  function openForm(preEmpId) {
    const today = Helpers.todayIso();
    const now = new Date();
    Modal.open({
      title: 'Record Advance',
      body: \`<div class="form-group">
        <label class="form-label">Employee *</label>
        <select id="af-emp" class="form-select">
          <option value="">— Select Employee —</option>
          \${_employees.map(e => \`<option value="\${e.id}" \${String(e.id) === String(preEmpId) ? 'selected' : ''}>\${Helpers.escapeHtml(e.name)}</option>\`).join('')}
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
          <input id="af-date" type="date" class="form-input" value="\${today}" />
        </div>
        <div class="form-group">
          <label class="form-label">Against Month</label>
          <div style="display:flex;gap:6px">
            \${Helpers.buildMonthSelect('af-month', now.getMonth() + 1)}
            \${Helpers.buildYearSelect('af-year', now.getFullYear())}
          </div>
        </div>
      </div>
      <div class="form-group mt-3">
        <label class="form-label">Notes (optional)</label>
        <input id="af-notes" class="form-input" placeholder="Reason for advance..." />
      </div>
      <div id="af-error" class="form-error mt-3" hidden></div>\`,
      footer: \`<button class="btn btn-secondary" id="af-cancel">Cancel</button>
        <button class="btn btn-primary" id="af-save">
          <span class="btn-text">Record Advance</span>
          <span class="btn-loader" hidden></span>
        </button>\`
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
    if (!empId)               { errEl.textContent = 'Please select an employee.'; errEl.hidden = false; return; }
    if (!amount || amount <= 0) { errEl.textContent = 'Enter a valid amount.'; errEl.hidden = false; return; }
    Helpers.setLoading('af-save', true);
    const res = await API.addAdvance({ employeeId: parseInt(empId), amount, mode, date, month, year, notes, createdBy: AppState.get('user')?.id });
    Helpers.setLoading('af-save', false);
    if (!res.success) { errEl.textContent = res.error; errEl.hidden = false; return; }
    Modal.close();
    Toast.success('Advance recorded!');
    EventBus.emit('data:refresh');
    if (_view === 'ledger' && _currentEmpId) {
      await openLedger(_currentEmpId);
    } else {
      await loadCards();
    }
    triggerWhatsApp(empId, amount, date);
  }

  async function triggerWhatsApp(empId, amountRupees, dateIso) {
    const empRes = await API.getEmployee(empId);
    if (!empRes.success || !empRes.employee.phone) return;
    const emp = empRes.employee;
    const settingsRes = await API.getSettings();
    const company = settingsRes.settings?.company_name || 'MRD Electric';
    const msg = \`Hello \${emp.name},

Advance of ₹\${parseFloat(amountRupees).toLocaleString('en-IN')} has been recorded on \${Helpers.formatDate(dateIso)}.

Current outstanding advance balance will be recovered in upcoming salary.

— \${company}\`;
    Modal.confirm(\`Send WhatsApp to <strong>\${Helpers.escapeHtml(emp.name)}</strong>?\`, () => {
      let phone = emp.phone.replace(/\\D/g, '');
      if (phone.length === 10) phone = '91' + phone;
      window.open(\`https://wa.me/\${phone}?text=\${encodeURIComponent(msg)}\`, '_blank');
    }, { title: 'WhatsApp Notification', confirmText: 'Yes, Send', cancelText: 'Skip' });
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  function deleteAdvance(id, name, amount) {
    Modal.confirm(
      \`Delete advance of <strong>\${amount}</strong> for <strong>\${Helpers.escapeHtml(name)}</strong>?<br><small class="text-muted">This will restore the employee balance.</small>\`,
      async () => {
        const res = await API.deleteAdvance(id);
        if (!res.success) { Toast.error(res.error); return; }
        Toast.success('Advance deleted.');
        EventBus.emit('data:refresh');
        if (_currentEmpId) await openLedger(_currentEmpId);
      },
      { title: 'Delete Advance', danger: true }
    );
  }

  return { init };
})();
`;
fs.writeFileSync('renderer/js/advances.js', code);
console.log('advances.js written, bytes:', Buffer.byteLength(code, 'utf8'));
