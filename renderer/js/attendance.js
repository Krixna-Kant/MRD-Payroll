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
    else                  await initMonthly();
  }

  /* ── BULK DAILY MODE ─────────────────────────────────────────────────────── */
  async function initBulk() {
    const sunday = isSunday(_date);
    container().innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <span class="form-label" style="margin:0">Date:</span>
          <input id="att-date-picker" type="date" class="form-input" value="${_date}" style="width:160px" />
          <span class="text-muted text-sm" id="att-day-name">${getDayName(_date)}</span>
          <span class="text-muted text-sm" id="att-bulk-count"></span>
        </div>
        <div class="toolbar-right">
          <button id="att-save-all" class="btn btn-primary" disabled>
            <span class="btn-text">Save All</span>
            <span class="btn-loader" hidden></span>
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
        <span class="text-sm text-muted">Click to toggle:</span>
        <span class="badge badge-success">P = Present</span>
        <span class="badge badge-warning">H = Half Day</span>
        <span class="badge badge-danger">A = Absent</span>
        <span class="badge badge-muted">— = Not marked</span>
      </div>

      <div id="att-bulk-list"></div>
    `;

    document.getElementById('att-date-picker').addEventListener('change', e => {
      _date = e.target.value;
      initBulk(); // re-render entire bulk section to update Sunday banner
    });
    document.getElementById('att-save-all').addEventListener('click', saveAllBulk);

    await loadBulk();
  }

  async function loadBulk() {
    const listEl = document.getElementById('att-bulk-list');
    if (!listEl) return;
    listEl.innerHTML = `<div class="skeleton" style="height:200px;border-radius:12px"></div>`;

    const res = await API.getBulkAttendance(_date);
    const records = res.records || [];
    const sunday = isSunday(_date);

    // Update day name
    const dayNameEl = document.getElementById('att-day-name');
    if (dayNameEl) dayNameEl.textContent = getDayName(_date);

    document.getElementById('att-bulk-count').textContent = `${records.length} employees`;
    const saveBtn = document.getElementById('att-save-all');
    if (saveBtn) saveBtn.disabled = records.length === 0;

    if (records.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><h3>No employees for this date</h3><p>No active employees found who had joined by this date.</p></div>`;
      return;
    }

    // Build state map: empId → { status, checkIn, checkOut, overtimeHours, isSundayWork }
    const stateMap = {};
    records.forEach(r => {
      stateMap[r.id] = {
        status:    r.status || null,
        checkIn:   r.check_in || '09:00',
        checkOut:  r.check_out || '18:00',
        overtimeHours: r.overtime_hours || 0,
        isSundayWork:  r.is_sunday_work ? true : (sunday && r.status ? true : false),
      };
    });

    listEl.innerHTML = `
      <div class="card" style="padding:0;overflow:hidden">
        <div style="overflow-x:auto">
          <table>
            <thead><tr>
              <th>Employee</th>
              <th>Role</th>
              <th style="text-align:center">Status</th>
              <th style="text-align:center">P</th>
              <th style="text-align:center">A</th>
              <th style="text-align:center">H</th>
              <th style="text-align:center">In Time</th>
              <th style="text-align:center">Out Time</th>
              <th style="text-align:center">OT (hrs)</th>
              ${sunday ? '<th style="text-align:center">Sun 2×</th>' : ''}
            </tr></thead>
            <tbody id="att-bulk-tbody">
              ${records.map(r => {
                const st = stateMap[r.id];
                const ot = calcOvertime(st.checkIn, st.checkOut);
                st.overtimeHours = ot;
                return `
                <tr id="att-row-${r.id}" class="${sunday ? 'sunday-row' : ''}">
                  <td>
                    <span class="font-600">${Helpers.escapeHtml(r.name)}</span>
                    ${r.joining_date ? `<div class="text-xs text-muted">Joined: ${Helpers.formatDate(r.joining_date)}</div>` : ''}
                  </td>
                  <td class="td-muted">${Helpers.escapeHtml(r.role || '—')}</td>
                  <td style="text-align:center" id="status-badge-${r.id}">
                    ${statusBadge(st.status)}
                  </td>
                  <td style="text-align:center">
                    <button class="att-btn att-quick-btn ${st.status === 'P' ? 'P' : ''}" data-id="${r.id}" data-status="P">P</button>
                  </td>
                  <td style="text-align:center">
                    <button class="att-btn att-quick-btn ${st.status === 'A' ? 'A' : ''}" data-id="${r.id}" data-status="A">A</button>
                  </td>
                  <td style="text-align:center">
                    <button class="att-btn att-quick-btn ${st.status === 'H' ? 'H' : ''}" data-id="${r.id}" data-status="H">H</button>
                  </td>
                  <td style="text-align:center">
                    <input type="time" class="form-input att-time-input" id="att-in-${r.id}" value="${st.checkIn}" data-id="${r.id}" data-type="in" />
                  </td>
                  <td style="text-align:center">
                    <input type="time" class="form-input att-time-input" id="att-out-${r.id}" value="${st.checkOut}" data-id="${r.id}" data-type="out" />
                  </td>
                  <td style="text-align:center" id="att-ot-${r.id}">
                    ${ot > 0 ? `<span class="badge badge-accent">${ot}h</span>` : '<span class="text-muted">—</span>'}
                  </td>
                  ${sunday ? `
                    <td style="text-align:center">
                      <input type="checkbox" class="att-sunday-check" data-id="${r.id}" ${st.isSundayWork ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--warning)" />
                    </td>
                  ` : ''}
                </tr>
              `}).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <!-- Mark All -->
      <div class="flex gap-2 mt-4">
        <span class="text-sm text-muted" style="align-self:center">Mark all as:</span>
        <button class="btn btn-sm btn-secondary att-mark-all" data-status="P">✓ All Present</button>
        <button class="btn btn-sm btn-secondary att-mark-all" data-status="A">✕ All Absent</button>
      </div>
    `;

    // Time input change → recalculate OT
    listEl.querySelectorAll('.att-time-input').forEach(inp => {
      inp.addEventListener('change', () => {
        const empId = parseInt(inp.dataset.id);
        const st = stateMap[empId];
        if (inp.dataset.type === 'in')  st.checkIn  = inp.value;
        if (inp.dataset.type === 'out') st.checkOut = inp.value;
        const ot = calcOvertime(st.checkIn, st.checkOut);
        st.overtimeHours = ot;
        document.getElementById(`att-ot-${empId}`).innerHTML =
          ot > 0 ? `<span class="badge badge-accent">${ot}h</span>` : '<span class="text-muted">—</span>';
      });
    });

    // Sunday checkbox
    listEl.querySelectorAll('.att-sunday-check').forEach(chk => {
      chk.addEventListener('change', () => {
        stateMap[parseInt(chk.dataset.id)].isSundayWork = chk.checked;
      });
    });

    // Individual status buttons
    listEl.querySelectorAll('.att-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const empId = parseInt(btn.dataset.id);
        const newStatus = stateMap[empId].status === btn.dataset.status ? null : btn.dataset.status;
        stateMap[empId].status = newStatus;
        // Update all 3 buttons for this row
        listEl.querySelectorAll(`.att-quick-btn[data-id="${empId}"]`).forEach(b => {
          b.className = `att-btn att-quick-btn${b.dataset.status === newStatus ? ' ' + newStatus : ''}`;
        });
        // Update badge
        document.getElementById(`status-badge-${empId}`).innerHTML = statusBadge(newStatus);
      });
    });

    // Mark all
    listEl.querySelectorAll('.att-mark-all').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = btn.dataset.status;
        records.forEach(r => { stateMap[r.id].status = s; });
        listEl.querySelectorAll('.att-quick-btn').forEach(b => {
          b.className = `att-btn att-quick-btn${b.dataset.status === s ? ' ' + s : ''}`;
        });
        records.forEach(r => {
          document.getElementById(`status-badge-${r.id}`).innerHTML = statusBadge(s);
        });
      });
    });

    // Store stateMap for save
    listEl._stateMap = stateMap;
    listEl._records  = records;
  }

  function statusBadge(status) {
    if (!status) return `<span class="badge badge-muted">—</span>`;
    const map = { P: 'badge-success', A: 'badge-danger', H: 'badge-warning' };
    const labels = { P: 'Present', A: 'Absent', H: 'Half Day' };
    return `<span class="badge ${map[status]}">${labels[status]}</span>`;
  }

  async function saveAllBulk() {
    const listEl = document.getElementById('att-bulk-list');
    const stateMap = listEl._stateMap;
    const records  = listEl._records;
    const userId   = AppState.get('user')?.id;
    const sunday   = isSunday(_date);

    if (!stateMap || !records) return;

    Helpers.setLoading('att-save-all', true);

    // Only save entries that have a status
    const toSave = records.filter(r => stateMap[r.id].status);
    let errors = 0;
    for (const r of toSave) {
      const st = stateMap[r.id];
      const res = await API.markAttendance({
        employeeId:    r.id,
        date:          _date,
        status:        st.status,
        markedBy:      userId,
        checkIn:       st.checkIn || null,
        checkOut:      st.checkOut || null,
        overtimeHours: st.overtimeHours || 0,
        isSundayWork:  sunday && st.isSundayWork ? 1 : 0,
      });
      if (!res.success) errors++;
    }

    Helpers.setLoading('att-save-all', false);
    if (errors > 0) Toast.error(`${errors} records failed to save.`);
    else Toast.success(`Attendance saved for ${toSave.length} employees!`);
    EventBus.emit('data:refresh');
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
