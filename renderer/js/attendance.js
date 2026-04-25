/**
 * LocalPayroll — Attendance Page
 * Two modes:
 *  1. Bulk Daily — mark all employees for a single date (with In/Out time + overtime)
 *  2. Monthly View — calendar grid per employee
 * Features: join-date filtering, Sunday detection, overtime auto-calc.
 */

const AttendancePage = (() => {
  const container  = () => document.getElementById('page-attendance');
  const headerActs = () => document.getElementById('page-header-actions');

  let _date   = Helpers.todayIso();
  let _mode   = 'bulk'; // 'bulk' | 'monthly'
  let _selEmp = null;
  let _month  = AppState.get('currentMonth');
  let _year   = AppState.get('currentYear');

  // ── Helpers ────────────────────────────────────────────────────────────────
  function isSunday(dateStr) {
    return new Date(dateStr + 'T00:00:00').getDay() === 0;
  }

  function calcOvertime(checkIn, checkOut) {
    if (!checkIn || !checkOut) return 0;
    const [inH, inM]   = checkIn.split(':').map(Number);
    const [outH, outM] = checkOut.split(':').map(Number);
    const totalMinutes  = (outH * 60 + outM) - (inH * 60 + inM);
    const workedHours   = totalMinutes / 60;
    const ot = workedHours - 9; // 9-hour standard work day
    return Math.max(0, Math.round(ot * 100) / 100); // round to 2 decimal
  }

  function getDayName(dateStr) {
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    return days[new Date(dateStr + 'T00:00:00').getDay()];
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    // Check if a specific employee was preselected (from employee profile)
    const preSelected = AppState.get('selectedEmployeeId');
    if (preSelected) {
      _mode   = 'monthly';
      _selEmp = preSelected;
      AppState.set('selectedEmployeeId', null);
    }

    headerActs().innerHTML = `
      <div class="tab-bar" style="margin-bottom:0;border:none">
        <button class="tab-btn ${_mode === 'bulk' ? 'active' : ''}" id="att-mode-bulk">Bulk Daily</button>
        <button class="tab-btn ${_mode === 'monthly' ? 'active' : ''}" id="att-mode-monthly">Monthly View</button>
      </div>
    `;

    document.getElementById('att-mode-bulk')?.addEventListener('click', () => { _mode = 'bulk'; init(); });
    document.getElementById('att-mode-monthly')?.addEventListener('click', () => { _mode = 'monthly'; init(); });

    if (_mode === 'bulk') await initBulk();
    else await initMonthly();
  }

  /* ── BULK DAILY MODE ─────────────────────────────────────────────────────── */
  async function initBulk() {
    const sunday = isSunday(_date);
    container().innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left" style="align-items:center;gap:10px">
          <button id="att-prev-day" class="btn btn-sm btn-secondary" style="padding:0 8px">◀</button>
          <input id="att-date-picker" type="date" class="form-input" value="${_date}" style="width:140px;margin:0" />
          <button id="att-next-day" class="btn btn-sm btn-secondary" style="padding:0 8px">▶</button>
          <span class="text-muted text-sm ml-2" id="att-day-name">${getDayName(_date)}</span>
          <span class="text-muted text-sm badge badge-muted" id="att-bulk-count" style="margin-left:8px"></span>
        </div>
        <div class="toolbar-right">
          <button id="att-export-excel" class="btn btn-primary">
            <span class="btn-text">Data Export 📊</span>
          </button>
        </div>
      </div>

      ${sunday ? `
        <div class="sunday-banner">
          <span class="sunday-banner-icon">🔔</span>
          <span><strong>Sunday</strong> — Attendance marked today will be counted at <strong>2× salary rate</strong></span>
        </div>
      ` : ''}

      <!-- Legend -->
      <div class="flex gap-3 mb-4" style="align-items:center">
        <span class="text-sm text-muted">Auto-saves on click:</span>
        <span class="badge badge-success">P = Present</span>
        <span class="badge badge-warning">H = Half Day</span>
        <span class="badge badge-danger">A = Absent</span>
        <span class="badge badge-info">WO = Weekly Off</span>
        <span class="badge badge-muted">— = Not marked</span>
      </div>

      <div id="att-bulk-list"></div>
    `;

    document.getElementById('att-date-picker').addEventListener('change', e => {
      _date = e.target.value;
      initBulk();
    });
    
    document.getElementById('att-prev-day').addEventListener('click', () => {
      const d = new Date(_date + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      _date = Helpers.todayIso(d);
      initBulk();
    });

    document.getElementById('att-next-day').addEventListener('click', () => {
      const d = new Date(_date + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      _date = Helpers.todayIso(d);
      initBulk();
    });

    document.getElementById('att-export-excel').addEventListener('click', async () => {
      const empRes = await API.getEmployees({ status: 'active' });
      const employees = empRes.employees || [];
      const today = Helpers.todayIso();
      const firstOfMonth = `${today.substring(0, 8)}01`;

      Modal.open({
        title: 'Export Attendance Report',
        size: 'modal-md',
        body: `
          <div class="form-group mb-4">
            <label class="form-label">Date Range</label>
            <div class="flex gap-2">
              <input type="date" id="exp-start-date" class="form-input" value="${firstOfMonth}" />
              <div class="flex items-center">to</div>
              <input type="date" id="exp-end-date" class="form-input" value="${today}" />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label flex justify-between">
              <span>Select Employees</span>
              <label class="text-xs flex items-center gap-1 cursor-pointer" style="font-weight:400">
                <input type="checkbox" id="exp-select-all" checked /> Select All
              </label>
            </label>
            <div id="exp-emp-list" class="card" style="max-height:200px; overflow-y:auto; padding:8px; background:var(--bg-subtle)">
              ${employees.map(e => `
                <label class="flex items-center gap-2 p-1 hover-dim cursor-pointer" style="font-size:0.9rem">
                  <input type="checkbox" class="exp-emp-check" value="${e.id}" checked />
                  <span>${Helpers.escapeHtml(e.name)}</span>
                </label>
              `).join('')}
            </div>
          </div>
        `,
        footer: `
          <button class="btn btn-secondary" id="exp-cancel">Cancel</button>
          <button class="btn btn-primary" id="exp-run">
            <span class="btn-text">Download Excel 📊</span>
            <span class="btn-loader" hidden></span>
          </button>
        `
      });

      const selectAll = document.getElementById('exp-select-all');
      const checks = document.querySelectorAll('.exp-emp-check');
      
      selectAll.addEventListener('change', () => {
        checks.forEach(c => c.checked = selectAll.checked);
      });

      document.getElementById('exp-cancel').addEventListener('click', Modal.close);
      document.getElementById('exp-run').addEventListener('click', async () => {
        const startDate = document.getElementById('exp-start-date').value;
        const endDate   = document.getElementById('exp-end-date').value;
        const selectedIds = Array.from(document.querySelectorAll('.exp-emp-check:checked')).map(c => parseInt(c.value));

        if (!startDate || !endDate) { Toast.warning('Please select dates'); return; }
        if (selectedIds.length === 0) { Toast.warning('Please select at least one employee'); return; }

        Helpers.setLoading('exp-run', true);
        const r = await API.exportAttendanceRangeExcel({ startDate, endDate, employeeIds: selectedIds });
        Helpers.setLoading('exp-run', false);

        if (r.success) {
          Toast.success('Excel exported successfully!');
          Modal.close();
        } else if (r.error !== 'Cancelled.') {
          Toast.error(r.error);
        }
      });
    });

    await loadBulk();
  }

  async function loadBulk() {
    const listEl = document.getElementById('att-bulk-list');
    if (!listEl) return;
    listEl.innerHTML = `<div class="skeleton" style="height:200px;border-radius:12px"></div>`;
    try {

    // Wait for settings to load projects list
    const settingsRes = await API.getSettings();
    const settings = settingsRes.success ? settingsRes.settings : {};
    let projects = [];
    if (settings.projects_list) {
      try { projects = JSON.parse(settings.projects_list); }
      catch { projects = settings.projects_list.split(',').map(p=>p.trim()); }
    }

    const res = await API.getBulkAttendance(_date);
    const records = res.records || [];
    const sunday = isSunday(_date);

    const dayNameEl = document.getElementById('att-day-name');
    if (dayNameEl) dayNameEl.textContent = getDayName(_date);
    document.getElementById('att-bulk-count').textContent = `${records.length} employees`;

    if (records.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><h3>No employees for this date</h3><p>No active employees found who had joined by this date.</p></div>`;
      return;
    }

    // Build state map
    const stateMap = {};
    records.forEach(r => {
      let initStatus = r.status || null;
      if (sunday && !r.status) {
         initStatus = (r.sat_status === 'A' || r.mon_status === 'A') ? 'A' : 'WO';
      }
      stateMap[r.id] = {
        status:        initStatus,
        isLocked:      !!r.status, // lock if there's already a saved status per persist rules
        checkIn:       r.check_in || '09:00',
        checkOut:      r.check_out || '18:00',
        overtimeHours: Math.floor(parseFloat(r.overtime_hours || 0)),
        isSundayWork:  r.is_sunday_work ? true : (sunday && r.status ? true : false),
        projectName:   r.project_name || '',
      };
    });

    function applyRules(empId) {
      const st = stateMap[empId];
      const r = records.find(x => x.id === empId);

      if (sunday) {
        if (!st.status || st.status === '') {
           st.status = (r.sat_status === 'A' || r.mon_status === 'A') ? 'A' : 'WO';
        } else if (st.status === 'P') {
           st.overtimeHours = st.isSundayWork ? 8 : 0;
        }
      }
      st.overtimeHours = Math.floor(Math.max(0, st.overtimeHours));
      if (st.overtimeHours < 1) st.overtimeHours = 0;
    }

    async function autoSaveRow(empId) {
      const st = stateMap[empId];
      try {
        const res = await API.markAttendance({
          employeeId: empId,
          date: _date,
          status: st.status || '', 
          checkIn: st.checkIn,
          checkOut: st.checkOut,
          overtimeHours: st.overtimeHours,
          isSundayWork: st.isSundayWork,
          projectName: st.projectName
        });
        
        if (!res.success) throw new Error(res.error || 'Database operation failed');

        const tr = document.getElementById(`att-row-${empId}`);
        if (tr) {
          tr.style.background = 'rgba(74,222,128,0.1)';
          setTimeout(() => tr.style.background = '', 500);
        }
      } catch (err) {
        Toast.error('Save error: ' + err.message);
        console.error(err);
      }
    }

    // Recompute Overtime visually
    function renderOT(empId) {
      const st = stateMap[empId];
      const otEl = document.getElementById(`att-ot-${empId}`);
      if (!otEl) return;
      otEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;gap:4px">
          <button class="btn btn-sm btn-secondary att-ot-minus" data-id="${empId}" style="padding:2px 6px">-</button>
          <span style="font-size:0.9rem;width:30px;text-align:center" class="${st.overtimeHours > 0 ? 'text-accent font-600' : 'text-muted'}">${st.overtimeHours}h</span>
          <button class="btn btn-sm btn-secondary att-ot-plus" data-id="${empId}" style="padding:2px 6px">+</button>
        </div>
      `;
    }

    listEl.innerHTML = `
      <div class="card" style="padding:0;overflow:hidden">
        <div style="overflow-x:auto">
          <table>
            <thead><tr>
              <th>Employee</th>
              <th>Project</th>
              <th style="text-align:center">Status</th>
              <th style="text-align:center">P</th>
              <th style="text-align:center">A</th>
              <th style="text-align:center">H</th>
              <th style="text-align:center">WO</th>
              <th style="text-align:center">In Time</th>
              <th style="text-align:center">Out Time</th>
              <th style="text-align:center;min-width:110px">OT (hrs)</th>
              ${sunday ? '<th style="text-align:center">Sun 2×</th>' : ''}
            </tr></thead>
            <tbody id="att-bulk-tbody">
              ${records.map(r => {
                const st = stateMap[r.id];
                return `
                <tr id="att-row-${r.id}" class="${sunday ? 'sunday-row' : ''}">
                  <td>
                    <span class="font-600">${Helpers.escapeHtml(r.name)}</span>
                    ${r.joining_date ? `<div class="text-xs text-muted">Join: ${Helpers.formatDateShort(r.joining_date)}</div>` : ''}
                  </td>
                  <td>
                    <select class="form-select att-project-sel" data-id="${r.id}" style="padding:4px;font-size:0.85rem">
                      <option value="">-- None --</option>
                      ${projects.map(p => `<option value="${Helpers.escapeHtml(p)}" ${st.projectName === p ? 'selected' : ''}>${Helpers.escapeHtml(p)}</option>`).join('')}
                    </select>
                  </td>
                  <td style="text-align:center" id="status-badge-${r.id}">
                    <div style="display:flex; align-items:center; justify-content:center; gap:6px;">
                      ${statusBadge(st.status)}
                      ${st.isLocked ? `<button class="btn btn-sm btn-ghost att-unlock" data-id="${r.id}" style="padding:2px 6px; font-size:14px" title="Unlock Row">🔓</button>` : ''}
                    </div>
                  </td>
                  <td style="text-align:center"><button class="att-btn att-quick-btn ${st.status === 'P' ? 'P' : ''}" data-id="${r.id}" data-status="P" style="${st.isLocked && st.status !== 'P' ? 'opacity:0.3' : ''}">P</button></td>
                  <td style="text-align:center"><button class="att-btn att-quick-btn ${st.status === 'A' ? 'A' : ''}" data-id="${r.id}" data-status="A" style="${st.isLocked && st.status !== 'A' ? 'opacity:0.3' : ''}">A</button></td>
                  <td style="text-align:center"><button class="att-btn att-quick-btn ${st.status === 'H' ? 'H' : ''}" data-id="${r.id}" data-status="H" style="${st.isLocked && st.status !== 'H' ? 'opacity:0.3' : ''}">H</button></td>
                  <td style="text-align:center"><button class="att-btn att-quick-btn ${st.status === 'WO' ? 'WO' : ''}" data-id="${r.id}" data-status="WO" style="${st.isLocked && st.status !== 'WO' ? 'opacity:0.3' : ''}">WO</button></td>
                  <td style="text-align:center"><input type="time" class="form-input att-time-input" style="padding:4px;font-size:0.85rem" id="att-in-${r.id}" value="${st.checkIn}" data-id="${r.id}" data-type="in" /></td>
                  <td style="text-align:center"><input type="time" class="form-input att-time-input" style="padding:4px;font-size:0.85rem" id="att-out-${r.id}" value="${st.checkOut}" data-id="${r.id}" data-type="out" /></td>
                  <td style="text-align:center" id="att-ot-${r.id}"></td>
                  ${sunday ? `<td style="text-align:center"><input type="checkbox" class="att-sunday-check" data-id="${r.id}" ${st.isSundayWork ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--warning)" /></td>` : ''}
                </tr>
              `}).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <!-- Mark All -->
      <div class="flex gap-2 mt-4" style="align-items:center">
        <span class="text-sm text-muted">Mark all as:</span>
        <button class="btn btn-sm btn-secondary att-mark-all" data-status="P">✓ All Present</button>
        <button class="btn btn-sm btn-secondary att-mark-all" data-status="A">✕ All Absent</button>
        <button class="btn btn-sm btn-secondary att-mark-all" data-status="WO">ℹ All Weekly Off</button>
      </div>
    `;

    // Initialize OT UI
    records.forEach(r => renderOT(r.id));

    // DOM Binding
    listEl.addEventListener('click', async e => {
      // P/A/H Buttons
      if (e.target.closest('.att-quick-btn')) {
        const btn = e.target.closest('.att-quick-btn');
        const empId = parseInt(btn.dataset.id);
        const st = stateMap[empId];

        if (st.isLocked) {
           Toast.warning("Row is locked. Please click 🔓 to change.");
           return;
        }

        st.status = btn.dataset.status;
        applyRules(empId);
        
        // Update Button rendering immediately
        listEl.querySelectorAll(`.att-quick-btn[data-id="${empId}"]`).forEach(b => {
          b.className = `att-btn att-quick-btn${b.dataset.status === st.status ? ' ' + st.status : ''}`;
          if (b.dataset.status !== st.status) {
            b.style.opacity = '0.3';
          } else {
            b.style.opacity = '1';
          }
        });

        await autoSaveRow(empId);
        st.isLocked = true;
        
        document.getElementById(`status-badge-${empId}`).innerHTML = `
          <div style="display:flex; align-items:center; justify-content:center; gap:6px;">
            ${statusBadge(st.status)}
            <button class="btn btn-sm btn-ghost att-unlock" data-id="${empId}" style="padding:2px 6px; font-size:14px" title="Unlock Row">🔓</button>
          </div>
        `;
      }

      // Unlock Row Button
      if (e.target.closest('.att-unlock')) {
        const empId = parseInt(e.target.closest('.att-unlock').dataset.id);
        const st = stateMap[empId];
        st.isLocked = false;
        
        listEl.querySelectorAll(`.att-quick-btn[data-id="${empId}"]`).forEach(b => {
          b.style.opacity = '1';
        });
        document.getElementById(`status-badge-${empId}`).innerHTML = `
          <div style="display:flex; align-items:center; justify-content:center; gap:6px;">
            ${statusBadge(st.status)}
          </div>
        `;
      }
      
      // OT Adjustments
      if (e.target.closest('.att-ot-minus')) {
        const empId = parseInt(e.target.closest('.att-ot-minus').dataset.id);
        if (stateMap[empId].isLocked) { Toast.warning("Unlock row first"); return; }
        stateMap[empId].overtimeHours = Math.max(0, stateMap[empId].overtimeHours - 1);
        applyRules(empId);
        renderOT(empId);
        await autoSaveRow(empId);
      }
      if (e.target.closest('.att-ot-plus')) {
        const empId = parseInt(e.target.closest('.att-ot-plus').dataset.id);
        if (stateMap[empId].isLocked) { Toast.warning("Unlock row first"); return; }
        stateMap[empId].overtimeHours += 1;
        applyRules(empId);
        renderOT(empId);
        await autoSaveRow(empId);
      }
      
      // Mark All
      if (e.target.closest('.att-mark-all')) {
        const btn = e.target.closest('.att-mark-all');
        const s = btn.dataset.status;
        btn.innerHTML = `<span class="btn-loader" style="width:14px;height:14px"></span> Saving...`;
        btn.disabled = true;

        for (const r of records) {
          stateMap[r.id].status = s;
          applyRules(r.id);
          stateMap[r.id].isLocked = true;
          listEl.querySelectorAll(`.att-quick-btn[data-id="${r.id}"]`).forEach(b => {
            b.className = `att-btn att-quick-btn${b.dataset.status === s ? ' ' + s : ''}`;
            if (b.dataset.status !== s) {
              b.style.opacity = '0.3';
            } else {
              b.style.opacity = '1';
            }
          });
          document.getElementById(`status-badge-${r.id}`).innerHTML = `
            <div style="display:flex; align-items:center; justify-content:center; gap:6px;">
              ${statusBadge(s)}
              <button class="btn btn-sm btn-ghost att-unlock" data-id="${r.id}" style="padding:2px 6px; font-size:14px" title="Unlock Row">🔓</button>
            </div>
          `;
          await autoSaveRow(r.id);
        }
        
        const labels = { P: '✓ All Present', A: '✕ All Absent', WO: 'ℹ All Weekly Off' };
        btn.innerHTML = labels[s] || 'Mark All';
        btn.disabled = false;
        Toast.success('Saved all attendance globally.');
      }
    });

    listEl.addEventListener('change', async e => {
      // Time changes
      if (e.target.classList.contains('att-time-input')) {
        const inp = e.target;
        const empId = parseInt(inp.dataset.id);
        if (inp.dataset.type === 'in') stateMap[empId].checkIn = inp.value;
        if (inp.dataset.type === 'out') stateMap[empId].checkOut = inp.value;
        let ot = calcOvertime(stateMap[empId].checkIn, stateMap[empId].checkOut);
        stateMap[empId].overtimeHours = ot;
        applyRules(empId);
        renderOT(empId);
        await autoSaveRow(empId);
      }
      
      // Project changing
      if (e.target.classList.contains('att-project-sel')) {
        const empId = parseInt(e.target.dataset.id);
        stateMap[empId].projectName = e.target.value;
        await autoSaveRow(empId);
      }

      // Sunday boolean
      if (e.target.classList.contains('att-sunday-check')) {
        const empId = parseInt(e.target.dataset.id);
        stateMap[empId].isSundayWork = e.target.checked;
        applyRules(empId);
        renderOT(empId);
        await autoSaveRow(empId);
      }
    });
    } catch(err) {
      console.error('[Attendance loadBulk ERROR]', err);
      listEl.innerHTML = `<div class="empty-state"><h3 style="color:var(--danger)">Render Error</h3><p>${err.message}</p></div>`;
      return;
    }
  }

  function statusBadge(status) {
    if (!status) return `<span class="badge badge-muted">—</span>`;
    const map = { P: 'badge-success', A: 'badge-danger', H: 'badge-warning', WO: 'badge-info' };
    const labels = { P: 'Present', A: 'Absent', H: 'Half Day', WO: 'Weekly Off' };
    return `<span class="badge ${map[status] || 'badge-muted'}">${labels[status] || status}</span>`;
  }

  /* ── MONTHLY VIEW MODE ───────────────────────────────────────────────────── */
  async function initMonthly() {
    const empRes = await API.getEmployees({ status: 'active' });
    const employees = empRes.employees || [];

    if (!_selEmp && employees.length > 0) _selEmp = employees[0].id;

    container().innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="form-group" style="flex-direction:row;align-items:center;gap:8px;margin:0">
            <label class="form-label" style="margin:0;white-space:nowrap">Employee:</label>
            <select id="att-emp-select" class="form-select" style="width:220px">
              ${employees.map(e => `<option value="${e.id}" ${e.id === _selEmp ? 'selected' : ''}>${Helpers.escapeHtml(e.name)}</option>`).join('')}
            </select>
          </div>
          <div class="month-picker">
            ${Helpers.buildMonthSelect('att-month-sel', _month)}
            ${Helpers.buildYearSelect('att-year-sel', _year)}
          </div>
        </div>
        <div class="toolbar-right">
          <div id="att-summary-chips" class="flex gap-2" style="flex-wrap:wrap"></div>
        </div>
      </div>
      <div id="att-calendar-container" class="card"></div>
    `;

    document.getElementById('att-emp-select').addEventListener('change', e => { _selEmp = parseInt(e.target.value); loadMonthly(); });
    document.getElementById('att-month-sel').addEventListener('change', e => { _month = parseInt(e.target.value); loadMonthly(); });
    document.getElementById('att-year-sel').addEventListener('change',  e => { _year  = parseInt(e.target.value); loadMonthly(); });

    await loadMonthly();
  }

  async function loadMonthly() {
    if (!_selEmp) return;
    const calEl  = document.getElementById('att-calendar-container');
    const sumEl  = document.getElementById('att-summary-chips');
    if (!calEl) return;

    calEl.innerHTML = `<div class="skeleton" style="height:280px;border-radius:8px"></div>`;

    const [attRes, sumRes] = await Promise.all([
      API.getMonthAttendance(_selEmp, _month, _year),
      API.getAttendanceSummary(_selEmp, _month, _year),
    ]);

    const records = attRes.records || [];
    const joiningDate = attRes.joiningDate || null; // from backend
    const summary = sumRes.summary || { P: 0, A: 0, H: 0, effectiveDays: 0, totalOvertimeHours: 0, sundayWorkDays: 0 };

    // Summary chips
    if (sumEl) {
      sumEl.innerHTML = `
        <span class="badge badge-success">✓ ${summary.P} Present</span>
        <span class="badge badge-danger">✕ ${summary.A} Absent</span>
        <span class="badge badge-warning">½ ${summary.H} Half Day</span>
        <span class="badge badge-accent">≈ ${summary.effectiveDays} Effective</span>
        ${summary.totalOvertimeHours > 0 ? `<span class="badge badge-accent">⏱ ${summary.totalOvertimeHours.toFixed(1)}h OT</span>` : ''}
        ${summary.sundayWorkDays > 0 ? `<span class="badge badge-warning">☀ ${summary.sundayWorkDays} Sun</span>` : ''}
      `;
    }

    // Build record map: date → full record
    const recordMap = {};
    records.forEach(r => { recordMap[r.date] = r; });

    // Generate calendar
    const daysInMonth = new Date(_year, _month, 0).getDate();
    const firstDay    = new Date(_year, _month - 1, 1).getDay(); // 0=Sun
    const userId      = AppState.get('user')?.id;

    const dayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    let calHtml = `
      <div style="margin-bottom:16px;font-weight:600">
        ${Helpers.monthName(_month)} ${_year} — Attendance Calendar
        ${joiningDate ? `<span class="text-sm text-muted" style="font-weight:400;margin-left:12px">Joined: ${Helpers.formatDate(joiningDate)}</span>` : ''}
      </div>
      <div class="att-calendar">
        ${dayLabels.map(d => `<div class="att-calendar-header">${d}</div>`).join('')}
        ${Array(firstDay).fill('<div></div>').join('')}
    `;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${_year}-${String(_month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const rec     = recordMap[dateStr] || null;
      const status  = rec ? rec.status : null;
      const isSun   = isSunday(dateStr);
      const hasOT   = rec && rec.overtime_hours > 0;
      const hasSunWork = rec && rec.is_sunday_work;
      const beforeJoin = joiningDate && dateStr < joiningDate;

      if (beforeJoin) {
        // Gray out dates before joining — no interaction
        calHtml += `
          <div class="att-calendar-cell pre-join-cell">
            <div class="att-date-label">${d}</div>
            <div class="att-btn att-cal-btn disabled-cell" title="Not joined yet">—</div>
          </div>
        `;
      } else {
        calHtml += `
          <div class="att-calendar-cell ${isSun ? 'sunday-cell' : ''}">
            <div class="att-date-label">${d}${isSun ? ' <span class="text-xs" style="color:var(--warning)">Sun</span>' : ''}</div>
            <button class="att-btn att-cal-btn ${status || ''}" data-date="${dateStr}" data-status="${status || ''}" title="${dateStr}">
              ${status || '—'}
            </button>
            ${hasOT ? `<div class="att-cell-badge ot-badge">${rec.overtime_hours}h</div>` : ''}
            ${hasSunWork ? `<div class="att-cell-badge sun-badge">2×</div>` : ''}
          </div>
        `;
      }
    }
    calHtml += `</div>`;
    calEl.innerHTML = calHtml;

    // Calendar cell click → cycle P → A → H → null (only for active cells)
    calEl.querySelectorAll('.att-cal-btn:not(.disabled-cell)').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cycle = { '': 'P', 'P': 'A', 'A': 'H', 'H': '' };
        const next  = cycle[btn.dataset.status];
        btn.dataset.status = next;
        btn.className = `att-btn att-cal-btn ${next}`;
        btn.textContent = next || '—';
        if (next) {
          const dateIsSunday = isSunday(btn.dataset.date);
          await API.markAttendance({
            employeeId:    _selEmp,
            date:          btn.dataset.date,
            status:        next,
            markedBy:      userId,
            isSundayWork:  dateIsSunday ? 1 : 0,
          });
        }
        // Refresh summary
        const sr = await API.getAttendanceSummary(_selEmp, _month, _year);
        const sm = sr.summary || {};
        document.getElementById('att-summary-chips').innerHTML = `
          <span class="badge badge-success">✓ ${sm.P} Present</span>
          <span class="badge badge-danger">✕ ${sm.A} Absent</span>
          <span class="badge badge-warning">½ ${sm.H} Half Day</span>
          <span class="badge badge-accent">≈ ${sm.effectiveDays} Effective</span>
          ${sm.totalOvertimeHours > 0 ? `<span class="badge badge-accent">⏱ ${sm.totalOvertimeHours.toFixed(1)}h OT</span>` : ''}
          ${sm.sundayWorkDays > 0 ? `<span class="badge badge-warning">☀ ${sm.sundayWorkDays} Sun</span>` : ''}
        `;
        EventBus.emit('data:refresh');
      });
    });
  }

  return { init };
})();
