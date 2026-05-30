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
  let _stateMap = {}; // Shared state for bulk marking
  let _records  = []; // Keep track of current bulk records for row re-rendering
  let _projects = []; // Keep track of projects for row re-rendering


  // ── Helpers ────────────────────────────────────────────────────────────────
  function isSunday(dateStr) {
    return new Date(dateStr + 'T00:00:00').getDay() === 0;
  }

  function parseTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const parts = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (!parts) return null;
    let hours = parseInt(parts[1]);
    const minutes = parseInt(parts[2]);
    const ampm = parts[3];
    if (ampm) {
      if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
      if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
    }
    return hours * 60 + minutes;
  }

  function calcOvertime(checkIn, checkOut, extraIn, extraOut) {
    let totalMinutes = 0;
    
    const start = parseTime(checkIn);
    const end   = parseTime(checkOut);
    if (start !== null && end !== null) {
      let diff = end - start;
      if (diff < 0) diff += 1440;
      totalMinutes += diff;
    }

    const estart = parseTime(extraIn);
    const eend   = parseTime(extraOut);
    if (estart !== null && eend !== null) {
      let ediff = eend - estart;
      if (ediff < 0) ediff += 1440;
      totalMinutes += ediff;
    }

    const workedHours = totalMinutes / 60;
    const ot = workedHours - 9; // 9-hour standard work day
    return Math.max(0, Math.round(ot * 100) / 100); 
  }

  function getDayName(dateStr) {
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    return days[new Date(dateStr + 'T00:00:00').getDay()];
  }

  function calculateTotalHours(empId) {
    const st = _stateMap[empId];
    let totalMinutes = 0;
    
    if (st.status === 'P' || st.status === 'H') {
      const start = parseTime(st.checkIn);
      const end   = parseTime(st.checkOut);
      if (start !== null && end !== null) {
        let diff = end - start;
        if (diff < 0) diff += 1440;
        totalMinutes += diff;
      }
      
      const estart = parseTime(st.extraIn);
      const eend   = parseTime(st.extraOut);
      if (estart !== null && eend !== null) {
        let ediff = eend - estart;
        if (ediff < 0) ediff += 1440;
        totalMinutes += ediff;
      }
    }
    
    return Math.round((totalMinutes / 60) * 100) / 100;
  }

  async function handleExtraShift(empId) {
    const st = _stateMap[empId];
    const r  = _records.find(x => x.id === empId);

    Modal.open({
      title: `🌙 Extra Shift Entry — ${r.name}`,
      body: `
        <div class="form-group">
          <label class="form-label">Shift Type</label>
          <select id="extra-type" class="form-select">
            <option value="night" ${st.extraShiftType === 'night' ? 'selected' : ''}>Night Shift</option>
            <option value="shutdown" ${st.extraShiftType === 'shutdown' ? 'selected' : ''}>Shutdown Work</option>
          </select>
        </div>
        <div class="flex gap-3">
          <div class="form-group flex-1">
            <label class="form-label">In Time</label>
            <input type="time" id="extra-in" class="form-input" value="${st.extraIn || '20:00'}" />
          </div>
          <div class="form-group flex-1">
            <label class="form-label">Out Time</label>
            <input type="time" id="extra-out" class="form-input" value="${st.extraOut || '02:00'}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <input type="text" id="extra-notes" class="form-input" value="${st.extraNotes || ''}" placeholder="e.g. Machine Maintenance" />
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-danger" id="extra-clear-btn">Clear Extra Shift</button>
        <button class="btn btn-primary" id="extra-save-btn">Save Shift</button>
      `
    });

    document.getElementById('extra-clear-btn').addEventListener('click', async () => {
      st.extraShiftType = null;
      st.extraIn = '';
      st.extraOut = '';
      st.extraNotes = '';
      st.overtimeHours = calcOvertime(st.checkIn, st.checkOut, st.extraIn, st.extraOut);
      await autoSaveRow(empId);
      renderRow(empId);
      Modal.close();
    });

    document.getElementById('extra-save-btn').addEventListener('click', async () => {
      st.extraShiftType = document.getElementById('extra-type').value;
      st.extraIn = document.getElementById('extra-in').value;
      st.extraOut = document.getElementById('extra-out').value;
      st.extraNotes = document.getElementById('extra-notes').value;
      
      st.overtimeHours = calcOvertime(st.checkIn, st.checkOut, st.extraIn, st.extraOut);
      
      await autoSaveRow(empId);
      renderRow(empId);
      Modal.close();
      Toast.success('Extra shift added. OT recalculated.');
    });
  }

  async function init(params = {}) {
    try {
      if (params.date) _date = params.date;
      if (params.mode) _mode = params.mode;
      if (params.employeeId) {
        _selEmp = parseInt(params.employeeId);
        _mode = 'monthly';
      }

      // Check if a specific employee was preselected (from employee profile)
      const preSelected = AppState.get('selectedEmployeeId');
      if (preSelected && !_selEmp) {
        _mode   = 'monthly';
        _selEmp = preSelected;
        AppState.set('selectedEmployeeId', null);
      }

      const user = AppState.get('user');
      const isAdmin = user?.role === 'admin';
      const isHR = user?.role === 'hr';

      headerActs().innerHTML = `
        <div class="tab-bar" style="margin-bottom:0;border:none">
          <button class="tab-btn ${_mode === 'bulk' ? 'active' : ''}" id="att-mode-bulk">Bulk Daily</button>
          <button class="tab-btn ${_mode === 'monthly' ? 'active' : ''}" id="att-mode-monthly">Monthly View</button>
          <button class="tab-btn ${_mode === 'pending' ? 'active' : ''}" id="att-mode-pending">Pending <span id="att-pending-badge" class="badge badge-danger" style="margin-left:4px;display:none">0</span></button>
          ${(isAdmin || isHR) ? `<button class="tab-btn ${_mode === 'corrections' ? 'active' : ''}" id="att-mode-corrections">Correction Requests</button>` : ''}
        </div>
      `;

      document.getElementById('att-mode-bulk')?.addEventListener('click', () => { _mode = 'bulk'; init(); });
      document.getElementById('att-mode-monthly')?.addEventListener('click', () => { _mode = 'monthly'; init(); });
      document.getElementById('att-mode-pending')?.addEventListener('click', () => { _mode = 'pending'; init(); });
      document.getElementById('att-mode-corrections')?.addEventListener('click', () => { _mode = 'corrections'; init(); });

      if (_mode === 'bulk') await initBulk();
      else if (_mode === 'monthly') await initMonthly();
      else if (_mode === 'pending') await initPending();
      else if (_mode === 'corrections' && (isAdmin || isHR)) await initCorrections();
      
      // Load pending badge count asynchronously
      setTimeout(updatePendingBadge, 500);
    } catch (err) {
      console.error('[AttendancePage.init ERROR]', err);
      container().innerHTML = `
        <div class="empty-state" style="padding:40px">
          <div class="empty-icon" style="color:var(--danger)">❌</div>
          <h3 style="color:var(--danger)">Attendance Initialization Failed</h3>
          <p class="text-muted">${err.message}</p>
          <button class="btn btn-primary mt-3" onclick="AttendancePage.init()">🔄 Retry Initialization</button>
        </div>
      `;
    }
  }

  async function updatePendingBadge() {
    const badge = document.getElementById('att-pending-badge');
    if (!badge) return;
    try {
      const res = await API.getPendingPastAttendance(4);
      if (res.success && res.pendingList.length > 0) {
        const totalMissingDates = res.pendingList.length;
        badge.textContent = totalMissingDates;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function initPending() {
    container().innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <h3 class="font-600">Pending Attendance</h3>
          <p class="text-muted text-sm ml-3">Showing missing entries for active staff over the past 4 days.</p>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-secondary btn-sm" onclick="AttendancePage.init()">🔄 Refresh</button>
        </div>
      </div>
      <div id="att-pending-list" class="card" style="padding:0"></div>
    `;
    await loadPending();
  }

  async function loadPending() {
    const listEl = document.getElementById('att-pending-list');
    if (!listEl) return;
    listEl.innerHTML = `<div class="skeleton" style="height:200px"></div>`;
    
    const res = await API.getPendingPastAttendance(4);
    const pendingList = res.pendingList || [];
    
    if (pendingList.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><h3>All Caught Up!</h3><p>No pending attendance found for the past 4 days.</p></div>`;
      return;
    }
    
    listEl.innerHTML = `
      <div style="overflow-x:auto">
        <table class="table">
          <thead><tr>
            <th style="width:150px">Date</th>
            <th>Missing Count</th>
            <th>Employees Pending</th>
            <th style="text-align:right">Action</th>
          </tr></thead>
          <tbody>
            ${pendingList.map(p => `
              <tr>
                <td><span class="font-600">${Helpers.formatDate(p.date)}</span></td>
                <td><span class="badge badge-danger">${p.missingCount} Missing</span></td>
                <td><p class="text-sm text-muted" style="max-width:500px; white-space:normal">${p.employees.map(e => e.name).join(', ')}</p></td>
                <td style="text-align:right">
                  <button class="btn btn-sm btn-primary att-go-date" data-date="${p.date}">Go to Date ➔</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    
    listEl.querySelectorAll('.att-go-date').forEach(btn => {
      btn.addEventListener('click', () => {
        _date = btn.dataset.date;
        _mode = 'bulk';
        init();
      });
    });
  }

  async function initCorrections() {
    container().innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <h3 class="font-600">Attendance Correction Requests</h3>
        </div>
      </div>
      <div id="att-corrections-list" class="card" style="padding:0"></div>
    `;
    await loadCorrections();
  }

  async function loadCorrections() {
    const listEl = document.getElementById('att-corrections-list');
    if (!listEl) return;
    listEl.innerHTML = `<div class="skeleton" style="height:200px"></div>`;
    
    const res = await API.getPendingCorrections();
    const corrections = res.corrections || [];
    
    if (corrections.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><h3>No pending requests</h3><p>All attendance corrections have been resolved.</p></div>`;
      return;
    }
    
    const isAdmin = AppState.get('user')?.role === 'admin';
    
    listEl.innerHTML = `
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>Employee</th>
            <th>Date</th>
            <th>Requested Status</th>
            <th>Reason</th>
            <th>Submitted By</th>
            <th style="text-align:right">${isAdmin ? 'Actions' : 'Status'}</th>
          </tr></thead>
          <tbody>
            ${corrections.map(c => `
              <tr>
                <td><span class="font-600">${Helpers.escapeHtml(c.employee_name)}</span></td>
                <td>${Helpers.formatDate(c.date)}</td>
                <td>${statusBadge(c.requested_status)}</td>
                <td><p class="text-sm text-muted" style="max-width:300px; white-space:normal">${Helpers.escapeHtml(c.reason)}</p></td>
                <td>${Helpers.escapeHtml(c.submitted_by_name)}</td>
                <td style="text-align:right">
                  ${isAdmin ? `
                    <button class="btn btn-sm btn-success att-corr-resolve" data-id="${c.id}" data-action="approve">Approve</button>
                    <button class="btn btn-sm btn-danger att-corr-resolve" data-id="${c.id}" data-action="reject">Reject</button>
                  ` : `
                    <span class="badge badge-warning">Pending Admin Approval</span>
                  `}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    
    listEl.querySelectorAll('.att-corr-resolve').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id);
        const action = btn.dataset.action;
        
        btn.disabled = true;
        const res = await API.resolveCorrection(id, action);
        if (res.success) {
          Toast.success(`Request ${action}d successfully.`);
          EventBus.emit('data:attendance', { action: 'resolve' });
          loadCorrections();
        } else {
          Toast.error(res.error);
          btn.disabled = false;
        }
      });
    });
  }

  function applyRules(empId) {
    const st = _stateMap[empId];
    const r = _records.find(x => x.id === empId);
    const sunday = isSunday(_date);

    if (sunday) {
      if (!st.status || st.status === '') {
         st.status = (r.sat_status === 'A' || r.mon_status === 'A') ? 'A' : 'WO';
      }
    }
    st.overtimeHours = Math.floor(Math.max(0, st.overtimeHours));
    if (st.overtimeHours < 1) st.overtimeHours = 0;
  }

  function checkEditRestriction(dateStr) {
    const user = AppState.get('user');
    const settings = AppState.get('settings') || {};
    
    if (user?.role !== 'hr') return { restricted: false };
    if (settings.hr_edit_past_attendance === '1') return { restricted: false };

    const attDate = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const diffTime = today - attDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > 2) {
      return { restricted: true, reason: `HR cannot edit attendance older than 2 days (${dateStr}).` };
    }
    return { restricted: false };
  }

  async function showCorrectionModal(empId, dateStr, currentData) {
    const empRes = await API.getEmployee(empId);
    const emp = empRes.employee;
    
    Modal.open({
      title: `📝 Attendance Correction Request`,
      size: 'modal-sm',
      body: `
        <div class="alert alert-info mb-3">
          <p class="text-sm">Attendance for <strong>${Helpers.formatDate(dateStr)}</strong> is locked for HR. Please submit a request for Admin approval.</p>
        </div>
        <div class="form-group">
          <label class="form-label">Employee</label>
          <input type="text" class="form-input" value="${emp.name}" disabled />
        </div>
        <div class="form-group">
          <label class="form-label">Requested Status</label>
          <select id="corr-status" class="form-select">
            <option value="P" ${currentData.status === 'P' ? 'selected' : ''}>Present</option>
            <option value="A" ${currentData.status === 'A' ? 'selected' : ''}>Absent</option>
            <option value="H" ${currentData.status === 'H' ? 'selected' : ''}>Half Day</option>
            <option value="WO" ${currentData.status === 'WO' ? 'selected' : ''}>Weekly Off</option>
            <option value="">None (Clear)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Reason for Change</label>
          <textarea id="corr-reason" class="form-input" placeholder="Explain why this edit is needed..." rows="3"></textarea>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="corr-submit-btn">Submit Request</button>
      `
    });

    document.getElementById('corr-submit-btn').addEventListener('click', async () => {
      const status = document.getElementById('corr-status').value;
      const reason = document.getElementById('corr-reason').value.trim();
      
      if (!reason) { Toast.error("Please provide a reason."); return; }
      
      Helpers.setLoading('corr-submit-btn', true);
      const res = await API.submitAttendanceCorrection({
        employeeId: empId,
        date: dateStr,
        requestedStatus: status,
        reason: reason,
        requestedBy: AppState.get('user')?.id
      });
      
      if (res.success) {
        Toast.success("Correction request submitted to Admin.");
        Modal.close();
      } else {
        Toast.error(res.error);
      }
      Helpers.setLoading('corr-submit-btn', false);
    });
  }

  async function autoSaveRow(empId) {
    const st = _stateMap[empId];
    
    const check = checkEditRestriction(_date);
    if (check.restricted) {
      showCorrectionModal(empId, _date, st);
      return;
    }

    try {
      const res = await API.markAttendance({
        employeeId: empId,
        date: _date,
        status: st.status || '', 
        isFinalized: st.isFinalized,
        checkIn: st.checkIn,
        checkOut: st.checkOut,
        overtimeHours: st.overtimeHours,
        isSundayWork: st.isSundayWork,
        projectName: st.projectName,
        projectId: st.projectId,
        markedBy: AppState.get('user')?.id,
        extraShiftType: st.extraShiftType,
        extraIn: st.extraIn,
        extraOut: st.extraOut,
        extraNotes: st.extraNotes
      });
      
      if (!res.success) throw new Error(res.error || 'Database operation failed');

      EventBus.emit('data:attendance', { action: 'mark', employeeId: empId });
      
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

  function renderOT(empId) {
    const st = _stateMap[empId];
    const otEl = document.getElementById(`att-ot-${empId}`);
    if (!otEl) return;
    otEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;gap:4px">
        <button class="btn btn-sm btn-secondary att-ot-minus" data-id="${empId}" style="padding:2px 6px" ${st.isLocked ? 'disabled' : ''}>-</button>
        <span style="font-size:0.9rem;width:30px;text-align:center" class="${st.overtimeHours > 0 ? 'text-accent font-600' : 'text-muted'}">${st.overtimeHours}h</span>
        <button class="btn btn-sm btn-secondary att-ot-plus" data-id="${empId}" style="padding:2px 6px" ${st.isLocked ? 'disabled' : ''}>+</button>
      </div>
    `;
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
          <button id="att-export-daily-pdf" class="btn btn-secondary">
            <span class="btn-text">📄 Daily Manpower PDF</span>
            <span class="btn-loader" hidden></span>
          </button>
          <button id="att-share-whatsapp" class="btn btn-success" style="margin-left:8px">
            <span class="btn-text">💬 Share to WhatsApp</span>
            <span class="btn-loader" hidden></span>
          </button>
          <button id="att-send-all-wa" class="btn btn-success" style="margin-left:8px;background:linear-gradient(135deg,#25D366,#128C7E)">
            <span class="btn-text">📲 Send All WA</span>
          </button>
          <button id="att-export-register-excel-bulk" class="btn btn-primary" style="margin-left:8px">
            <span class="btn-text">📊 Monthly Excel</span>
            <span class="btn-loader" hidden></span>
          </button>
          <button id="att-export-register-pdf-bulk" class="btn btn-secondary" style="margin-left:8px">
            <span class="btn-text">📄 Monthly PDF</span>
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
        <span class="text-sm text-muted">Auto-saves on click:</span>
        <span class="badge badge-success">P = Present</span>
        <span class="badge badge-warning">H = Half Day</span>
        <span class="badge badge-danger">A = Absent</span>
        <span class="badge badge-info">WO = Weekly Off</span>
        <span class="badge badge-muted">— = Not marked</span>
      </div>

      <div id="att-bulk-alert"></div>
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

    document.getElementById('att-export-daily-pdf').addEventListener('click', async () => {
      Helpers.setLoading('att-export-daily-pdf', true);
      try {
        const res = await API.exportDailyManpowerPdf(_date);
        if (res.success) {
          Toast.success('Daily Manpower PDF exported successfully!');
        } else if (res.error !== 'Cancelled.') {
          Toast.error(res.error);
        }
      } catch (err) {
        Toast.error('Export failed: ' + err.message);
      } finally {
        Helpers.setLoading('att-export-daily-pdf', false);
      }
    });

    document.getElementById('att-share-whatsapp').addEventListener('click', async () => {
      Helpers.setLoading('att-share-whatsapp', true);
      try {
        const res = await API.shareDailyManpowerWhatsApp(_date);
        if (res.success) {
          Toast.success('Report image copied to clipboard!');
          
          Modal.open({
            title: '💬 Share Daily Manpower Report',
            size: 'modal-sm',
            body: `
              <div class="alert alert-success mb-4" style="font-size:0.85rem">
                Report image has been <strong>copied to your clipboard</strong>. Choose how you want to open WhatsApp, then paste (<strong>Ctrl + V</strong>) to send.
              </div>
              <div style="display:flex; flex-direction:column; gap:10px;">
                <button class="btn btn-primary" id="share-wa-web" style="width:100%; justify-content:center; background:#25D366; border-color:#25D366; display:flex; align-items:center; gap:8px;">
                  🌐 WhatsApp Web (Browser)
                </button>
                <button class="btn btn-secondary" id="share-wa-desktop" style="width:100%; justify-content:center; display:flex; align-items:center; gap:8px;">
                  💻 WhatsApp Desktop (App)
                </button>
              </div>
            `,
            footer: '<button class="btn btn-ghost" onclick="Modal.close()">Cancel</button>'
          });
          
          document.getElementById('share-wa-web').addEventListener('click', () => {
            window.open('https://web.whatsapp.com/', '_blank');
            Modal.close();
          });
          
          document.getElementById('share-wa-desktop').addEventListener('click', () => {
            window.open('whatsapp://', '_blank');
            Modal.close();
          });
          
        } else if (res.error !== 'Cancelled.') {
          Toast.error(res.error);
        }
      } catch (err) {
        Toast.error('WhatsApp share failed: ' + err.message);
      } finally {
        Helpers.setLoading('att-share-whatsapp', false);
      }
    });

    document.getElementById('att-export-register-excel-bulk').addEventListener('click', () => handleExportRegisterBulk('excel'));
    document.getElementById('att-export-register-pdf-bulk').addEventListener('click',  () => handleExportRegisterBulk('pdf'));

    document.getElementById('att-send-all-wa').addEventListener('click', () => {
      const tbody = document.getElementById('att-bulk-tbody');
      if (!tbody || !tbody.children.length) { Toast.warning('Load attendance first.'); return; }
      const waButtons = Array.from(tbody.querySelectorAll('.att-wa-btn'));
      const valid = waButtons.filter(btn => btn.dataset.phone && btn.dataset.phone.trim());
      if (valid.length === 0) { Toast.warning('No employees with phone numbers found.'); return; }
      if (!confirm(`Open WhatsApp for ${valid.length} employee(s)? Messages will open one by one with a 2-second delay.`)) return;
      valid.forEach((btn, idx) => {
        const empId = parseInt(btn.dataset.id);
        const st = _stateMap[empId];
        const proj = (st && st.projectName) || btn.dataset.project || '—';
        setTimeout(() => sendWhatsAppMessage(btn.dataset.phone, btn.dataset.name, st ? st.status : null, proj, _date), idx * 2000);
      });
    });

    await loadBulk();
    attachBulkListeners();
  }

  async function handleQuickStatus(empId, status) {
    const st = _stateMap[empId];
    if (st.isLocked) { Toast.warning("Row is locked. Please click 🔓 to change."); return; }
    
    st.status = status;
    st.overtimeHours = calcOvertime(st.checkIn, st.checkOut, st.extraIn, st.extraOut);
    applyRules(empId);
    
    if (status === 'A' || status === 'WO') {
      st.isFinalized = 1;
      st.isLocked = true;
    } else {
      st.isFinalized = 0;
      st.isLocked = false;
    }
    
    // Immediate UI feedback
    const row = document.getElementById(`att-row-${empId}`);
    if (row) {
      row.querySelectorAll('.att-quick-btn').forEach(b => {
        b.className = `att-btn att-quick-btn${b.dataset.status === status ? ' ' + status : ''}`;
        b.style.opacity = b.dataset.status === status ? '1' : '0.3';
      });
    }

    await autoSaveRow(empId);
    // REMOVED: st.isLocked = true; (Don't lock immediately, wait for sign-off)
    renderRow(empId); 
  }

  function handleLockToggle(empId) {
    const st = _stateMap[empId];
    const check = checkEditRestriction(_date);
    const isAdmin = AppState.get('user')?.role === 'admin';

    if (st.isLocked) {
      if (check.restricted && !isAdmin) {
        showCorrectionModal(empId, _date, st);
        return;
      }
      st.isLocked = false;
    } else {
      st.isLocked = true;
    }
    renderRow(empId);
  }

  async function handleOTAdjust(empId, delta) {
    const st = _stateMap[empId];
    if (st.isLocked) { Toast.warning("Unlock row first"); return; }
    
    st.overtimeHours = Math.max(0, st.overtimeHours + delta);
    applyRules(empId);
    renderOT(empId);
    await autoSaveRow(empId);
  }

  async function handleMarkAll(btn) {
    const s = btn.dataset.status;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span class="btn-loader" style="width:14px;height:14px"></span> Saving...`;
    btn.disabled = true;

    for (const r of _records) {
      if (_stateMap[r.id].isLocked) continue; 
      _stateMap[r.id].status = s;
      applyRules(r.id);
      
      if (s === 'A' || s === 'WO') {
        _stateMap[r.id].isFinalized = 1;
        _stateMap[r.id].isLocked = true;
      } else {
        _stateMap[r.id].isFinalized = 0;
        _stateMap[r.id].isLocked = false;
      }
      
      await autoSaveRow(r.id);
    }
    
    btn.innerHTML = originalText;
    btn.disabled = false;
    Toast.success('Saved all attendance globally.');
    loadBulk(); 
  }

  async function handleFinalizeRow(empId) {
    const st = _stateMap[empId];
    const btn = document.querySelector(`.att-finalize-row[data-id="${empId}"]`);
    if (btn) btn.disabled = true;

    const res = await API.markAttendance({
      ...st,
      employeeId: empId,
      date: _date,
      isFinalized: 1,
      markedBy: AppState.get('user')?.id
    });
    
    if (res.success) {
      Toast.success('Sign-off completed.');
      st.isFinalized = 1;
      st.isLocked = true;
      renderRow(empId);
    } else {
      Toast.error(res.error);
      if (btn) btn.disabled = false;
    }
  }

  async function handleBulkUnfinalizeToday() {
    if (!confirm('This will unlock all staff for the selected date, allowing you to edit records again. Continue?')) return;
    const btn = document.getElementById('att-bulk-unfinalize-today');
    
    console.log('[AttendancePage] Unlocking all staff for date:', _date);
    Toast.info('Unlocking staff records...');
    
    if (btn) {
      btn.disabled = true;
      const originalText = btn.innerHTML;
      btn.innerHTML = '⌛ Unlocking...';
    }

    try {
      const res = await API.unfinalizeAttendance({ date: _date });
      console.log('[AttendancePage] Unfinalize response:', res);
      
      if (res.success) {
        Toast.success(`Successfully unlocked ${res.updatedCount || ''} staff records.`);
        // Pass true to force all rows to be UNLOCKED in the UI
        await loadBulk(true);
      } else {
        Toast.error(res.error || 'Failed to unlock records.');
      }
    } catch (err) {
      console.error('[AttendancePage] Unlock Error:', err);
      Toast.error('Unlock Failed: ' + (err.message || 'Unknown Error'));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '🔓 Unlock All Staff';
      }
    }
  }

  async function handleBulkFinalizeToday() {
    if (!confirm('This will set default Out-Time (06:00 PM) for all pending staff. Continue?')) return;
    const btn = document.getElementById('att-bulk-finalize-today');
    if (btn) btn.disabled = true;

    const res = await API.finalizeAttendance({
      date: _date,
      finalizedBy: AppState.get('user')?.id
    });
    if (res.success) {
      Toast.success('All staff finalized for today.');
      EventBus.emit('data:attendance', { action: 'finalize', date: _date });
      loadBulk();
    } else {
      Toast.error(res.error);
      if (btn) btn.disabled = false;
    }
  }

  async function handleBulkFinalizeToday() {
    if (!confirm('This will set default Out-Time (06:00 PM) for all pending staff. Continue?')) return;
    const btn = document.getElementById('att-bulk-finalize-today');
    if (btn) btn.disabled = true;

    const res = await API.finalizeAttendance({
      date: _date,
      finalizedBy: AppState.get('user')?.id
    });
    if (res.success) {
      Toast.success('All staff finalized for today.');
      EventBus.emit('data:attendance', { action: 'finalize', date: _date });
      loadBulk();
    } else {
      Toast.error(res.error);
      if (btn) btn.disabled = false;
    }
  }

  function handleProjectSelect(empId, sel) {
    if (sel.value === 'CUSTOM') {
      _stateMap[empId].projectId = null;
      _stateMap[empId].projectName = 'New Site'; 
      _stateMap[empId].isProjectAutoFilled = false;
      renderRow(empId);
      setTimeout(() => {
        const inp = document.querySelector(`.att-project-custom[data-id="${empId}"]`);
        if (inp) { inp.focus(); inp.select(); }
      }, 50);
      return;
    }
    const opt = sel.options[sel.selectedIndex];
    _stateMap[empId].projectId = sel.value ? parseInt(sel.value) : null;
    _stateMap[empId].projectName = opt.dataset.name || '';
    _stateMap[empId].isProjectAutoFilled = false;
    autoSaveRow(empId);
  }

  async function handleRowChange(empId) {
    const st = _stateMap[empId];
    st.overtimeHours = calcOvertime(st.checkIn, st.checkOut, st.extraIn, st.extraOut);
    applyRules(empId);
    renderOT(empId);
    await autoSaveRow(empId);
  }

  function renderRow(empId) {
    const tr = document.getElementById(`att-row-${empId}`);
    if (!tr) return;
    const r = _records.find(x => x.id === empId);
    const st = _stateMap[empId];
    const sunday = isSunday(_date);
    
    tr.className = `${sunday ? 'sunday-row' : ''} ${st.isLocked ? 'att-row-locked' : ''}`;
    
    const totalHrs = calculateTotalHours(empId);
    
    tr.innerHTML = `
      <td>
        <div class="font-600">${Helpers.escapeHtml(r.name)}</div>
        ${r.joining_date ? `<div class="text-xs text-muted">Join: ${Helpers.formatDateShort(r.joining_date)}</div>` : ''}
      </td>
      <td style="min-width:180px">
        <div class="att-project-container" data-id="${r.id}">
          ${st.projectId === null && st.projectName ? `
            <div class="input-suffix-wrap">
              <input type="text" class="form-input att-project-custom ${st.isProjectAutoFilled ? 'project-autofilled' : ''}" data-id="${r.id}" value="${Helpers.escapeHtml(st.projectName)}" placeholder="Enter Site / Location Name" style="padding:4px 30px 4px 8px;font-size:0.85rem" ${st.isLocked ? 'disabled' : ''} />
              <button class="input-suffix-btn att-project-reset" data-id="${r.id}" title="Switch to Registered Projects">✕</button>
            </div>
          ` : `
            <select class="form-select att-project-sel ${st.isProjectAutoFilled ? 'project-autofilled' : ''}" data-id="${r.id}" style="padding:4px;font-size:0.85rem" ${st.isLocked ? 'disabled' : ''}>
              <option value="">-- Select Project --</option>
              ${_projects.map(p => `<option value="${p.id}" data-name="${Helpers.escapeHtml(p.name)}" ${st.projectId === p.id ? 'selected' : ''}>${Helpers.escapeHtml(p.name)}</option>`).join('')}
              <option value="CUSTOM" style="font-weight:600;color:var(--accent)">+ Custom Site / Location</option>
            </select>
          `}
          ${st.isProjectAutoFilled ? `
            <div class="project-autofilled-badge" style="font-size: 10px; color: var(--success); margin-top: 4px; display: flex; align-items: center; gap: 4px; font-weight: 500;">
              <span style="display:inline-block; width:6px; height:6px; background:var(--success); border-radius:50%"></span> Auto-filled
            </div>
          ` : ''}
        </div>
      </td>
      <td style="text-align:center">
        <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
          <div class="flex gap-1">
            <span class="badge badge-success" style="font-size:10px">DAY SHIFT</span>
            ${st.extraShiftType ? `<span class="badge badge-warning" style="font-size:10px">NIGHT SHIFT</span>` : ''}
          </div>
          <div style="display:flex; align-items:center; justify-content:center; gap:6px;">
            ${statusBadge(st.status, st.isFinalized)}
            <button class="btn btn-sm btn-ghost att-lock-toggle ${st.isLocked ? 'is-locked' : 'is-unlocked'}" data-id="${r.id}" title="${st.isLocked ? 'Unlock Row' : 'Lock Row'}" style="padding:0; width:28px; height:28px; display:flex; align-items:center; justify-content:center; border-radius:8px">
              ${st.isLocked ? 
                `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>` : 
                `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`
              }
            </button>
          </div>
        </div>
      </td>
      <td style="text-align:center"><button class="att-btn att-quick-btn ${st.status === 'P' ? 'P' : ''}" data-id="${r.id}" data-status="P" ${st.isLocked ? 'disabled' : ''}>P</button></td>
      <td style="text-align:center"><button class="att-btn att-quick-btn ${st.status === 'A' ? 'A' : ''}" data-id="${r.id}" data-status="A" ${st.isLocked ? 'disabled' : ''}>A</button></td>
      <td style="text-align:center"><button class="att-btn att-quick-btn ${st.status === 'H' ? 'H' : ''}" data-id="${r.id}" data-status="H" ${st.isLocked ? 'disabled' : ''}>H</button></td>
      <td style="text-align:center"><button class="att-btn att-quick-btn ${st.status === 'WO' ? 'WO' : ''}" data-id="${r.id}" data-status="WO" ${st.isLocked ? 'disabled' : ''}>WO</button></td>
      <td style="text-align:center"><input type="time" class="form-input att-time-input" style="padding:4px;font-size:0.8rem;width:80px" id="att-in-${r.id}" value="${st.checkIn}" data-id="${r.id}" data-type="in" ${st.isLocked ? 'disabled' : ''} /></td>
      <td style="text-align:center"><input type="time" class="form-input att-time-input" style="padding:4px;font-size:0.8rem;width:80px" id="att-out-${r.id}" value="${st.checkOut}" data-id="${r.id}" data-type="out" ${st.isLocked ? 'disabled' : ''} /></td>
      <td style="text-align:center">
        <button class="btn btn-sm ${st.extraShiftType ? 'btn-warning' : 'btn-ghost'} att-extra-shift-btn" data-id="${r.id}" style="padding:4px 8px; font-size:0.75rem" ${st.isLocked ? 'disabled' : ''}>
          ${st.extraShiftType ? '🌙 Edit Night' : '+ Night Shift'}
        </button>
      </td>
      <td style="text-align:center">
        <div style="line-height:1.2">
          <div class="font-600 text-sm">${totalHrs}h</div>
          <div id="att-ot-${empId}" style="font-size:0.7rem"></div>
        </div>
      </td>
      ${sunday ? `<td style="text-align:center"><input type="checkbox" class="att-sunday-check" data-id="${r.id}" ${st.isSundayWork ? 'checked' : ''} ${st.isLocked ? 'disabled' : ''} /></td>` : ''}
      <td style="text-align:center">
        ${st.isFinalized ? 
          `<span class="text-success" title="Finalized">✅</span>` : 
          `<button class="btn btn-sm btn-primary att-finalize-row" data-id="${r.id}" ${st.isLocked ? 'disabled' : ''}>Sign-off</button>`
        }
      </td>
      <td style="text-align:center">
        <button class="btn btn-sm att-wa-btn" data-id="${r.id}" data-name="${Helpers.escapeHtml(r.name)}" data-phone="${r.phone || ''}" style="background:#25D366;color:#fff;border:none;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:13px;">📱</button>
      </td>
    `;
    renderOT(empId);
  }

  function attachBulkListeners() {
    const listEl = document.getElementById('att-bulk-list');
    if (!listEl) return;

    listEl.addEventListener('click', async e => {
      const target = e.target;
      
      // Lock Toggle
      if (target.closest('.att-lock-toggle')) {
        handleLockToggle(parseInt(target.closest('.att-lock-toggle').dataset.id));
      }
      // Quick Status
      else if (target.closest('.att-quick-btn')) {
        const btn = target.closest('.att-quick-btn');
        handleQuickStatus(parseInt(btn.dataset.id), btn.dataset.status);
      }
      // OT
      else if (target.closest('.att-ot-minus')) {
        handleOTAdjust(parseInt(target.closest('.att-ot-minus').dataset.id), -1);
      }
      else if (target.closest('.att-ot-plus')) {
        handleOTAdjust(parseInt(target.closest('.att-ot-plus').dataset.id), 1);
      }
      // Finalize Row
      else if (target.closest('.att-finalize-row')) {
        handleFinalizeRow(parseInt(target.closest('.att-finalize-row').dataset.id));
      }
      // Mark All
      else if (target.closest('.att-mark-all')) {
        handleMarkAll(target.closest('.att-mark-all'));
      }
      // Bulk Finalize
      else if (target.closest('#att-bulk-finalize-today')) {
        handleBulkFinalizeToday();
      }
      // Bulk Unfinalize
      else if (target.closest('#att-bulk-unfinalize-today')) {
        handleBulkUnfinalizeToday();
      }
      // WhatsApp
      else if (target.closest('.att-wa-btn')) {
        const btn = target.closest('.att-wa-btn');
        const empId = parseInt(btn.dataset.id);
        const st = _stateMap[empId];
        sendWhatsAppMessage(btn.dataset.phone, btn.dataset.name, st.status, st.projectName, _date);
      }
      // WhatsApp Absent Warning
      else if (target.closest('.att-wa-absent-btn')) {
        const btn = target.closest('.att-wa-absent-btn');
        sendContinuousAbsentWA(btn.dataset.phone, btn.dataset.name);
      }
      // Extra Shift
      else if (target.closest('.att-extra-shift-btn')) {
        handleExtraShift(parseInt(target.closest('.att-extra-shift-btn').dataset.id));
      }
      // Custom Project Reset
      else if (target.classList.contains('att-project-reset')) {
        const empId = parseInt(target.dataset.id);
        _stateMap[empId].projectId = null;
        _stateMap[empId].projectName = '';
        _stateMap[empId].isProjectAutoFilled = false;
        renderRow(empId);
      }
    });

    listEl.addEventListener('change', async e => {
      const empId = parseInt(e.target.dataset.id);
      if (e.target.classList.contains('att-time-input')) {
        if (e.target.dataset.type === 'in') _stateMap[empId].checkIn = e.target.value;
        if (e.target.dataset.type === 'out') _stateMap[empId].checkOut = e.target.value;
        handleRowChange(empId);
      }
      else if (e.target.classList.contains('att-project-sel')) {
        handleProjectSelect(empId, e.target);
      }
      else if (e.target.classList.contains('att-sunday-check')) {
        _stateMap[empId].isSundayWork = e.target.checked;
        handleRowChange(empId);
      }
    });

    listEl.addEventListener('input', e => {
      if (e.target.classList.contains('att-project-custom')) {
        const empId = parseInt(e.target.dataset.id);
        _stateMap[empId].projectName = e.target.value;
        _stateMap[empId].isProjectAutoFilled = false;
        e.target.classList.remove('project-autofilled');
      }
    });

    listEl.addEventListener('focusout', async e => {
      if (e.target.classList.contains('att-project-custom')) {
        const empId = parseInt(e.target.dataset.id);
        if (!_stateMap[empId].projectName.trim()) {
          Toast.warning("Site name cannot be empty.");
          renderRow(empId);
          return;
        }
        _stateMap[empId].isProjectAutoFilled = false;
        await autoSaveRow(empId);
      }
    });
  }


  async function handleExportRegisterBulk(format) {
    const btnId = format === 'excel' ? 'att-export-register-excel-bulk' : 'att-export-register-pdf-bulk';
    Helpers.setLoading(btnId, true);
    try {
      const d = new Date(_date);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      const res = await API.exportAttendanceRegister(m, y, format);
      if (res.success) {
        Toast.success(`${format === 'excel' ? 'Excel' : 'PDF'} Register exported successfully!`);
      } else if (res.error !== 'Cancelled.') {
        Toast.error(res.error);
      }
    } catch (err) {
      Toast.error('Export failed: ' + err.message);
    } finally {
      Helpers.setLoading(btnId, false);
    }
  }

  async function loadBulk(forceUnlockAll = false) {
    const listEl = document.getElementById('att-bulk-list');
    if (!listEl) return;
    listEl.innerHTML = `<div class="skeleton" style="height:200px;border-radius:12px"></div>`;
    
    try {
      // Load projects
      try {
        const projRes = await window.API.getProjects({ status: 'Ongoing' });
        if (projRes.success) _projects = projRes.projects;
      } catch(e) { console.error('Failed to load projects', e); }

      const res = await API.getBulkAttendance(_date);
      if (!res.success) {
        listEl.innerHTML = `<div class="empty-state"><h3>Database Error</h3><p>${res.error}</p></div>`;
        return;
      }
      
      _records = res.records || [];
      const records = _records;
      const sunday = isSunday(_date);

      document.getElementById('att-day-name').textContent = getDayName(_date);
      document.getElementById('att-bulk-count').textContent = `${records.length} employees`;

      // Check yesterday
      const yesterday = new Date(_date);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayIso = Helpers.todayIso(yesterday);
      const pendingRes = await API.checkPendingFinalization({ date: yesterdayIso });
      const alertEl = document.getElementById('att-bulk-alert');
      if (alertEl) {
        if (pendingRes.success && pendingRes.pendingCount > 0) {
          alertEl.innerHTML = `
            <div class="alert alert-warning mb-4 flex justify-between align-center">
              <div><strong>Yesterday Attendance Pending Finalization</strong> (${pendingRes.pendingCount} staff)</div>
              <button class="btn btn-sm btn-primary" id="att-finalize-yesterday">👉 Finalize Yesterday</button>
            </div>
          `;
          document.getElementById('att-finalize-yesterday').addEventListener('click', async () => {
            const r = await API.finalizeAttendance({ date: yesterdayIso, finalizedBy: AppState.get('user')?.id });
            if (r.success) { Toast.success('Finalized!'); loadBulk(); }
          });
        } else { alertEl.innerHTML = ''; }
      }

      if (records.length === 0) {
        listEl.innerHTML = `<div class="empty-state"><h3>No employees for this date</h3></div>`;
        return;
      }

      // Build state map
      const newMap = {};
      records.forEach(r => {
        const existing = _stateMap[r.id];
        let initStatus = r.status || null;
        if (sunday && !r.status) {
           if (r.sat_status === 'A' || r.mon_status === 'A') {
               initStatus = 'A';
           } else if (r.sat_status === 'P' || r.mon_status === 'P' || r.sat_status === 'H' || r.mon_status === 'H') {
               initStatus = 'WO';
           } else {
               initStatus = null;
           }
        }
        let isFinalized = r.is_finalized ?? 0;
        
        if (initStatus === 'A' || initStatus === 'WO') {
           isFinalized = 1;
        }

        newMap[r.id] = {
          status:        initStatus,
          // Only lock if finalized. If pending, keep it editable.
          isLocked:      forceUnlockAll ? false : (isFinalized === 1),
          checkIn:       r.in_time || '09:00',
          checkOut:      r.out_time || '18:00',
          overtimeHours: (r.overtime_hours > 0) ? Math.floor(parseFloat(r.overtime_hours)) : calcOvertime(r.in_time || '09:00', r.out_time || '18:00', r.extra_in, r.extra_out),
          isSundayWork:  r.status ? !!r.is_sunday_work : (sunday ? true : false),
          projectName:   existing && existing.projectId === null && existing.projectName ? existing.projectName : (r.site_name || ''),
          projectId:     existing && existing.projectId === null && existing.projectName ? null : (r.project_id || null),
          isProjectAutoFilled: existing ? existing.isProjectAutoFilled : (r.is_project_auto_filled === 1),
          isFinalized:   isFinalized,
          notes:         r.notes || '',
          extraShiftType: r.extra_shift_type || null,
          extraIn:        r.extra_in || '',
          extraOut:       r.extra_out || '',
          extraNotes:     r.extra_notes || ''
        };
      });
      _stateMap = newMap;

      // Sort records: Present/HalfDay -> Unmarked -> Unmarked (Absent yesterday) -> WO -> Absent
      records.sort((a, b) => {
        const statusA = _stateMap[a.id].status;
        const statusB = _stateMap[b.id].status;

        const getWeight = (status, yesterdayStatus) => {
          if (status === 'P' || status === 'H') return 1;
          if (!status) {
            if (yesterdayStatus === 'A' || yesterdayStatus === 'AUTO ABSENT') return 3;
            return 2;
          }
          if (status === 'WO') return 4;
          if (status === 'A') return 5;
          return 6;
        };

        const wA = getWeight(statusA, a.yesterday_status);
        const wB = getWeight(statusB, b.yesterday_status);

        if (wA !== wB) return wA - wB;
        return a.name.localeCompare(b.name);
      });

      listEl.innerHTML = `
        <div class="card" style="padding:0;overflow:hidden">
          <div style="overflow-x:auto">
            <table>
              <thead><tr>
                <th>Employee</th>
                <th>Project</th>
                <th style="text-align:center">Shift / Status</th>
                <th style="text-align:center">P</th>
                <th style="text-align:center">A</th>
                <th style="text-align:center">H</th>
                <th style="text-align:center">WO</th>
                <th style="text-align:center">In Time</th>
                <th style="text-align:center">Out Time</th>
                <th style="text-align:center">Extra Shift</th>
                <th style="text-align:center;min-width:110px">Total / OT</th>
                ${sunday ? '<th style="text-align:center">Sun 2×</th>' : ''}
                <th style="text-align:center">Action</th>
                <th style="text-align:center;width:60px">WA</th>
              </tr></thead>
              <tbody id="att-bulk-tbody">
                ${records.map(r => `<tr id="att-row-${r.id}" class="${sunday ? 'sunday-row' : ''}"></tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="flex gap-2 mt-4" style="align-items:center">
          <span class="text-sm text-muted">Mark all as:</span>
          <button class="btn btn-sm btn-secondary att-mark-all" data-status="P">✓ All Present</button>
          <button class="btn btn-sm btn-secondary att-mark-all" data-status="A">✕ All Absent</button>
          <button class="btn btn-sm btn-secondary att-mark-all" data-status="WO">ℹ All Weekly Off</button>
          <div style="flex:1"></div>
          ${(AppState.get('user')?.role === 'admin' || AppState.get('user')?.role === 'hr') ? `<button class="btn btn-ghost" id="att-bulk-unfinalize-today" style="border:1px solid var(--danger); color:var(--danger); margin-right:10px">🔓 Unlock All Staff</button>` : ''}
          <button class="btn btn-primary" id="att-bulk-finalize-today" style="background: var(--success)">👉 Finalize All Staff</button>
        </div>
      `;

      // Render each row
      records.forEach(r => renderRow(r.id));

    } catch(err) {
      console.error('[Attendance loadBulk ERROR]', err);
      listEl.innerHTML = `<div class="empty-state"><h3>Render Error</h3><p>${err.message}</p></div>`;
    }
  }


  function statusBadge(status, isFinalized) {
    if (isFinalized) {
      return `<span class="badge badge-success" style="background:var(--success); color:#fff; border:none">🟢 Finalized</span>`;
    }
    if (!status) return `<span class="badge badge-muted">—</span>`;
    
    const map = { P: 'badge-success', A: 'badge-danger', H: 'badge-warning', WO: 'badge-info' };
    const labels = { P: 'Present', A: 'Absent', H: 'Half Day', WO: 'Weekly Off' };
    
    return `
      <div style="display:flex; flex-direction:column; gap:4px; align-items:center">
        <span class="badge ${map[status] || 'badge-muted'}">${labels[status] || status}</span>
        <span class="badge" style="background:var(--warning); color:#fff; border:none; font-size:10px">🟠 Pending Sign-Off</span>
      </div>
    `;
  }

  // ── WhatsApp Deep-Link Helper ────────────────────────────────────────────────
  async function sendWhatsAppMessage(phone, name, status, project, date) {
    if (!phone || !phone.trim()) {
      Toast.error(`No phone number for ${name}. Please update the employee profile.`);
      return;
    }
    if (!status) {
      Toast.error(`Attendance not yet marked for ${name} on ${date}.`);
      return;
    }

    // Sanitise phone: digits only, prefix 91 if 10-digit India number
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) cleaned = '91' + cleaned;

    const statusMap = { P: 'Present', A: 'Absent', H: 'Half Day', WO: 'Weekly Off' };
    const emojiMap = { P: '\u2705', A: '\u274C', H: '\uD83C\uDF13', WO: '\uD83D\uDCA4' };
    const statusLabel = statusMap[status] || status;
    const statusEmoji = emojiMap[status] || '';

    const [y, m, d] = date.split('-');
    const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const formattedDate = `${d}-${MONTHS_SHORT[parseInt(m)-1]}-${y}`;

    // Fetch company name dynamically from settings
    let companyName = 'HR Team';
    try {
      const sr = await API.getSettings();
      if (sr.success && sr.settings && sr.settings.company_name) {
        companyName = sr.settings.company_name;
      }
    } catch(_) {}

    const msg = `Dear ${name},

This is to inform you that your attendance for ${formattedDate} has been recorded as:

${statusEmoji} Status: ${statusLabel}
\uD83D\uDCCD Project: ${project || '-'}

For any discrepancy, please contact the office.

Regards,
${companyName}`;

    const url = `https://wa.me/${cleaned}?text=${encodeURIComponent(msg)}`;

    Toast.success(`Opening WhatsApp for ${name}…`);
    // window.open triggers setWindowOpenHandler in main.js → shell.openExternal → system browser/WhatsApp
    window.open(url, '_blank');
  }

  async function sendContinuousAbsentWA(phone, name) {
    if (!phone) { Toast.error("No phone number for " + name); return; }
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) cleaned = '91' + cleaned;

    const msg = `Hello ${name},

You have been marked absent continuously for 2 days.

Your attendance will continue as Absent until reporting back to duty.

Please contact HR immediately.

— HR Department`;

    const url = `https://wa.me/${cleaned}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }

  /* ── MONTHLY VIEW MODE ───────────────────────────────────────────────────── */
  async function initMonthly() {
    try {
      const projRes = await window.API.getProjects({ status: 'Ongoing' });
      if (projRes.success) _projects = projRes.projects;
    } catch(e) { console.error('Failed to load projects', e); }

    const empRes = await API.getEmployees({ status: 'active' });
    const employees = empRes.employees || [];

    if (!_selEmp && employees.length > 0) _selEmp = employees[0].id;

    const currentEmp = employees.find(e => e.id === _selEmp);
    const initialVal = currentEmp ? `${currentEmp.name} (EMP${currentEmp.id})` : '';

    container().innerHTML = `
      <style>
        .custom-select-container {
          position: relative;
          width: 240px;
          display: inline-block;
        }
        .custom-select-trigger {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 10px;
          cursor: pointer;
          font-size: 0.9rem;
          color: var(--text);
          font-weight: 500;
          transition: border-color 0.2s, box-shadow 0.2s;
          height: 38px;
        }
        .custom-select-trigger:hover {
          border-color: var(--text-muted);
        }
        .custom-select-trigger:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
        }
        .custom-select-arrow {
          font-size: 0.65rem;
          opacity: 0.7;
        }
        .custom-select-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          width: 100%;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          box-shadow: var(--shadow-lg);
          margin-top: 6px;
          z-index: 1000;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .custom-select-search {
          width: 100%;
          padding: 8px 10px;
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          font-size: 0.85rem;
          background: var(--bg-subtle);
          color: var(--text);
        }
        .custom-select-search:focus {
          outline: none;
          border-color: var(--accent);
        }
        .custom-select-options {
          list-style: none;
          padding: 0;
          margin: 0;
          max-height: 200px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .custom-select-option {
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 0.85rem;
          cursor: pointer;
          color: var(--text);
          font-weight: 500;
          text-align: left;
        }
        .custom-select-option:hover, .custom-select-option.selected {
          background: var(--bg-subtle);
          color: var(--accent);
        }
      </style>

      <div class="toolbar">
        <div class="toolbar-left">
          <div class="form-group" style="flex-direction:row;align-items:center;gap:8px;margin:0">
            <label class="form-label" style="margin:0;white-space:nowrap">Employee:</label>
            <div class="custom-select-container" id="att-emp-select-container">
              <button type="button" class="custom-select-trigger" id="att-emp-select-trigger">
                <span class="custom-select-value">${Helpers.escapeHtml(initialVal)}</span>
                <span class="custom-select-arrow">▼</span>
              </button>
              <div class="custom-select-dropdown" id="att-emp-select-dropdown" style="display:none">
                <input type="text" class="custom-select-search" id="att-emp-select-search" placeholder="Search employee..." autocomplete="off" />
                <ul class="custom-select-options" id="att-emp-select-options">
                  ${employees.map(e => `
                    <li class="custom-select-option ${e.id === _selEmp ? 'selected' : ''}" data-value="${e.id}">
                      ${Helpers.escapeHtml(e.name)} (EMP${e.id})
                    </li>
                  `).join('')}
                </ul>
              </div>
            </div>
          </div>
          <div class="month-picker">
            ${Helpers.buildMonthSelect('att-month-sel', _month)}
            ${Helpers.buildYearSelect('att-year-sel', _year)}
          </div>
        </div>
        <div class="toolbar-right">
          <div id="att-summary-chips" class="flex gap-2" style="flex-wrap:wrap"></div>
          <button id="att-export-register-excel" class="btn btn-primary" style="margin-left:auto">
            <span class="btn-text">📊 Excel Register</span>
            <span class="btn-loader" hidden></span>
          </button>
          <button id="att-export-register-pdf" class="btn btn-secondary">
            <span class="btn-text">📄 PDF Register</span>
            <span class="btn-loader" hidden></span>
          </button>
          <button id="att-export-calendar-pdf" class="btn btn-secondary">
            <span class="btn-text">👉 Calendar PDF Report</span>
            <span class="btn-loader" hidden></span>
          </button>
          <button id="att-signoff-month" class="btn btn-success" style="background:var(--success); color:#fff; border:none; margin-left:8px; display:inline-flex; align-items:center; gap:6px;">
            <span class="btn-text">🟢 Sign-off Month</span>
            <span class="btn-loader" hidden></span>
          </button>
        </div>
      </div>
      <div id="att-calendar-container" class="card"></div>
    `;

    const trigger = document.getElementById('att-emp-select-trigger');
    const dropdown = document.getElementById('att-emp-select-dropdown');
    const search = document.getElementById('att-emp-select-search');
    const options = document.querySelectorAll('.custom-select-option');

    // Toggle dropdown
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = dropdown.style.display === 'none';
      dropdown.style.display = isHidden ? 'flex' : 'none';
      if (isHidden) {
        search.value = '';
        filterOptions('');
        search.focus();
      }
    });

    // Close dropdown on clicking outside
    document.addEventListener('click', () => {
      dropdown.style.display = 'none';
    });

    dropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Filter options
    search.addEventListener('input', (e) => {
      filterOptions(e.target.value);
    });

    function filterOptions(q) {
      const query = q.toLowerCase().trim();
      options.forEach(opt => {
        const txt = opt.textContent.toLowerCase();
        opt.style.display = txt.includes(query) ? 'block' : 'none';
      });
    }

    // Select option
    options.forEach(opt => {
      opt.addEventListener('click', () => {
        const id = parseInt(opt.dataset.value);
        _selEmp = id;
        dropdown.style.display = 'none';
        
        // Re-render trigger label
        const emp = employees.find(e => e.id === id);
        trigger.querySelector('.custom-select-value').textContent = `${emp.name} (EMP${emp.id})`;
        
        loadMonthly();
      });
    });

    document.getElementById('att-month-sel').addEventListener('change', e => { _month = parseInt(e.target.value); loadMonthly(); });
    document.getElementById('att-year-sel').addEventListener('change',  e => { _year  = parseInt(e.target.value); loadMonthly(); });

    document.getElementById('att-export-register-excel').addEventListener('click', () => handleExportRegister('excel'));
    document.getElementById('att-export-register-pdf').addEventListener('click', () => handleExportRegister('pdf'));
    document.getElementById('att-export-calendar-pdf').addEventListener('click', handleExportCalendarPdf);
    document.getElementById('att-signoff-month').addEventListener('click', handleSignoffMonth);

    await loadMonthly();
  }

  async function handleExportCalendarPdf() {
    Helpers.setLoading('att-export-calendar-pdf', true);
    try {
      const res = await API.exportCalendarPdf(_selEmp, _month, _year);
      if (res.success) {
        Toast.success('Calendar PDF exported successfully!');
      } else if (res.error !== 'Cancelled.') {
        Toast.error(res.error);
      }
    } catch (err) {
      Toast.error('Export failed: ' + err.message);
    } finally {
      Helpers.setLoading('att-export-calendar-pdf', false);
    }
  }

  async function handleSignoffMonth() {
    if (!_selEmp) { Toast.warning("Please select an employee first."); return; }
    const trigger = document.getElementById('att-emp-select-trigger');
    const valueEl = trigger ? trigger.querySelector('.custom-select-value') : null;
    const empName = valueEl ? valueEl.textContent.split(' (EMP')[0] : 'Selected Employee';
    const monthName = Helpers.monthName(_month);
    
    if (!confirm(`Are you sure you want to sign-off and finalize all marked attendance for ${empName} in ${monthName} ${_year}?`)) {
      return;
    }
    
    Helpers.setLoading('att-signoff-month', true);
    try {
      const res = await API.finalizeAttendance({
        employeeId: _selEmp,
        month: _month,
        year: _year,
        finalizedBy: AppState.get('user')?.id
      });
      if (res.success) {
        Toast.success(`Signed off all records for ${empName} in ${monthName} ${_year}!`);
        await loadMonthly();
      } else {
        Toast.error(res.error || "Failed to sign-off month.");
      }
    } catch (err) {
      console.error(err);
      Toast.error("Sign-off failed: " + err.message);
    } finally {
      Helpers.setLoading('att-signoff-month', false);
    }
  }

  async function handleExportRegister(format) {
    const btnId = format === 'excel' ? 'att-export-register-excel' : 'att-export-register-pdf';
    Helpers.setLoading(btnId, true);
    try {
      const res = await API.exportAttendanceRegister(_month, _year, format);
      if (res.success) {
        Toast.success(`${format === 'excel' ? 'Excel' : 'PDF'} Register exported successfully!`);
      } else if (res.error !== 'Cancelled.') {
        Toast.error(res.error);
      }
    } catch (err) {
      Toast.error('Export failed: ' + err.message);
    } finally {
      Helpers.setLoading(btnId, false);
    }
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
    const todayStr  = Helpers.todayIso();
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
      let status  = rec ? rec.status : null;
      const isSun   = isSunday(dateStr);
      
      if (isSun && !status && dateStr <= todayStr) {
         // Auto-calculate Sunday if missing: if Sat or Mon is Absent, Sun is Absent. 
         // If Sat or Mon is Present/Half Day, Sun is WO. Otherwise, leave it unmarked.
         const prevDate = new Date(dateStr); prevDate.setDate(prevDate.getDate() - 1);
         const nextDate = new Date(dateStr); nextDate.setDate(nextDate.getDate() + 1);
         const satStr = prevDate.toISOString().split('T')[0];
         const monStr = nextDate.toISOString().split('T')[0];
         
         const satStatus = recordMap[satStr] ? recordMap[satStr].status : null;
         const monStatus = recordMap[monStr] ? recordMap[monStr].status : null;
         
         if (satStatus === 'A' || monStatus === 'A') {
            status = 'A';
         } else if (satStatus === 'P' || monStatus === 'P' || satStatus === 'H' || monStatus === 'H') {
            status = 'WO';
         } else {
            status = null;
         }
      }
      
      const hasOT   = rec && rec.overtime_hours > 0;
      const hasSunWork = rec && rec.is_sunday_work;
      const beforeJoin = joiningDate && dateStr < joiningDate;

      if (beforeJoin && !rec) {
        // Gray out dates before joining — no interaction
        calHtml += `
          <div class="att-calendar-cell pre-join-cell">
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:4px;">
              <div class="att-date-label" style="margin:0">${d}</div>
              <div style="width:20px; height:20px;"></div>
            </div>
            <button class="att-btn att-cal-btn disabled-cell" title="Not joined yet" disabled>—</button>
          </div>
        `;
      } else {
        const isPending = rec && !rec.is_finalized;
        calHtml += `
          <div class="att-calendar-cell ${isSun ? 'sunday-cell' : ''} ${isPending ? 'pending-signoff' : ''}">
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:4px;">
              <div class="att-date-label" style="margin:0">
                ${d}${isSun ? ' <span class="text-xs" style="color:var(--warning)">Sun</span>' : ''}
                ${isPending ? ' <span class="pending-dot" title="Pending Sign-Off">●</span>' : ''}
              </div>
              <div style="display:flex; align-items:center; gap:4px;">
                ${isPending ? `
                  <button class="att-cal-quick-signoff-btn" data-date="${dateStr}" title="Quick Sign-off (Finalize Today)">
                    ✓
                  </button>
                ` : ''}
                <button class="att-cal-edit-btn" data-date="${dateStr}" title="Edit Shift & Project Details">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                  </svg>
                </button>
              </div>
            </div>
            <button class="att-btn att-cal-btn ${status || ''}" data-date="${dateStr}" data-status="${status || ''}" title="${dateStr}">
              ${status || '—'}
            </button>
            <div style="display:flex; gap:4px; justify-content:center; flex-wrap:wrap; width:100%; margin-top:2px;">
              ${hasOT ? `<span class="att-cell-badge ot-badge">${rec.overtime_hours}h</span>` : ''}
              ${hasSunWork ? `<span class="att-cell-badge sun-badge">2×</span>` : ''}
            </div>
            ${rec && rec.project_name ? `<div class="att-project-tag" title="${Helpers.escapeHtml(rec.project_name)}">${Helpers.escapeHtml(rec.project_name)}</div>` : ''}
          </div>
        `;
      }
    }
    calHtml += `</div>`;
    calEl.innerHTML = calHtml;

    // Calendar cell click → cycle P → A → H → WO → null (only for active cells)
    calEl.querySelectorAll('.att-cal-btn:not(.disabled-cell)').forEach(btn => {
      btn.addEventListener('click', async () => {
        const dateStr = btn.dataset.date;
        const check = checkEditRestriction(dateStr);
        if (check.restricted) {
          showCorrectionModal(_selEmp, dateStr, { status: btn.dataset.status });
          return;
        }

        const cycle = { '': 'P', 'P': 'A', 'A': 'H', 'H': 'WO', 'WO': '' };
        const next  = cycle[btn.dataset.status || ''];
        btn.dataset.status = next;
        btn.className = `att-btn att-cal-btn ${next}`;
        btn.textContent = next || '—';

        try {
          const dateIsSunday = isSunday(btn.dataset.date);
          const res = await API.markAttendance({
            employeeId:    _selEmp,
            date:          btn.dataset.date,
            status:        next,
            markedBy:      userId,
            isSundayWork:  dateIsSunday ? 1 : 0,
          });
          if (!res.success) throw new Error(res.error || 'Failed to save');

          // Refresh summary
          const sr = await API.getAttendanceSummary(_selEmp, _month, _year);
          const sm = sr.summary || {};
          const chipsEl = document.getElementById('att-summary-chips');
          if (chipsEl) {
            chipsEl.innerHTML = `
              <span class="badge badge-success">✓ ${sm.P} Present</span>
              <span class="badge badge-danger">✕ ${sm.A} Absent</span>
              <span class="badge badge-warning">½ ${sm.H} Half Day</span>
              <span class="badge badge-accent">≈ ${sm.effectiveDays} Effective</span>
              ${sm.totalOvertimeHours > 0 ? `<span class="badge badge-accent">⏱ ${sm.totalOvertimeHours.toFixed(1)}h OT</span>` : ''}
              ${sm.sundayWorkDays > 0 ? `<span class="badge badge-warning">☀ ${sm.sundayWorkDays} Sun</span>` : ''}
            `;
          }
          EventBus.emit('data:refresh');
        } catch (err) {
          Toast.error('Failed to save attendance: ' + err.message);
          console.error(err);
        }
      });
    });

    // Calendar edit button click → open detail edit modal
    calEl.querySelectorAll('.att-cal-edit-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation(); // Prevent triggering cell status cycle click if any overlap occurs
        const dateStr = btn.dataset.date;
        const check = checkEditRestriction(dateStr);
        const rec = recordMap[dateStr] || null;

        if (check.restricted) {
          showCorrectionModal(_selEmp, dateStr, rec || { status: '' });
          return;
        }

        showMonthlyEditModal(_selEmp, dateStr, rec);
      });
    });

    // Calendar quick sign-off button click
    calEl.querySelectorAll('.att-cal-quick-signoff-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation(); // Prevent triggering cell status cycle click
        const dateStr = btn.dataset.date;
        const check = checkEditRestriction(dateStr);
        if (check.restricted) {
          Toast.error("This record is locked. Cannot perform quick sign-off.");
          return;
        }

        const rec = recordMap[dateStr] || null;
        if (!rec || !rec.status) {
          Toast.error("No attendance marked for this day. Cannot sign-off.");
          return;
        }

        try {
          const res = await API.markAttendance({
            ...rec,
            employeeId: _selEmp,
            date: dateStr,
            isFinalized: 1,
            markedBy: AppState.get('user')?.id
          });
          if (res.success) {
            Toast.success(`Signed off: ${Helpers.formatDate(dateStr)}`);
            loadMonthly(); // Refresh monthly calendar view!
          } else {
            Toast.error(res.error || "Failed to sign-off.");
          }
        } catch (err) {
          console.error(err);
          Toast.error("Failed to sign-off: " + err.message);
        }
      });
    });
  }

  async function showMonthlyEditModal(empId, dateStr, rec) {
    const empRes = await API.getEmployee(empId);
    const emp = empRes.employee;

    // Build projects dropdown options
    const projOptions = _projects.map(p => 
      `<option value="${p.id}" data-name="${Helpers.escapeHtml(p.name)}" ${rec && rec.project_id === p.id ? 'selected' : ''}>${Helpers.escapeHtml(p.name)}</option>`
    ).join('');

    const hasCustomSite = rec && rec.project_id === null && rec.project_name;
    const isSundayDate = isSunday(dateStr);

    Modal.open({
      title: `📝 Edit Attendance — ${emp.name}`,
      size: 'modal-md',
      body: `
        <div style="padding:10px">
          <div class="alert alert-info mb-3" style="font-size: 0.85rem; padding: 10px 12px; margin-bottom: 12px;">
             Editing record for date: <strong>${Helpers.formatDate(dateStr)}</strong>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Attendance Status</label>
              <select id="medit-status" class="form-select">
                <option value="P" ${rec && rec.status === 'P' ? 'selected' : ''}>Present</option>
                <option value="A" ${rec && rec.status === 'A' ? 'selected' : ''}>Absent</option>
                <option value="H" ${rec && rec.status === 'H' ? 'selected' : ''}>Half Day</option>
                <option value="WO" ${rec && rec.status === 'WO' ? 'selected' : ''}>Weekly Off</option>
                <option value="" ${!rec || !rec.status ? 'selected' : ''}>None (Unmarked)</option>
              </select>
            </div>
            
            <div class="form-group">
              <label class="form-label">Project / Site</label>
              <select id="medit-project-sel" class="form-select">
                <option value="">-- Select Project --</option>
                ${projOptions}
                <option value="CUSTOM" ${hasCustomSite ? 'selected' : ''} style="font-weight:600;color:var(--accent)">+ Custom Site / Location</option>
              </select>
            </div>
          </div>

          <!-- Custom project input (shown only if CUSTOM is selected) -->
          <div class="form-group mt-3" id="medit-custom-project-group" style="display:${hasCustomSite ? 'block' : 'none'}">
            <label class="form-label">Custom Site / Location Name</label>
            <input type="text" id="medit-custom-project" class="form-input" value="${rec && hasCustomSite ? Helpers.escapeHtml(rec.project_name) : ''}" placeholder="Enter site name..." />
          </div>

          <div class="form-row mt-3">
            <div class="form-group">
              <label class="form-label">In Time</label>
              <input type="time" id="medit-in" class="form-input" value="${rec && rec.in_time ? rec.in_time : '09:00'}" />
            </div>
            <div class="form-group">
              <label class="form-label">Out Time</label>
              <input type="time" id="medit-out" class="form-input" value="${rec && rec.out_time ? rec.out_time : '18:00'}" />
            </div>
          </div>

          <div class="form-group mt-3">
            <label class="form-label flex items-center gap-2" style="cursor:pointer; display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" id="medit-is-finalized" ${rec && rec.is_finalized ? 'checked' : ''} style="width:16px;height:16px" />
              <span>🟢 Sign-off (Finalize Attendance)</span>
            </label>
          </div>

          <div class="form-group mt-4" style="border-top: 1px solid var(--border); padding-top: 15px;">
            <label class="form-label flex items-center gap-2" style="cursor:pointer; display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" id="medit-has-extra" ${rec && rec.extra_shift_type ? 'checked' : ''} style="width:16px;height:16px" />
              <span>🌙 Add Night Shift / Extra Shift</span>
            </label>
          </div>

          <!-- Extra shift inputs (shown only if checkbox is ticked) -->
          <div id="medit-extra-group" style="display:${rec && rec.extra_shift_type ? 'block' : 'none'}; border: 1px dashed var(--border); padding: 12px; border-radius: 8px; margin-top: 10px; background: var(--bg-row-alt)">
            <div class="form-group">
              <label class="form-label">Extra Shift Type</label>
              <select id="medit-extra-type" class="form-select">
                <option value="night" ${rec && rec.extra_shift_type === 'night' ? 'selected' : ''}>Night Shift</option>
                <option value="shutdown" ${rec && rec.extra_shift_type === 'shutdown' ? 'selected' : ''}>Shutdown Work</option>
              </select>
            </div>
            <div class="form-row mt-3">
              <div class="form-group">
                <label class="form-label">Extra In Time</label>
                <input type="time" id="medit-extra-in" class="form-input" value="${rec && rec.extra_in ? rec.extra_in : '20:00'}" />
              </div>
              <div class="form-group">
                <label class="form-label">Extra Out Time</label>
                <input type="time" id="medit-extra-out" class="form-input" value="${rec && rec.extra_out ? rec.extra_out : '02:00'}" />
              </div>
            </div>
            <div class="form-group mt-3">
              <label class="form-label">Extra Shift Notes</label>
              <input type="text" id="medit-extra-notes" class="form-input" value="${rec && rec.extra_notes ? Helpers.escapeHtml(rec.extra_notes) : ''}" placeholder="e.g. Machine Maintenance" />
            </div>
          </div>

          <div class="form-group mt-3">
            <label class="form-label">General Notes</label>
            <input type="text" id="medit-notes" class="form-input" value="${rec && rec.notes ? Helpers.escapeHtml(rec.notes) : ''}" placeholder="e.g. Late due to traffic" />
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="medit-save-btn">Save Changes</button>
      `
    });

    // Handle Custom Project select toggle
    const projSel = document.getElementById('medit-project-sel');
    const customProjGroup = document.getElementById('medit-custom-project-group');
    projSel.addEventListener('change', () => {
      customProjGroup.style.display = (projSel.value === 'CUSTOM') ? 'block' : 'none';
      if (projSel.value === 'CUSTOM') {
        document.getElementById('medit-custom-project').focus();
      }
    });

    // Handle Extra Shift checkbox toggle
    const hasExtraCheck = document.getElementById('medit-has-extra');
    const extraGroup = document.getElementById('medit-extra-group');
    hasExtraCheck.addEventListener('change', () => {
      extraGroup.style.display = hasExtraCheck.checked ? 'block' : 'none';
    });

    // Save Changes
    document.getElementById('medit-save-btn').addEventListener('click', async () => {
      const status = document.getElementById('medit-status').value;
      const projVal = projSel.value;
      
      let projectId = null;
      let projectName = '';
      
      if (projVal === 'CUSTOM') {
        projectName = document.getElementById('medit-custom-project').value.trim();
        if (!projectName) { Toast.error("Please enter a custom site name."); return; }
      } else if (projVal) {
        projectId = parseInt(projVal);
        const opt = projSel.options[projSel.selectedIndex];
        projectName = opt.dataset.name || '';
      }

      const checkIn = document.getElementById('medit-in').value;
      const checkOut = document.getElementById('medit-out').value;
      
      const hasExtra = hasExtraCheck.checked;
      const extraShiftType = hasExtra ? document.getElementById('medit-extra-type').value : null;
      const extraIn = hasExtra ? document.getElementById('medit-extra-in').value : '';
      const extraOut = hasExtra ? document.getElementById('medit-extra-out').value : '';
      const extraNotes = hasExtra ? document.getElementById('medit-extra-notes').value : '';

      const notes = document.getElementById('medit-notes').value.trim();

      // Calculate OT
      const overtimeHours = calcOvertime(checkIn, checkOut, extraIn, extraOut);

      Helpers.setLoading('medit-save-btn', true);
      try {
        const isFinalized = document.getElementById('medit-is-finalized').checked ? 1 : 0;
        const res = await API.markAttendance({
          employeeId: empId,
          date: dateStr,
          status: status,
          checkIn: checkIn,
          checkOut: checkOut,
          overtimeHours: overtimeHours,
          isSundayWork: isSundayDate ? 1 : 0,
          projectName: projectName,
          projectId: projectId,
          markedBy: AppState.get('user')?.id,
          isFinalized: isFinalized,
          extraShiftType: extraShiftType,
          extraIn: extraIn,
          extraOut: extraOut,
          extraNotes: extraNotes,
          notes: notes
        });

        if (res.success) {
          Toast.success("Attendance updated successfully!");
          Modal.close();
          loadMonthly(); // Refresh monthly calendar view!
        } else {
          Toast.error(res.error || "Failed to update attendance.");
        }
      } catch (err) {
        console.error(err);
        Toast.error("Failed to save changes.");
      } finally {
        Helpers.setLoading('medit-save-btn', false);
      }
    });
  }

  return { init };
})();
