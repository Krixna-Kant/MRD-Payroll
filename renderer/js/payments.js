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
      try {
        const res = await API.calculateAll(_filterMonth, _filterYear);
        _calcCache = res.calculations || [];
        renderProcessing();
      } catch(err) {
        console.error('[Payments load ERROR]', err);
        container().innerHTML = `<div class="empty-state"><h3 style="color:var(--danger)">Error</h3><p>${err.message}</p></div>`;
      }
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
                <th style="text-align:center">P / H / W / A</th>
                <th style="text-align:center">OT (Hr)</th>
                <th style="text-align:right">Base (Day)</th>
                <th style="text-align:right">Earned Calc</th>
                <th style="text-align:right">Prev. Balance</th>
                <th style="text-align:right">Net Payable</th>
                <th style="text-align:right">Paid Amount</th>
                <th style="text-align:right">Current Balance</th>
                <th style="text-align:center">Action</th>
              </tr></thead>
              <tbody>
                ${_calcCache.map((c, idx) => {
                  const perDay = Math.round(c.grossSalary / 30);
                  const hourly = Math.round(perDay / 8);
                  
                  // Attendance formula breakdown
                  const formula = `(${c.presentDays}×${(perDay/100).toFixed(0)}) + (${c.halfDays}×${(perDay*0.5/100).toFixed(0)}) + (${c.woDays}×${(perDay/100).toFixed(0)})`;
                  const otFormula = c.totalOvertimeHours > 0 ? ` + (${c.totalOvertimeHours}h×${(hourly/100).toFixed(0)})` : '';
                  
                  const paidAmt = c.existingPayment ? c.existingPayment.net_paid : 0;
                  // Closing balance: what's owed after salary earned minus what was paid
                  // Uses openingBalance + salaryEarned - otherDeductions - paidAmt
                  // This correctly handles advance-recovery cases where netPayable is 0
                  const closingBal = c.existingPayment
                    ? (c.openingBalance + c.salaryEarned - (c.existingPayment.other_deductions || 0) - paidAmt)
                    : null;
                  const isSettled = c.existingPayment && Math.abs(closingBal) < 1; // within 1 paisa = settled
                  const isPartiallyPaid = c.existingPayment && !isSettled;

                  return `
                  <tr>
                    <td>
                      <div class="font-600">${Helpers.escapeHtml(c.employeeName)}</div>
                      <div class="text-xs text-muted">${Helpers.escapeHtml(c.employeeRole || '')}</div>
                    </td>
                    <td style="text-align:center">
                      <div class="flex gap-1 justify-center">
                        <span class="badge ${c.presentDays > 0 ? 'badge-success' : 'badge-muted'}" title="Present">P:${c.presentDays}</span>
                        <span class="badge ${c.halfDays > 0 ? 'badge-warning' : 'badge-muted'}" title="Half Day">H:${c.halfDays}</span>
                        <span class="badge ${c.woDays > 0 ? 'badge-accent' : 'badge-muted'}" title="Weekly Off">W:${c.woDays}</span>
                        <span class="badge ${c.absentDays > 0 ? 'badge-danger' : 'badge-muted'}" title="Absent">A:${c.absentDays}</span>
                      </div>
                      <div class="text-xs text-muted mt-1" style="font-size:10px">${c.attendanceDays} Days Paid</div>
                    </td>
                    <td style="text-align:center" class="font-600 ${c.totalOvertimeHours > 0 ? 'text-accent' : 'text-muted'}">
                      ${c.totalOvertimeHours || 0}
                    </td>
                    <td style="text-align:right" class="text-muted">
                      <div class="font-600" style="color:var(--text)">${API.fmtRupees(c.grossSalary)}</div>
                      <div class="text-xs">₹${(hourly/100).toFixed(2)}/hr</div>
                    </td>
                    <td style="text-align:right">
                      <div class="font-600 amount info-clickable" style="font-size:0.9rem" data-idx="${idx}" data-type="earned">
                         ${API.fmtRupees(c.salaryEarned)}
                         ${c.isMismatch ? '<span style="color:var(--danger); cursor:help" title="Attendance has changed since payment!"> ⚠️</span>' : ''}
                      </div>
                    </td>
                     <td style="text-align:right">
                         <div class="amount info-clickable ${c.openingBalance < 0 ? 'amount-warning' : (c.openingBalance > 0 ? 'amount-success' : 'text-muted')}" 
                              style="font-size:0.9rem" data-idx="${idx}" data-type="balance">
                           ${c.openingBalance === 0 ? '—' : (c.openingBalance < 0 ? '-' : '+' ) + API.fmtRupees(Math.abs(c.openingBalance))}
                         </div>
                     </td>
                    <td style="text-align:right;background:var(--bg-subtle)">
                       <div class="amount amount-success font-600 info-clickable" data-idx="${idx}" data-type="summary">
                         ${API.fmtRupees(c.netPayable)}
                       </div>
                    </td>
                     <td style="text-align:right" class="amount ${c.existingPayment ? 'text-accent font-600' : 'text-muted'}">
                        ${c.existingPayment ? API.fmtRupees(paidAmt) : '—'}
                     </td>
                     <td style="text-align:right">
                        <div class="amount ${isPartiallyPaid ? 'amount-danger font-600' : (isSettled ? 'text-success' : 'text-muted')}" style="font-size:0.95rem">
                           ${c.existingPayment 
                              ? (isSettled 
                                  ? 'Settled' 
                                  : (closingBal < 0 
                                      ? `<span class="text-danger">${API.fmtRupees(Math.abs(closingBal))} Adv</span>`
                                      : `<span class="text-warning">+${API.fmtRupees(closingBal)} Pend</span>`))
                              : '—'}
                        </div>
                     </td>
                    <td style="text-align:center">
                      ${c.existingPayment 
                          ? `<div class="flex flex-col gap-1 items-center">
                              <span class="badge badge-success" style="padding: 2px 8px; font-size:10px">Paid</span>
                              <button class="btn btn-sm btn-ghost pay-slip-btn-proc" data-id="${c.existingPayment.id}" style="padding:2px" title="View Slip">📄</button>
                             </div>`
                          : `<button class="btn btn-sm btn-primary pay-now-btn" data-id="${c.employeeId}" style="width:100%">Pay</button>`
                      }
                    </td>
                  </tr>
                  `;
                }).join('')}
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

    container().querySelectorAll('.pay-slip-btn-proc').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id);
        const r = await API.exportPayslipPdf(id);
        if (r.success) Toast.success('Payslip saved!');
        else if (r.error !== 'Cancelled.') Toast.error(r.error);
      });
    });
    // Info Clickables
    container().querySelectorAll('.info-clickable').forEach(el => {
      el.addEventListener('click', (e) => {
        const idx = parseInt(el.dataset.idx);
        const type = el.dataset.type;
        showQuickPreview(idx, type);
      });
    });
  }

  function showQuickPreview(idx, type) {
    const c = _calcCache[idx];
    if (!c) return;

    let content = '';
    let title = '';

    const perDay = Math.round(c.grossSalary / 30);
    const hourly = Math.round(perDay / 8);

    if (type === 'earned') {
      title = 'Earnings Breakdown';
      content = `
        <div class="calc-row"><span>Monthly Base</span> <span>${API.fmtRupees(c.grossSalary)}</span></div>
        <div class="calc-row text-xs text-muted mb-2"><span>Daily Rate (Base/30)</span> <span>${API.fmtRupees(perDay)}</span></div>
        <div style="border-top:1px solid var(--border); padding-top:8px">
          <div class="calc-row"><span>Present (${c.presentDays}d × ${API.fmtRupees(perDay)})</span> <span>${API.fmtRupees(c.presentDays * perDay)}</span></div>
          <div class="calc-row"><span>Half Day (${c.halfDays}d × 0.5 × ${API.fmtRupees(perDay)})</span> <span>${API.fmtRupees(c.halfDays * 0.5 * perDay)}</span></div>
          <div class="calc-row"><span>Weekly Off (${c.woDays}d × ${API.fmtRupees(perDay)})</span> <span>${API.fmtRupees(c.woDays * perDay)}</span></div>
          ${c.totalOvertimeHours > 0 ? `<div class="calc-row"><span>Overtime (${c.totalOvertimeHours}h × ${API.fmtRupees(hourly)})</span> <span>${API.fmtRupees(c.overtimePay)}</span></div>` : ''}
          ${c.reimbursedExpenses > 0 ? `<div class="calc-row text-success"><span>Expenses Reimbursed</span> <span>+${API.fmtRupees(c.reimbursedExpenses)}</span></div>` : ''}
        </div>
        <div class="calc-row mt-2 font-600" style="border-top:1px solid var(--border); padding-top:8px">
          <span>Total Earned</span> <span class="amount amount-success">${API.fmtRupees(c.totalEarnings)}</span>
        </div>
      `;
    } else if (type === 'balance') {
      title = 'Opening Balance Details';
      content = `
        <div class="calc-row">
          <span>Current Running Balance</span>
          <span class="${c.openingBalance < 0 ? 'text-danger' : (c.openingBalance > 0 ? 'text-success' : 'text-muted')}">
             ${c.openingBalance === 0 ? '₹0.00' : (c.openingBalance < 0 ? '-' : '+') + API.fmtRupees(Math.abs(c.openingBalance))}
          </span>
        </div>
        <div class="text-xs text-muted mt-2">
          ${c.openingBalance < 0 ? 'Employee owes company (Advance)' : (c.openingBalance > 0 ? 'Company owes employee (Pending)' : 'No pending balance')}
        </div>
      `;
    } else if (type === 'summary') {
      title = 'Salary Summary';
      content = `
        <div class="calc-row"><span>Opening Balance</span> <span class="${c.openingBalance < 0 ? 'text-danger' : 'text-success'}">${c.openingBalance < 0 ? '-' : '+'}${API.fmtRupees(Math.abs(c.openingBalance))}</span></div>
        <div class="calc-row"><span>Salary Earned</span> <span>${API.fmtRupees(c.salaryEarned)}</span></div>
        
        ${c.recoverableAmount > 0 ? `
          <div class="calc-row text-warning" style="border-top:1px dashed var(--border); margin-top:4px; padding-top:4px">
            <span>Advance Recovery</span>
            <span>-${API.fmtRupees(c.recoverableAmount)}</span>
          </div>
          <div class="calc-row font-600">
            <span>Adjusted Salary</span>
            <span>${API.fmtRupees(c.adjustedSalary)}</span>
          </div>
        ` : ''}

        ${c.otherDeductions > 0 ? `<div class="calc-row"><span>Other Deductions</span> <span>-${API.fmtRupees(c.otherDeductions)}</span></div>` : ''}
        
        <div class="calc-row mt-2 font-700 text-lg" style="border-top:2px solid var(--border); padding-top:8px">
          <span>Total Net Payable</span> <span class="amount amount-success">${API.fmtRupees(c.netPayable)}</span>
        </div>
      `;
    }

    Modal.open({
      title: title,
      size: 'modal-sm',
      body: `<div style="padding:10px">${content}</div>`,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Close</button>`
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
                  <td style="text-align:right" class="amount ${p.advance_deducted > 0 ? 'amount-warning' : (p.advance_deducted < 0 ? 'amount-success' : 'text-muted')}">
                    ${p.advance_deducted === 0 ? '—' : (p.advance_deducted > 0 ? '-' : '+') + API.fmtRupees(Math.abs(p.advance_deducted))}
                  </td>
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
        // Sanitise phone: remove non-digits, then ensure 12-digit international format
        let phone = btn.dataset.phone.replace(/\D/g, '');
        if (phone.length === 10) phone = '91' + phone; // add India code only for bare 10-digit numbers
        const msg   = encodeURIComponent(`Dear ${btn.dataset.name},\n\nYour salary for ${btn.dataset.month} ${btn.dataset.year} is *${btn.dataset.net}*.\n\nThank you!`);
        if (!phone) { Toast.warning('No phone for this employee.'); return; }
        window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
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
    const perDayRs       = (Math.round(calc.grossSalary / 30) / 100);
    const openingRs      = (calc.openingBalance / 100);
    const salaryEarnedRs = (calc.salaryEarned / 100);
    const otPayRs        = (calc.overtimePay / 100);
    const effectiveRs    = (calc.effectiveSalary / 100);
    const foodRs         = (calc.foodAllowance / 100);
    const travelRs       = (calc.travelAllowance / 100);
    const otherDedRs     = (calc.otherDeductions / 100);
    const reimbursedRs   = ((calc.reimbursedExpenses || 0) / 100);
    let   netPayableRs   = (calc.netPayable / 100);

    const fmtR = (v) => '\u20b9' + Math.round(v).toLocaleString('en-IN');

    Modal.open({
      title: 'Pay ' + Helpers.escapeHtml(calc.employeeName),
      size: 'modal-xl',
      body: `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start;">
          <!-- LEFT COLUMN: BREAKDOWN -->
          <div style="background:var(--bg-subtle); padding:20px; border-radius:12px; border:1px solid var(--border); height: 100%;">
            <div class="calc-row" style="margin-bottom:12px;">
              <span class="text-muted">Month/Year</span>
              <span class="font-600">${Helpers.monthName(_filterMonth)} ${_filterYear}</span>
            </div>

            <div style="border-top:1px solid var(--border); margin:12px 0; padding-top:12px">
              <div class="text-sm font-600" style="margin-bottom:8px; color:var(--accent)">📊 Attendance Breakdown</div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px 20px; font-size:0.85rem">
                <div class="calc-row" style="padding:2px 0"><span class="text-muted">Per Day Salary</span><span class="font-600">${fmtR(perDayRs)}</span></div>
                <div class="calc-row" style="padding:2px 0"><span class="text-muted">Present (P)</span><span class="font-600">${calc.presentDays} days</span></div>
                <div class="calc-row" style="padding:2px 0"><span class="text-muted">Half Day (H)</span><span class="font-600">${calc.halfDays} days</span></div>
                <div class="calc-row" style="padding:2px 0"><span class="text-muted">Weekly Off (WO)</span><span class="font-600">${calc.woDays} days</span></div>
                <div class="calc-row" style="padding:2px 0"><span class="text-muted">Absent (A)</span><span class="font-600 text-danger">${calc.absentDays} days</span></div>
                <div class="calc-row" style="padding:2px 0"><span class="text-muted">Effective Days</span><span class="font-600">${calc.attendanceDays} / 30</span></div>
              </div>
            </div>

            <div style="border-top:1px solid var(--border); margin:12px 0; padding-top:12px">
              <div class="text-sm font-600" style="margin-bottom:8px; color:var(--accent)">💰 Earnings</div>
              <div class="calc-row"><span class="text-muted">Attendance Earnings</span><span class="font-600">${fmtR(effectiveRs)}</span></div>
              <div class="calc-row"><span class="text-muted">OT Amount (${calc.totalOvertimeHours}h)</span><span class="font-600">${fmtR(otPayRs)}</span></div>
              <div class="calc-row"><span class="text-muted">Food Allowance</span><span class="font-600" id="pay-food-display">${fmtR(foodRs)}</span></div>
              <div class="calc-row"><span class="text-muted">Travel Allowance</span><span class="font-600" id="pay-travel-display">${fmtR(travelRs)}</span></div>
              <div class="calc-row"><span class="text-muted">Expenses Reimbursed</span><span class="font-600 text-success" id="pay-reimbursed-display">+${fmtR(reimbursedRs)}</span></div>
              <div class="calc-row" style="border-top:1px dashed var(--border); padding-top:8px; margin-top:8px">
                <span class="font-600">Gross Salary Earned</span><span class="font-600" id="pay-gross-display">${fmtR(salaryEarnedRs)}</span>
              </div>
            </div>

            <div style="border-top:1px solid var(--border); margin:12px 0; padding-top:12px">
               <div class="calc-row">
                 <span class="text-muted">Opening Balance</span>
                 <span class="font-600 ${openingRs < 0 ? 'text-danger' : (openingRs > 0 ? 'text-success' : '')}">
                   ${openingRs === 0 ? '₹0' : (openingRs < 0 ? '-' : '+') + fmtR(Math.abs(openingRs))}
                 </span>
               </div>
               <div id="recovery-row" class="calc-row text-warning" style="display:${calc.recoverableAmount > 0 ? 'flex' : 'none'}">
                 <span class="text-sm">Advance Recovery</span>
                 <span class="font-600">-${fmtR(calc.recoverableAmount / 100)}</span>
               </div>
               <div class="calc-row" style="border-top:1px dashed var(--border); margin-top:4px; padding-top:4px">
                 <span class="font-600">Adjusted Salary</span>
                 <span class="font-600" id="pay-adjusted-display">${fmtR(calc.adjustedSalary / 100)}</span>
               </div>
            </div>

            <div class="calc-row text-lg" style="border-top:2px solid var(--border); padding-top:12px; margin-top:12px">
              <span class="font-600">Total Net Payable:</span>
              <span class="amount amount-success font-700" style="font-size:1.4rem" id="pay-modal-net-view">${fmtR(netPayableRs)}</span>
            </div>
          </div>

          <!-- RIGHT COLUMN: PAYMENT INPUTS -->
          <div>
            <div class="form-group mb-4">
              <label class="form-label" style="color:var(--accent); font-size:1rem">Actual Amount Paid (₹)</label>
              <input id="ps-actual-paid" type="number" class="form-input" style="font-size:1.5rem; font-weight:800; padding:12px 16px; border-width:2px; border-color:var(--accent)" value="${Math.round(calc.suggestedPaidAmount / 100)}" min="0" step="10" />
              <div id="ps-carry-msg" class="text-sm mt-2 p-2 rounded" style="background:var(--bg-body); border-radius:8px">Match exactly to settle all dues.</div>
            </div>

            <div class="form-row mb-3">
              <div class="form-group">
                <label class="form-label">Food Allowance (₹)</label>
                <input id="ps-food-allow" type="number" class="form-input" value="${Math.round(foodRs)}" min="0" />
              </div>
              <div class="form-group">
                <label class="form-label">Travel Allowance (₹)</label>
                <input id="ps-travel-allow" type="number" class="form-input" value="${Math.round(travelRs)}" min="0" />
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
                <input id="ps-pay-date" type="date" class="form-input" value="${Helpers.todayIso()}" />
              </div>
            </div>

            <div class="form-group mb-3">
              <label class="form-label text-warning">Other Deductions (₹)</label>
              <input id="ps-other-ded" type="number" class="form-input" value="${Math.round(otherDedRs)}" min="0" />
            </div>

            <div class="form-group mb-2">
              <label class="form-label">Notes</label>
              <input id="ps-notes" class="form-input" placeholder="e.g. Paid via cash, check #123" />
            </div>
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" id="ps-cancel">Cancel</button>
        <button class="btn btn-primary" id="ps-save" style="padding: 10px 24px;">
          <span class="btn-text">Confirm & Save Payment</span>
          <span class="btn-loader" hidden></span>
        </button>
      `
    });

    const paidInp = document.getElementById('ps-actual-paid');
    const msgEl   = document.getElementById('ps-carry-msg');

    function recalculate(autoUpdatePaid) {
      const addedFood = parseFloat(document.getElementById('ps-food-allow').value) || 0;
      const addedTravel = parseFloat(document.getElementById('ps-travel-allow').value) || 0;
      const addedOtherDed = parseFloat(document.getElementById('ps-other-ded').value) || 0;

      document.getElementById('pay-food-display').textContent = fmtR(addedFood);
      document.getElementById('pay-travel-display').textContent = fmtR(addedTravel);

      const grossEarned = effectiveRs + otPayRs + addedFood + addedTravel + reimbursedRs;
      document.getElementById('pay-gross-display').textContent = fmtR(grossEarned);

      // Recovery logic in UI
      let recov = 0;
      if (openingRs < 0 && grossEarned > 0) {
        recov = Math.min(Math.abs(openingRs), grossEarned);
      }
      const adjSalary = grossEarned - recov;
      
      const recovRow = document.getElementById('recovery-row');
      if (recov > 0) {
        recovRow.style.display = 'flex';
        recovRow.querySelector('span:last-child').textContent = '-' + fmtR(recov);
      } else {
        recovRow.style.display = 'none';
      }
      document.getElementById('pay-adjusted-display').textContent = fmtR(adjSalary);

      const realTimeNet = Math.max(0, openingRs + grossEarned - addedOtherDed);
      document.getElementById('pay-modal-net-view').textContent = fmtR(realTimeNet);

      if (autoUpdatePaid) {
        paidInp.value = Math.round(realTimeNet);
      }

      const paying = parseFloat(paidInp.value) || 0;
      const closingBalance = openingRs + grossEarned - addedOtherDed - paying;

      if (Math.abs(closingBalance) < 0.01) {
         msgEl.innerHTML = '<span class="text-success">Settled. Closing Balance will be ₹0.</span>';
      } else if (closingBalance < 0) {
         msgEl.innerHTML = '<span class="text-danger">Closing Balance: ' + fmtR(closingBalance) + ' (Advance)</span>';
      } else {
         msgEl.innerHTML = '<span class="text-warning">Closing Balance: +' + fmtR(closingBalance) + ' (Pending)</span>';
      }
    }

    paidInp.addEventListener('input', function() { recalculate(false); });
    document.getElementById('ps-food-allow').addEventListener('input', function() { recalculate(true); });
    document.getElementById('ps-travel-allow').addEventListener('input', function() { recalculate(true); });
    document.getElementById('ps-other-ded').addEventListener('input', function() { recalculate(true); });
    recalculate(false);

    document.getElementById('ps-cancel').addEventListener('click', Modal.close);
    document.getElementById('ps-save').addEventListener('click', async () => {
      Helpers.setLoading('ps-save', true);

      const foodVal = parseFloat(document.getElementById('ps-food-allow').value) || 0;
      const travelVal = parseFloat(document.getElementById('ps-travel-allow').value) || 0;
      const salaryEarned = calc.effectiveSalary + calc.overtimePay + (foodVal * 100) + (travelVal * 100);

      const payload = {
        employeeId:      calc.employeeId,
        month:           _filterMonth,
        year:            _filterYear,
        grossSalary:     calc.grossSalary,
        attendanceDays:  calc.attendanceDays,
        totalDays:       30,
        useAttendance:   calc.useAttendance,
        effectiveSalary: calc.effectiveSalary,
        salaryEarned:    salaryEarned,
        advanceDeducted: calc.recoverableAmount, // New system: advanceDeducted = amount recovered from balance
        otherDeductionsRupees: parseFloat(document.getElementById('ps-other-ded').value) || 0,
        foodAllowanceRupees:   foodVal,
        travelAllowanceRupees: travelVal,
        reimbursedExpenses:    calc.reimbursedExpenses || 0,
        paidAmountRupees: parseFloat(paidInp.value) || 0,
        mode:            document.getElementById('ps-mode').value,
        paymentDate:     document.getElementById('ps-pay-date').value,
        notes:           document.getElementById('ps-notes').value,
        status:          'paid',
        createdBy:       AppState.get('user')?.id,
        presentDays:     calc.presentDays,
        halfDays:        calc.halfDays,
        absentDays:      calc.absentDays,
        woDays:          calc.woDays,
        overtimeHours:   calc.totalOvertimeHours,
        overtimePay:     calc.overtimePay
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
