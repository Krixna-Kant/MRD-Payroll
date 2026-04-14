/**
 * LocalPayroll — Payments Page
 * Salary calculation preview, payment recording, payslip generation, WhatsApp share.
 */

const PaymentsPage = (() => {
  const container  = () => document.getElementById('page-payments');
  const headerActs = () => document.getElementById('page-header-actions');

  let _employees    = [];
  let _payments     = [];
  let _filterMonth  = AppState.get('currentMonth');
  let _filterYear   = AppState.get('currentYear');
  let _filterStatus = '';
  let _filterEmp    = AppState.get('selectedEmployeeId') || '';

  let _calcCache    = [];
  let _activeTab    = 'processing'; // 'processing' | 'history'

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    AppState.set('selectedEmployeeId', null);

    headerActs().innerHTML = `
      <div class="tab-bar" style="margin-bottom:0;border:none">
        <button class="tab-btn ${_activeTab === 'processing'?'active':''}" id="pay-tab-proc">Monthly Processing</button>
        <button class="tab-btn ${_activeTab === 'history'?'active':''}" id="pay-tab-hist">Payment History</button>
      </div>
    `;

    document.getElementById('pay-tab-proc').addEventListener('click', e => switchTab('processing', e.target));
    document.getElementById('pay-tab-hist').addEventListener('click', e => switchTab('history', e.target));

    const res = await API.getEmployees({ status: 'active' });
    _employees = res.employees || [];

    await load();
  }

  function switchTab(tab, btnEl) {
    _activeTab = tab;
    document.querySelectorAll('#page-header-actions .tab-btn').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');
    load();
  }

  // ── Load & Render ─────────────────────────────────────────────────────────
  async function load() {
    if (_activeTab === 'processing') {
      const res = await API.calculateAll(_filterMonth, _filterYear);
      _calcCache = res.calculations || [];
      renderProcessing();
    } else {
      const filter = {};
      if (_filterEmp)    filter.employeeId = parseInt(_filterEmp);
      if (_filterMonth)  filter.month      = _filterMonth;
      if (_filterYear)   filter.year       = _filterYear;
      if (_filterStatus) filter.status     = _filterStatus;

      const res = await API.getPayments(filter);
      _payments = res.payments || [];
      renderHistory();
    }
  }

  // ── Tab 1: Monthly Processing ──────────────────────────────────────────────
  function renderProcessing() {
    container().innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left" style="align-items:center;gap:12px">
           <span class="font-600">Select Month:</span>
           ${Helpers.buildMonthSelect('pay-proc-month', _filterMonth)}
           ${Helpers.buildYearSelect('pay-proc-year', _filterYear)}
        </div>
      </div>

      ${_calcCache.length === 0 ? `
        <div class="empty-state"><h3>No active employees found</h3></div>
      ` : `
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Employee</th>
              <th>Attend.</th>
              <th style="text-align:right">Base Mth</th>
              <th style="text-align:right">Earned (+OT/Sun)</th>
              <th style="text-align:right">Dues/Adv Ded.</th>
              <th style="text-align:right;background:var(--bg-subtle)">Net Payable</th>
              <th style="text-align:center;width:120px">Action</th>
            </tr></thead>
            <tbody>
              ${_calcCache.map(c => `
                <tr>
                  <td>
                    <div class="font-600">${Helpers.escapeHtml(c.employeeName)}</div>
                    <div class="text-xs text-muted">${Helpers.escapeHtml(c.employeeRole || '')}</div>
                  </td>
                  <td>
                     <span title="P:${c.presentDays} H:${c.halfDays} A:${c.absentDays}" style="cursor:help;border-bottom:1px dotted var(--text)">
                       ${c.attendanceDays} / ${c.totalDays} Days
                     </span>
                  </td>
                  <td style="text-align:right" class="text-muted"><small>${API.fmtRupees(c.grossSalary)}</small></td>
                  <td style="text-align:right" class="amount" title="Includes OT: ${API.fmtRupees(c.overtimePay)} | Sun: ${API.fmtRupees(c.sundayBonus)}">
                    ${API.fmtRupees(c.totalEarnings)}
                  </td>
                  <td style="text-align:right" class="amount ${c.advanceDeducted > 0 ? 'amount-warning' : 'text-muted'}">
                    ${c.advanceDeducted > 0 ? '-' + API.fmtRupees(c.advanceDeducted) : '—'}
                  </td>
                  <td style="text-align:right;background:var(--bg-subtle)" class="amount amount-success font-600">
                     ${API.fmtRupees(c.netPayable)}
                  </td>
                  <td style="text-align:center">
                    ${c.existingPayment 
                        ? `<span class="badge badge-success">✓ Paid</span>`
                        : `<button class="btn btn-sm btn-primary pay-now-btn" data-id="${c.employeeId}">Pay Now</button>`
                    }
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    `;

    document.getElementById('pay-proc-month')?.addEventListener('change', e => { _filterMonth = parseInt(e.target.value); load(); });
    document.getElementById('pay-proc-year')?.addEventListener('change', e => { _filterYear = parseInt(e.target.value); load(); });

    container().querySelectorAll('.pay-now-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const empId = parseInt(btn.dataset.id);
        const calc = _calcCache.find(c => c.employeeId === empId);
        openPayModal(calc);
      });
    });
  }

  // ── Tab 2: Payment History ────────────────────────────────────────────────
  function renderHistory() {
    const totalNet  = _payments.reduce((s, p) => s + p.net_paid, 0);
    const paidCount = _payments.filter(p => p.status === 'paid').length;

    container().innerHTML = `
      <div class="toolbar" style="flex-wrap:wrap">
        <div class="toolbar-left" style="flex-wrap:wrap;gap:10px">
          <select id="pay-hist-emp" class="form-select" style="width:200px">
            <option value="">All Employees</option>
            ${_employees.map(e => `<option value="${e.id}" ${String(e.id) === String(_filterEmp) ? 'selected' : ''}>${Helpers.escapeHtml(e.name)}</option>`).join('')}
          </select>
          ${Helpers.buildMonthSelect('pay-hist-month', _filterMonth)}
          ${Helpers.buildYearSelect('pay-hist-year', _filterYear)}
          <select id="pay-hist-status" class="form-select" style="width:130px" hidden>
            <option value="paid" selected>Paid</option>
          </select>
          <button id="pay-clear-filter" class="btn btn-ghost btn-sm">Clear</button>
        </div>
        <div class="toolbar-right flex gap-2">
          <div class="card" style="padding:10px 18px">
             <span class="text-sm">${paidCount} records</span>
          </div>
          <div class="card" style="padding:10px 18px">
            <span class="text-sm font-600">Total: <span class="amount amount-success">${API.fmtRupees(totalNet)}</span></span>
          </div>
        </div>
      </div>

      ${_payments.length === 0 ? `
        <div class="empty-state"><h3>No payment records</h3></div>
      ` : `
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Employee</th>
              <th>Month / Year</th>
              <th>Gross Salary</th>
              <th>Advance Ded.</th>
              <th>Final Paid</th>
              <th>Mode</th>
              <th>Actions</th>
            </tr></thead>
            <tbody>
              ${_payments.map(p => `
                <tr>
                  <td>
                    <div class="font-600">${Helpers.escapeHtml(p.employee_name)}</div>
                    <div class="text-xs text-muted">${Helpers.escapeHtml(p.employee_role || '')}</div>
                  </td>
                  <td class="td-muted">${Helpers.shortMonth(p.month)} ${p.year}</td>
                  <td class="amount text-muted"><small>${API.fmtRupees(p.gross_salary)}</small></td>
                  <td class="amount ${p.advance_deducted > 0 ? 'amount-warning':''}">${API.fmtRupees(p.advance_deducted)}</td>
                  <td class="amount amount-success font-600">${API.fmtRupees(p.net_paid)}</td>
                  <td>${modeBadge(p.mode)}</td>
                  <td>
                    <div class="flex gap-2">
                      <button class="btn btn-sm btn-secondary pay-slip-btn" data-id="${p.id}" title="Payslip PDF">📄</button>
                      <button class="btn btn-sm btn-secondary pay-whatsapp-btn"
                        data-phone="${Helpers.escapeHtml(p.employee_phone || '')}"
                        data-name="${Helpers.escapeHtml(p.employee_name)}"
                        data-net="${API.fmtRupees(p.net_paid)}"
                        data-month="${Helpers.monthName(p.month)}"
                        data-year="${p.year}">💬</button>
                      <button class="btn btn-sm btn-danger pay-del-btn" data-id="${p.id}" title="Delete">✕</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    `;

    document.getElementById('pay-hist-emp')?.addEventListener('change',    e => { _filterEmp = e.target.value; load(); });
    document.getElementById('pay-hist-month')?.addEventListener('change',  e => { _filterMonth = parseInt(e.target.value); load(); });
    document.getElementById('pay-hist-year')?.addEventListener('change',   e => { _filterYear  = parseInt(e.target.value); load(); });
    document.getElementById('pay-clear-filter')?.addEventListener('click', () => { _filterEmp = ''; _filterMonth = AppState.get('currentMonth'); _filterYear = AppState.get('currentYear'); load(); });

    container().querySelectorAll('.pay-slip-btn').forEach(btn =>
      btn.addEventListener('click', async () => {
        const r = await API.exportPayslipPdf(parseInt(btn.dataset.id));
        if (r.success) Toast.success('Payslip saved!');
        else if (r.error !== 'Cancelled.') Toast.error(r.error);
      })
    );
    container().querySelectorAll('.pay-whatsapp-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const phone = btn.dataset.phone.replace(/\\D/g, '');
        const msg   = encodeURIComponent(`Dear ${btn.dataset.name},\n\nYour salary for ${btn.dataset.month} ${btn.dataset.year} is *${btn.dataset.net}*.\n\nThank you!`);
        if (!phone) { Toast.warning('No phone for this employee.'); return; }
        window.open(`https://wa.me/91${phone}?text=${msg}`, '_blank');
      });
    });
    container().querySelectorAll('.pay-del-btn').forEach(btn =>
      btn.addEventListener('click', () =>
        Modal.confirm('Delete this payment record?', async () => {
          const r = await API.deletePayment(parseInt(btn.dataset.id));
          if (r.success) { Toast.success('Deleted.'); load(); EventBus.emit('data:refresh'); }
          else Toast.error(r.error);
        }, { title: 'Delete Payment', danger: true })
      )
    );
  }

  function modeBadge(mode) {
    const map = { Cash: 'badge-accent', UPI: 'badge-success', Bank: 'badge-warning' };
    return `<span class="badge ${map[mode] || 'badge-muted'}">${mode}</span>`;
  }

  // ── Auto-Calculate Pay Modal ───────────────────────────────────────────────
  function openPayModal(calc) {
    let currentNetPayable = calc.netPayable / 100; // converted to Rs for dynamic UI update
    const netRs = currentNetPayable.toFixed(0);

    Modal.open({
      title: \`Pay \${Helpers.escapeHtml(calc.employeeName)}\`,
      size: 'modal-md',
      body: \`
        <div style="background:var(--bg-subtle);padding:16px;border-radius:12px;margin-bottom:20px;border:1px solid var(--border)">
          <div class="calc-row">
            <span class="text-muted">Month/Year</span>
            <span class="font-600">\${Helpers.monthName(_filterMonth)} \${_filterYear}</span>
          </div>
          <div class="calc-row">
            <span class="text-muted">Earned (Incl. OT/Sun)</span>
            <span class="font-600">\${API.fmtRupees(calc.totalEarnings)}</span>
          </div>
          <div class="calc-row">
            <span class="text-muted">Prev. Dues/Adv Deducted</span>
            <span class="font-600 text-danger">- \${API.fmtRupees(calc.advanceDeducted)}</span>
          </div>
          <div class="calc-row text-lg border-top pt-2 mt-2" style="border-top:1px solid var(--border)">
            <span>Net Payable:</span>
            <span class="amount amount-success" id="pay-modal-net-view">\${API.fmtRupees(calc.netPayable)}</span>
          </div>
        </div>

        <div class="form-row mb-3">
          <div class="form-group flex-1">
            <label class="form-label" style="color:var(--primary)">Actual Amount Paid (₹)</label>
            <input id="ps-actual-paid" type="number" class="form-input" style="font-size:1.2rem;font-weight:bold" value="\${netRs}" min="0" step="50" />
            <div id="ps-carry-msg" class="text-sm mt-1 text-muted">Match exactly to settle all dues.</div>
          </div>
        </div>

        <div class="form-row mb-3">
          <div class="form-group">
            <label class="form-label">Payment Mode</label>
            <select id="ps-mode" class="form-select">
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Bank">Bank Transfer</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Payment Date</label>
            <input id="ps-pay-date" type="date" class="form-input" value="\${Helpers.todayIso()}" />
          </div>
        </div>

        <div class="form-group mb-3" hidden>
          <label class="form-label text-warning">Other Deductions (₹) (Penalty etc)</label>
          <input id="ps-other-ded" type="number" class="form-input" value="0" min="0" />
        </div>

        <div class="form-group mb-2">
          <label class="form-label">Notes</label>
          <input id="ps-notes" class="form-input" placeholder="e.g. Cleared everything" />
        </div>
      \`,
      footer: \`
        <button class="btn btn-secondary" id="ps-cancel">Cancel</button>
        <button class="btn btn-primary" id="ps-save">
          <span class="btn-text">Confirm Payment</span>
          <span class="btn-loader" hidden></span>
        </button>
      \`
    });

    const paidInp = document.getElementById('ps-actual-paid');
    const msgEl   = document.getElementById('ps-carry-msg');

    function checkCarryForward() {
      const paying = parseFloat(paidInp.value) || 0;
      const diff = paying - netRs;
      if (diff > 0) {
         msgEl.innerHTML = \`<span class="text-warning">₹\${diff.toFixed(0)} will carry forward to next month as Advance.</span>\`;
      } else if (diff < 0) {
         msgEl.innerHTML = \`<span class="text-danger">₹\${Math.abs(diff).toFixed(0)} will carry forward to next month as Pending Arrears.</span>\`;
      } else {
         msgEl.innerHTML = \`<span class="text-success">Exact full settlement.</span>\`;
      }
    }

    paidInp.addEventListener('input', checkCarryForward);
    checkCarryForward();

    document.getElementById('ps-cancel').addEventListener('click', Modal.close);
    document.getElementById('ps-save').addEventListener('click', async () => {
      Helpers.setLoading('ps-save', true);

      const payload = {
        employeeId:      calc.employeeId,
        month:           _filterMonth,
        year:            _filterYear,
        grossSalary:     calc.grossSalary,
        attendanceDays:  calc.attendanceDays,
        totalDays:       calc.totalDays,
        useAttendance:   calc.useAttendance,
        effectiveSalary: calc.effectiveSalary,
        advanceDeducted: calc.advanceDeducted,
        totalEarnings:   calc.totalEarnings,
        otherDeductionsRupees: parseFloat(document.getElementById('ps-other-ded').value) || 0,
        paidAmountRupees: parseFloat(paidInp.value) || 0,
        mode:            document.getElementById('ps-mode').value,
        paymentDate:     document.getElementById('ps-pay-date').value,
        notes:           document.getElementById('ps-notes').value,
        status:          'paid',
        createdBy:       AppState.get('user')?.id
      };

      const r = await API.createPayment(payload);
      Helpers.setLoading('ps-save', false);

      if (r.success) {
        Toast.success('Payment recorded successfully!');
        Modal.close();
        load();
        EventBus.emit('data:refresh');
      } else {
        Toast.error(r.error);
      }
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  return { init };
})();
