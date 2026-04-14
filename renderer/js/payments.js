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

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    AppState.set('selectedEmployeeId', null);

    headerActs().innerHTML = `
      <button id="pay-process-btn" class="btn btn-primary">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
        Process Salary
      </button>
    `;
    document.getElementById('pay-process-btn').addEventListener('click', openProcessModal);

    const res = await API.getEmployees({ status: 'active' });
    _employees = res.employees || [];

    await load();
  }

  // ── Load & Render ─────────────────────────────────────────────────────────
  async function load() {
    const filter = {};
    if (_filterEmp)    filter.employeeId = parseInt(_filterEmp);
    if (_filterMonth)  filter.month      = _filterMonth;
    if (_filterYear)   filter.year       = _filterYear;
    if (_filterStatus) filter.status     = _filterStatus;

    const res = await API.getPayments(filter);
    _payments = res.payments || [];
    render();
  }

  function render() {
    const totalNet  = _payments.reduce((s, p) => s + p.net_paid, 0);
    const paidCount = _payments.filter(p => p.status === 'paid').length;

    container().innerHTML = `
      <!-- Filters -->
      <div class="toolbar" style="flex-wrap:wrap">
        <div class="toolbar-left" style="flex-wrap:wrap;gap:10px">
          <select id="pay-filter-emp" class="form-select" style="width:200px">
            <option value="">All Employees</option>
            ${_employees.map(e => `<option value="${e.id}" ${String(e.id) === String(_filterEmp) ? 'selected' : ''}>${Helpers.escapeHtml(e.name)}</option>`).join('')}
          </select>
          ${Helpers.buildMonthSelect('pay-filter-month', _filterMonth)}
          ${Helpers.buildYearSelect('pay-filter-year', _filterYear)}
          <select id="pay-filter-status" class="form-select" style="width:130px">
            <option value="">All Status</option>
            <option value="pending" ${_filterStatus === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="paid"    ${_filterStatus === 'paid'    ? 'selected' : ''}>Paid</option>
          </select>
          <button id="pay-clear-filter" class="btn btn-ghost btn-sm">Clear</button>
        </div>
        <div class="toolbar-right flex gap-2">
          <div class="card" style="padding:10px 18px">
            <span class="text-sm">${paidCount} paid / ${_payments.length} total</span>
          </div>
          <div class="card" style="padding:10px 18px">
            <span class="text-sm font-600">Total: <span class="amount amount-success">${API.fmtRupees(totalNet)}</span></span>
          </div>
        </div>
      </div>

      ${_payments.length === 0 ? `
        <div class="empty-state">
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
          <h3>No payment records</h3>
          <p>Use "Process Salary" to calculate and record employee salaries.</p>
        </div>
      ` : `
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>#</th>
              <th>Employee</th>
              <th>Month / Year</th>
              <th>Gross Salary</th>
              <th>Advance Deducted</th>
              <th>Net Paid</th>
              <th>Mode</th>
              <th>Status</th>
              <th>Actions</th>
            </tr></thead>
            <tbody>
              ${_payments.map((p, i) => `
                <tr>
                  <td class="td-muted">${i + 1}</td>
                  <td>
                    <div class="font-600">${Helpers.escapeHtml(p.employee_name)}</div>
                    <div class="text-xs text-muted">${Helpers.escapeHtml(p.employee_role || '')}</div>
                  </td>
                  <td class="td-muted">${Helpers.shortMonth(p.month)} ${p.year}</td>
                  <td class="amount">${API.fmtRupees(p.gross_salary)}</td>
                  <td class="amount amount-warning">${API.fmtRupees(p.advance_deducted)}</td>
                  <td class="amount amount-success font-600">${API.fmtRupees(p.net_paid)}</td>
                  <td>${modeBadge(p.mode)}</td>
                  <td>${statusBadge(p.status)}</td>
                  <td>
                    <div class="flex gap-2">
                      <button class="btn btn-sm btn-secondary pay-slip-btn" data-id="${p.id}" title="Generate Payslip PDF">
                        📄
                      </button>
                      <button class="btn btn-sm btn-secondary pay-whatsapp-btn"
                        data-phone="${Helpers.escapeHtml(p.employee_phone || '')}"
                        data-name="${Helpers.escapeHtml(p.employee_name)}"
                        data-net="${API.fmtRupees(p.net_paid)}"
                        data-month="${Helpers.monthName(p.month)}"
                        data-year="${p.year}"
                        title="Share via WhatsApp">
                        💬
                      </button>
                      ${p.status === 'pending' ? `
                        <button class="btn btn-sm btn-success pay-mark-paid-btn" data-id="${p.id}" title="Mark as Paid">✓ Pay</button>
                      ` : ''}
                      <button class="btn btn-sm btn-danger pay-del-btn" data-id="${p.id}" title="Delete">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/></svg>
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

    bindTableEvents();
    bindFilterEvents();
  }

  function statusBadge(s) {
    return s === 'paid'
      ? `<span class="badge badge-success">✓ PAID</span>`
      : `<span class="badge badge-warning">⏳ PENDING</span>`;
  }
  function modeBadge(mode) {
    const map = { Cash: 'badge-accent', UPI: 'badge-success', Bank: 'badge-warning' };
    return `<span class="badge ${map[mode] || 'badge-muted'}">${mode}</span>`;
  }

  function bindFilterEvents() {
    document.getElementById('pay-filter-emp').addEventListener('change',    e => { _filterEmp = e.target.value; load(); });
    document.getElementById('pay-filter-month').addEventListener('change',  e => { _filterMonth = parseInt(e.target.value); load(); });
    document.getElementById('pay-filter-year').addEventListener('change',   e => { _filterYear  = parseInt(e.target.value); load(); });
    document.getElementById('pay-filter-status').addEventListener('change', e => { _filterStatus = e.target.value; load(); });
    document.getElementById('pay-clear-filter').addEventListener('click',   () => { _filterEmp = ''; _filterMonth = AppState.get('currentMonth'); _filterYear = AppState.get('currentYear'); _filterStatus = ''; load(); });
  }

  function bindTableEvents() {
    container().querySelectorAll('.pay-slip-btn').forEach(btn =>
      btn.addEventListener('click', async () => {
        const r = await API.exportPayslipPdf(parseInt(btn.dataset.id));
        if (r.success) Toast.success('Payslip saved!');
        else if (r.error !== 'Cancelled.') Toast.error(r.error);
      })
    );

    container().querySelectorAll('.pay-whatsapp-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const phone = btn.dataset.phone.replace(/\D/g, '');
        const msg   = encodeURIComponent(
          `Dear ${btn.dataset.name},\n\nYour salary for ${btn.dataset.month} ${btn.dataset.year} is *${btn.dataset.net}*.\n\nThank you!\n— LocalPayroll`
        );
        if (!phone) { Toast.warning('No phone number for this employee.'); return; }
        const url = `https://wa.me/91${phone}?text=${msg}`;
        window.open(url, '_blank');
      });
    });

    container().querySelectorAll('.pay-mark-paid-btn').forEach(btn =>
      btn.addEventListener('click', async () => {
        const r = await API.updatePayment(parseInt(btn.dataset.id), { status: 'paid' });
        if (r.success) { Toast.success('Marked as paid!'); await load(); EventBus.emit('data:refresh'); }
        else Toast.error(r.error);
      })
    );

    container().querySelectorAll('.pay-del-btn').forEach(btn =>
      btn.addEventListener('click', () =>
        Modal.confirm('Delete this payment record?', async () => {
          const r = await API.deletePayment(parseInt(btn.dataset.id));
          if (r.success) { Toast.success('Payment deleted.'); await load(); EventBus.emit('data:refresh'); }
          else Toast.error(r.error);
        }, { title: 'Delete Payment', danger: true })
      )
    );
  }

  // ── Process Salary Modal ───────────────────────────────────────────────────
  async function openProcessModal() {
    const now = new Date();
    Modal.open({
      title: 'Process Salary',
      size: 'modal-xl',
      body: `
        <!-- Step 1: Pick employee + month/year -->
        <div class="form-row mb-4">
          <div class="form-group">
            <label class="form-label">Employee *</label>
            <select id="ps-emp" class="form-select">
              <option value="">— Select Employee —</option>
              ${_employees.map(e => `<option value="${e.id}">${Helpers.escapeHtml(e.name)} (${API.fmtRupees(e.salary)}/mo)</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Month / Year</label>
            <div class="flex gap-2">
              ${Helpers.buildMonthSelect('ps-month', _filterMonth || now.getMonth() + 1)}
              ${Helpers.buildYearSelect('ps-year',   _filterYear  || now.getFullYear())}
            </div>
          </div>
        </div>

        <button id="ps-calc-btn" class="btn btn-secondary mb-4" style="width:100%">
          ⚙️ Calculate Salary Preview
        </button>

        <div id="ps-preview" hidden>
          <!-- Salary breakdown -->
          <div class="calc-preview mb-4" id="ps-breakdown"></div>

          <!-- Override / Adjustments -->
          <div class="form-row mb-3">
            <div class="form-group">
              <label class="form-label">Other Deductions (₹)</label>
              <input id="ps-other-ded" type="number" class="form-input" value="0" min="0" step="50" />
            </div>
            <div class="form-group">
              <label class="form-label">Payment Mode</label>
              <select id="ps-mode" class="form-select">
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Bank">Bank Transfer</option>
              </select>
            </div>
          </div>
          <div class="form-row mb-3">
            <div class="form-group">
              <label class="form-label">Payment Date</label>
              <input id="ps-pay-date" type="date" class="form-input" value="${Helpers.todayIso()}" />
            </div>
            <div class="form-group">
              <label class="form-label">Status</label>
              <select id="ps-status" class="form-select">
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Notes</label>
            <input id="ps-notes" class="form-input" placeholder="e.g. Paid via NEFT" />
          </div>
          <div id="ps-error" class="form-error mt-3" hidden></div>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" id="ps-cancel">Cancel</button>
        <button class="btn btn-primary" id="ps-save" hidden>
          <span class="btn-text">Record Payment</span>
          <span class="btn-loader" hidden></span>
        </button>
      `
    });

    let _calc = null; // stores last calculation result

    document.getElementById('ps-cancel').addEventListener('click', Modal.close);

    document.getElementById('ps-calc-btn').addEventListener('click', async () => {
      const empId = parseInt(document.getElementById('ps-emp').value);
      const month = parseInt(document.getElementById('ps-month').value);
      const year  = parseInt(document.getElementById('ps-year').value);

      if (!empId) { Toast.warning('Please select an employee.'); return; }

      const btn = document.getElementById('ps-calc-btn');
      btn.disabled = true; btn.textContent = '⚙️ Calculating...';

      const res = await API.getSalaryCalculation(empId, month, year);
      btn.disabled = false; btn.textContent = '⚙️ Recalculate';

      if (!res.success) { Toast.error(res.error); return; }

      _calc = res.calculation;
      document.getElementById('ps-breakdown').innerHTML = buildBreakdown(_calc);
      document.getElementById('ps-preview').hidden = false;
      document.getElementById('ps-save').hidden = false;

      // Wire other deductions to live-update net
      document.getElementById('ps-other-ded').addEventListener('input', e => {
        const otherDed = parseFloat(e.target.value || 0);
        const newNet = Math.max(0, _calc.netPaid - Math.round(otherDed * 100));
        document.getElementById('ps-net-display').textContent = API.fmtRupees(newNet);
      });
    });

    document.getElementById('ps-save').addEventListener('click', async () => {
      if (!_calc) return;
      const otherDedRupees = parseFloat(document.getElementById('ps-other-ded').value || 0);
      const otherDedPaisa  = Math.round(otherDedRupees * 100);
      const netFinal       = Math.max(0, _calc.netPaid - otherDedPaisa);

      Helpers.setLoading('ps-save', true);
      const res = await API.createPayment({
        employeeId:      _calc.employeeId,
        month:           parseInt(document.getElementById('ps-month').value),
        year:            parseInt(document.getElementById('ps-year').value),
        grossSalary:     _calc.grossSalary,
        attendanceDays:  _calc.attendanceDays,
        totalDays:       _calc.totalDays,
        useAttendance:   _calc.useAttendance,
        effectiveSalary: _calc.effectiveSalary,
        advanceDeducted: _calc.advanceDeducted,
        otherDeductions: otherDedPaisa,
        netPaid:         netFinal,
        carryForwardAdvance: _calc.carryForwardAdvance, // Pass to backend
        mode:            document.getElementById('ps-mode').value,
        paymentDate:     document.getElementById('ps-pay-date').value,
        notes:           document.getElementById('ps-notes').value,
        status:          document.getElementById('ps-status').value,
        createdBy:       AppState.get('user')?.id,
      });
      Helpers.setLoading('ps-save', false);

      if (!res.success) {
        const errEl = document.getElementById('ps-error');
        errEl.textContent = res.error; errEl.hidden = false;
        return;
      }

      Modal.close();
      Toast.success('Payment recorded!');
      await load();
      EventBus.emit('data:refresh');
    });
  }

  function buildBreakdown(c) {
    let html = `
      <div class="calc-row"><span>Employee</span><span class="font-600">${Helpers.escapeHtml(c.employeeName)}</span></div>
      <div class="calc-row"><span>Gross Monthly Salary</span><span class="amount">${API.fmtRupees(c.grossSalary)}</span></div>
      <div class="calc-row"><span>Working Days</span><span class="text-muted">${c.totalDays} days</span></div>
      <div class="calc-row"><span>Per Day Salary</span><span class="amount">${API.fmtRupees(Math.round(c.grossSalary / c.totalDays))}</span></div>
      <div class="calc-row"><span>Attendance</span><span class="text-muted">${c.presentDays}P + ${c.halfDays}H = ${c.attendanceDays} days worked</span></div>
      <div class="calc-row"><span>Effective Salary <span class="text-muted text-sm">(${c.attendanceDays} days × ${API.fmtRupees(Math.round(c.grossSalary / c.totalDays))}/day)</span></span><span class="amount">${API.fmtRupees(c.effectiveSalary)}</span></div>
    `;
    if (c.totalOvertimeHours > 0) {
      html += `<div class="calc-row"><span>(+) Overtime Pay <span class="text-muted text-sm">(${c.totalOvertimeHours.toFixed(1)} hrs × ${API.fmtRupees(c.hourlyRate)}/hr)</span></span><span class="amount amount-success">${API.fmtRupees(c.overtimePay)}</span></div>`;
    }
    if (c.sundayWorkDays > 0) {
      html += `<div class="calc-row"><span>(+) Sunday Bonus <span class="text-muted text-sm">(${c.sundayWorkDays} day${c.sundayWorkDays > 1 ? 's' : ''} × ${c.sundayMultiplier}× rate)</span></span><span class="amount amount-success">${API.fmtRupees(c.sundayBonus)}</span></div>`;
    }
    
    html += `<div class="calc-row"><span>(-) Advance Deducted</span><span class="amount amount-warning">${API.fmtRupees(c.advanceDeducted)}</span></div>`;
    html += `<div class="calc-row total"><span>Net Payable</span><span id="ps-net-display" class="amount" style="font-size:1.1rem">${API.fmtRupees(c.netPaid)}</span></div>`;

    if (c.carryForwardAdvance && c.carryForwardAdvance > 0) {
      html += `
        <div style="margin-top:12px; padding:10px; background:rgba(245,158,11,0.1); border-left:3px solid var(--warning); border-radius:4px; font-size:0.85rem;">
          <span style="color:var(--warning); font-weight:600;">Advance Carried Forward: ${API.fmtRupees(c.carryForwardAdvance)}</span><br>
          <span class="text-muted">Since advance taken exceeds earnings, the remaining ${API.fmtRupees(c.carryForwardAdvance)} will automatically be carried to next month's advance.</span>
        </div>
      `;
    }

    if (c.existingPayment) {
      html += `<div style="margin-top:10px"><span class="badge badge-warning">⚠ A payment record already exists for this month. Saving will overwrite it.</span></div>`;
    }

    return html;
  }

  return { init };
})();
