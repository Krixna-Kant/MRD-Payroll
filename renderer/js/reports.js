/**
 * LocalPayroll — Reports Page
 * Export PDF and Excel reports for monthly summaries and employee ledgers.
 */

const ReportsPage = (() => {
  const container  = () => document.getElementById('page-reports');
  const headerActs = () => document.getElementById('page-header-actions');
  let _month = AppState.get('currentMonth');
  let _year  = AppState.get('currentYear');
  let _employees = [];

  async function init() {
    headerActs().innerHTML = '';
    const res = await API.getEmployees({ status: 'active' });
    _employees = res.employees || [];
    render();
  }

  function render() {
    container().innerHTML = `
      <!-- Monthly Reports -->
      <div class="section-header mb-4">
        <div class="section-title">📊 Monthly Reports</div>
        <div class="month-picker">
          ${Helpers.buildMonthSelect('rpt-month', _month)}
          ${Helpers.buildYearSelect('rpt-year', _year)}
        </div>
      </div>

      <div class="grid-2 mb-5">
        ${reportCard(
          '📄 Monthly Salary Report (PDF)',
          `Full salary summary for ${Helpers.monthName(_month)} ${_year}. Includes gross, advances, net paid, and status for all employees.`,
          'btn-primary', 'Export PDF', 'rpt-monthly-pdf'
        )}
        ${reportCard(
          '📊 Monthly Salary Report (Excel)',
          `Spreadsheet export of all salary records for ${Helpers.monthName(_month)} ${_year}. Open in Excel or Google Sheets.`,
          'btn-success', 'Export Excel', 'rpt-monthly-excel'
        )}
      </div>

      <div class="divider"></div>

      <!-- Employee Reports -->
      <div class="section-header mb-4 mt-4">
        <div class="section-title">👤 Employee Reports</div>
        <select id="rpt-emp-select" class="form-select" style="width:220px">
          <option value="">— Select Employee —</option>
          ${_employees.map(e => `<option value="${e.id}">${Helpers.escapeHtml(e.name)}</option>`).join('')}
        </select>
      </div>

      <div class="grid-2 mb-5">
        ${reportCard(
          '📊 Employee Full History (Excel)',
          'Complete payment history and advance ledger for the selected employee.',
          'btn-success', 'Export Excel', 'rpt-emp-excel'
        )}
        ${reportCard(
          '💬 WhatsApp Salary Summary',
          'Share a pre-filled salary message to the selected employee via WhatsApp.',
          'btn-secondary', 'Open WhatsApp', 'rpt-whatsapp'
        )}
      </div>

      <div class="divider"></div>

      <!-- Backup -->
      <div class="section-header mb-4 mt-4">
        <div class="section-title">💾 Data Backup</div>
      </div>

      <div class="grid-2">
        ${reportCard(
          '💾 Export Backup',
          'Save a complete copy of your database to a .db file. Recommended monthly.',
          'btn-secondary', 'Export Backup', 'rpt-backup-export'
        )}
        ${reportCard(
          '📥 Import / Restore Backup',
          '<span class="badge badge-danger" style="margin-bottom:8px;display:inline-block">⚠ DESTRUCTIVE</span> Replace current database with a backup file. All current data will be overwritten.',
          'btn-danger', 'Import Backup', 'rpt-backup-import'
        )}
      </div>
    `;

    // Filters
    document.getElementById('rpt-month').addEventListener('change', e => { _month = parseInt(e.target.value); render(); });
    document.getElementById('rpt-year').addEventListener('change',  e => { _year  = parseInt(e.target.value); render(); });

    // Monthly PDF
    document.getElementById('rpt-monthly-pdf').addEventListener('click', async () => {
      const btn = document.getElementById('rpt-monthly-pdf');
      btn.disabled = true; btn.textContent = 'Generating...';
      const r = await API.exportMonthlyPdf(_month, _year);
      btn.disabled = false; btn.textContent = 'Export PDF';
      if (r.success) Toast.success('PDF saved!');
      else if (r.error !== 'Cancelled.') Toast.error(r.error);
    });

    // Monthly Excel
    document.getElementById('rpt-monthly-excel').addEventListener('click', async () => {
      const btn = document.getElementById('rpt-monthly-excel');
      btn.disabled = true; btn.textContent = 'Generating...';
      const r = await API.exportMonthlyExcel(_month, _year);
      btn.disabled = false; btn.textContent = 'Export Excel';
      if (r.success) Toast.success('Excel saved!');
      else if (r.error !== 'Cancelled.') Toast.error(r.error);
    });

    // Employee Excel
    document.getElementById('rpt-emp-excel').addEventListener('click', async () => {
      const empId = document.getElementById('rpt-emp-select').value;
      if (!empId) { Toast.warning('Please select an employee first.'); return; }
      const btn = document.getElementById('rpt-emp-excel');
      btn.disabled = true; btn.textContent = 'Generating...';
      const r = await API.exportEmployeeExcel(parseInt(empId));
      btn.disabled = false; btn.textContent = 'Export Excel';
      if (r.success) Toast.success('Employee Excel saved!');
      else if (r.error !== 'Cancelled.') Toast.error(r.error);
    });

    // WhatsApp
    document.getElementById('rpt-whatsapp').addEventListener('click', async () => {
      const empId = document.getElementById('rpt-emp-select').value;
      if (!empId) { Toast.warning('Please select an employee first.'); return; }

      const emp = _employees.find(e => String(e.id) === String(empId));
      if (!emp) { Toast.error('Employee not found.'); return; }
      if (!emp.phone) { Toast.warning('This employee has no phone number.'); return; }

      // Fetch latest payment for this month
      const payRes = await API.getPayments({ employeeId: emp.id, month: _month, year: _year });
      const payment = payRes.payments?.[0];

      const msg = payment
        ? `Dear ${emp.name},\n\nYour salary for ${Helpers.monthName(_month)} ${_year}:\nGross: ${API.fmtRupees(payment.gross_salary)}\nAdvance: ${API.fmtRupees(payment.advance_deducted)}\n*Net: ${API.fmtRupees(payment.net_paid)}*\nMode: ${payment.mode}\n\nThank you!\n— LocalPayroll`
        : `Dear ${emp.name},\n\nPlease contact us regarding your ${Helpers.monthName(_month)} ${_year} salary.\n\n— LocalPayroll`;

      const phone = emp.phone.replace(/\D/g, '');
      const url = `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`;
      window.open(url, '_blank');
    });

    // Backup Export
    document.getElementById('rpt-backup-export').addEventListener('click', async () => {
      const r = await API.exportBackup();
      if (r.success) Toast.success('Backup saved successfully!');
      else if (r.error !== 'Cancelled.') Toast.error(r.error);
    });

    // Backup Import
    document.getElementById('rpt-backup-import').addEventListener('click', () => {
      Modal.confirm(
        `<strong>This will REPLACE all current data</strong> with the selected backup file.<br><br>This cannot be undone. Are you sure?`,
        async () => {
          const r = await API.importBackup();
          if (r.requiresReload) {
            Toast.success('Backup restored! Reloading app...');
            setTimeout(() => window.location.reload(), 2000);
          } else if (!r.success && r.error !== 'Cancelled.') {
            Toast.error(r.error);
          }
        },
        { title: '⚠ Restore Backup', danger: true }
      );
    });
  }

  function reportCard(title, desc, btnClass, btnLabel, btnId) {
    return `
      <div class="card" style="display:flex;flex-direction:column;gap:14px">
        <div>
          <div class="section-title" style="margin-bottom:8px">${title}</div>
          <p class="text-muted text-sm" style="line-height:1.7">${desc}</p>
        </div>
        <button id="${btnId}" class="btn ${btnClass}" style="align-self:flex-start">${btnLabel}</button>
      </div>
    `;
  }

  return { init };
})();
