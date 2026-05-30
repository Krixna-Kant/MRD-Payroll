/**
 * LocalPayroll — Project Dashboard Module (Overhauled)
 * Premium Multi-tab operational ERP interface
 */
const ProjectDashboardPage = (() => {
  const container = () => document.getElementById('page-project_dashboard');
  const headerActs = () => document.getElementById('page-header-actions');

  let _projectId = null;
  let _details = null;
  let _activeTab = 'overview'; // 'overview' | 'manpower' | 'attendance' | 'costing' | 'billing' | 'performance'
  let _selectedDate = Helpers.todayIso();

  async function init(params) {
    if (!params || !params.id) {
      Router.navigate('projects');
      return;
    }
    _projectId = parseInt(params.id);
    _activeTab = 'overview';
    _selectedDate = Helpers.todayIso();

    await load();
  }

  async function load() {
    try {
      const res = await window.API.getProjectDashboardDetails({
        projectId: _projectId,
        date: _selectedDate
      });

      if (!res.success) throw new Error(res.error);
      _details = res.details;

      // Update Header title & subtitle
      const p = _details.project;
      document.getElementById('page-title').textContent = p.name;
      document.getElementById('page-sub').textContent = p.site_address || 'Project Dashboard';

      renderHeaderActions();
      render();
    } catch (err) {
      console.error('[ProjectDashboard] Load failed:', err);
      Toast.error('Failed to load project dashboard: ' + err.message);
    }
  }

  function renderHeaderActions() {
    const isAdmin = AppState.get('user')?.role === 'admin';
    headerActs().innerHTML = `
      <div class="flex items-center gap-2">
        <button class="btn btn-secondary" id="pd-back-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back
        </button>
        ${_activeTab === 'overview' ? `
          <button class="btn btn-primary" id="pd-add-report-btn">
            + Daily Site Report
          </button>
        ` : ''}
        ${_activeTab === 'billing' && isAdmin ? `
          <button class="btn btn-primary" id="pd-create-invoice-btn">
            + New Invoice
          </button>
        ` : ''}
        ${_activeTab === 'manpower' ? `
          <button class="btn btn-primary" id="pd-deploy-staff-btn">
            Deploy Staff
          </button>
        ` : ''}
        ${isAdmin ? `
          <button class="btn btn-success" id="pd-export-btn">
            Excel Report
          </button>
        ` : ''}
      </div>
    `;

    document.getElementById('pd-back-btn').addEventListener('click', () => Router.navigate('projects'));
    
    const exportBtn = document.getElementById('pd-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        exportBtn.innerHTML = '<span class="btn-loader"></span> Exporting...';
        exportBtn.disabled = true;
        const r = await window.API.exportProjectCostReport(_projectId);
        exportBtn.innerHTML = 'Excel Report';
        exportBtn.disabled = false;
        if (r.success) Toast.success('Report saved successfully!');
        else if (r.error !== 'Cancelled.') Toast.error(r.error);
      });
    }

    const reportBtn = document.getElementById('pd-add-report-btn');
    if (reportBtn) reportBtn.addEventListener('click', openSiteReportForm);

    const invoiceBtn = document.getElementById('pd-create-invoice-btn');
    if (invoiceBtn) invoiceBtn.addEventListener('click', openInvoiceForm);

    const deployBtn = document.getElementById('pd-deploy-staff-btn');
    if (deployBtn) deployBtn.addEventListener('click', openDeployStaffModal);
  }

  function render() {
    const p = _details.project;
    const colorTagMap = {
      Red: '#ef4444', Orange: '#f97316', Yellow: '#eab308',
      Green: '#22c55e', Blue: '#3b82f6', Purple: '#a855f7', Teal: '#14b8a6'
    };
    const tagColor = colorTagMap[p.color_tag] || 'var(--accent)';

    container().innerHTML = `
      <style>
        .pd-tabs-nav {
          display: flex;
          border-bottom: 2px solid var(--border);
          margin-bottom: 20px;
          gap: 16px;
          overflow-x: auto;
        }
        .pd-tab-link {
          padding: 10px 16px;
          font-weight: 600;
          color: var(--text-muted);
          border-bottom: 3px solid transparent;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s ease;
        }
        .pd-tab-link:hover {
          color: var(--text);
        }
        .pd-tab-link.active {
          color: ${tagColor};
          border-bottom-color: ${tagColor};
        }
        .kpi-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
          margin-bottom: 20px;
        }
        .pd-card {
          background: var(--bg-card);
          border: 1.5px solid var(--border);
          border-radius: 12px;
          padding: 20px;
          position: relative;
          overflow: hidden;
        }
        .pd-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; width: 4px; height: 100%;
          background: ${tagColor};
        }
        .kpi-title {
          font-size: 0.85rem;
          color: var(--text-muted);
          font-weight: 700;
          text-transform: uppercase;
        }
        .kpi-val {
          font-size: 1.8rem;
          font-weight: 800;
          margin-top: 8px;
          color: var(--text);
        }
        .kpi-sub {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: 4px;
        }
      </style>

      <div class="pd-tabs-nav">
        <div class="pd-tab-link ${_activeTab === 'overview' ? 'active' : ''}" data-tab="overview">Overview & Site Logs</div>
        <div class="pd-tab-link ${_activeTab === 'manpower' ? 'active' : ''}" data-tab="manpower">Manpower Deployment</div>
        <div class="pd-tab-link ${_activeTab === 'attendance' ? 'active' : ''}" data-tab="attendance">Attendance Integration</div>
        <div class="pd-tab-link ${_activeTab === 'costing' ? 'active' : ''}" data-tab="costing">Payroll Costing</div>
        <div class="pd-tab-link ${_activeTab === 'billing' ? 'active' : ''}" data-tab="billing">Client Billing</div>
        <div class="pd-tab-link ${_activeTab === 'performance' ? 'active' : ''}" data-tab="performance">Performance & Profits</div>
      </div>

      <div class="pd-tab-content">
        ${renderActiveTab()}
      </div>
    `;

    // Bind tab clicks
    container().querySelectorAll('.pd-tab-link').forEach(link => {
      link.addEventListener('click', () => {
        _activeTab = link.dataset.tab;
        renderHeaderActions();
        render();
      });
    });

    attachTabEvents();
  }

  function renderActiveTab() {
    switch (_activeTab) {
      case 'overview':
        return renderOverviewTab();
      case 'manpower':
        return renderManpowerTab();
      case 'attendance':
        return renderAttendanceTab();
      case 'costing':
        return renderCostingTab();
      case 'billing':
        return renderBillingTab();
      case 'performance':
        return renderPerformanceTab();
      default:
        return 'Overview Tab';
    }
  }

  // ── OVERVIEW TAB ───────────────────────────────────────────────────────────
  function renderOverviewTab() {
    const p = _details.project;
    const statusMap = { Upcoming: 'badge-info', Ongoing: 'badge-success', Completed: 'badge-muted', 'On Hold': 'badge-warning', Delayed: 'badge-danger' };
    
    return `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 flex flex-col gap-6">
          <!-- Stats Summary -->
          <div class="kpi-row" style="margin-bottom:0">
            <div class="pd-card">
              <div class="kpi-title">Current Stage</div>
              <div class="kpi-val" style="font-size:1.4rem; color:var(--accent)">${Helpers.escapeHtml(p.current_stage || 'Not Set')}</div>
            </div>
            <div class="pd-card">
              <div class="kpi-title">Project Progress</div>
              <div class="kpi-val">${p.progress || 0}%</div>
              <div style="width:100%;height:6px;background:var(--border);border-radius:3px;margin-top:10px;overflow:hidden">
                <div style="width:${p.progress || 0}%;height:100%;background:var(--success)"></div>
              </div>
            </div>
            <div class="pd-card">
              <div class="kpi-title">Project Status</div>
              <div class="kpi-val" style="font-size:1.4rem"><span class="badge ${statusMap[p.status] || 'badge-muted'}">${p.status || 'Upcoming'}</span></div>
            </div>
          </div>

          <!-- Daily logs -->
          <div class="card p-5">
            <h3 style="margin-top:0; margin-bottom:16px;">Daily Site Progress Logs</h3>
            ${_details.attendanceHistory.length === 0 && _details.attendanceToday.length === 0 ? `
              <div class="empty-state" style="padding: 24px;">
                <p class="text-muted">No attendance logs or report entries yet.</p>
              </div>
            ` : `
              <div class="flex flex-col gap-3">
                ${_details.attendanceHistory.slice(0, 10).map(r => `
                  <div style="border: 1px solid var(--border); border-radius: 8px; padding: 12px; background: var(--bg-input);">
                    <div class="flex justify-between items-start">
                      <div>
                        <div class="font-600">${Helpers.formatDate(r.date)}</div>
                        <div class="text-xs text-muted">Staff: ${Helpers.escapeHtml(r.employee_name)} (${Helpers.escapeHtml(r.employee_role)})</div>
                      </div>
                      <div>
                        <span class="badge ${r.status === 'P' ? 'badge-success' : 'badge-danger'}">${r.status === 'P' ? 'Present' : 'Absent'}</span>
                        ${r.overtime_hours > 0 ? `<span class="badge badge-warning">${r.overtime_hours} hrs OT</span>` : ''}
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>

        <!-- Sidebar project metadata metadata -->
        <div>
          <div class="card p-5">
            <h3 style="margin-top:0; margin-bottom:16px;">Project Details</h3>
            <div style="display:flex; flex-direction:column; gap:12px; font-size:0.9rem;">
              <div><span class="text-muted">Project Code:</span> <strong>${Helpers.escapeHtml(p.code || 'N/A')}</strong></div>
              <div><span class="text-muted">Project Type:</span> <strong>${Helpers.escapeHtml(p.project_type || 'General')}</strong></div>
              <div><span class="text-muted">Supervisor:</span> <strong>${Helpers.escapeHtml(p.supervisor_name || 'N/A')}</strong></div>
              <div><span class="text-muted">Billing Cycle:</span> <strong>${Helpers.escapeHtml(p.billing_cycle || 'N/A')}</strong></div>
              <div><span class="text-muted">Client Contact:</span> <strong>${Helpers.escapeHtml(p.contact_number || p.client_phone || 'N/A')}</strong></div>
              <div><span class="text-muted">Client Email:</span> <strong>${Helpers.escapeHtml(p.client_email || 'N/A')}</strong></div>
              <div><span class="text-muted">Start Date:</span> <strong>${Helpers.formatDate(p.start_date)}</strong></div>
              <div><span class="text-muted">Expected End Date:</span> <strong>${Helpers.formatDate(p.end_date)}</strong></div>
              <div style="border-top:1px solid var(--border); padding-top:12px; margin-top:8px;">
                <span class="text-muted">Site Location:</span>
                <p style="margin:4px 0 0 0; font-weight:600; line-height:1.4">${Helpers.escapeHtml(p.site_address || 'N/A')}</p>
              </div>
            </div>
          </div>
          
          <div class="card p-5 mt-4">
            <h3 style="margin-top:0; margin-bottom:16px;">Update Progress</h3>
            <div class="form-group mb-3">
              <label class="form-label">Current Stage</label>
              <input type="text" id="pd-stage" class="form-input" value="${Helpers.escapeHtml(p.current_stage || '')}" placeholder="e.g. Wiring, Installation" />
            </div>
            <div class="form-group mb-3">
              <label class="form-label">Completion %</label>
              <input type="number" id="pd-progress" class="form-input" value="${p.progress || 0}" min="0" max="100" />
            </div>
            <div class="form-group mb-3">
              <label class="form-label">Delay Reason (if any)</label>
              <input type="text" id="pd-delay" class="form-input" value="${Helpers.escapeHtml(p.delay_reason || '')}" />
            </div>
            <div class="form-group mb-4">
              <label class="form-label">Status</label>
              <select id="pd-status" class="form-select">
                <option value="Upcoming" ${p.status === 'Upcoming' ? 'selected' : ''}>Upcoming</option>
                <option value="Ongoing" ${p.status === 'Ongoing' ? 'selected' : ''}>Ongoing</option>
                <option value="On Hold" ${p.status === 'On Hold' ? 'selected' : ''}>On Hold</option>
                <option value="Delayed" ${p.status === 'Delayed' ? 'selected' : ''}>Delayed</option>
                <option value="Completed" ${p.status === 'Completed' ? 'selected' : ''}>Completed</option>
              </select>
            </div>
            <button class="btn btn-primary w-full" id="pd-save-progress">Save Updates</button>
          </div>
        </div>
      </div>
    `;
  }

  // ── MANPOWER TAB ───────────────────────────────────────────────────────────
  function renderManpowerTab() {
    const p = _details.project;
    const totalStaff = _details.deployedStaff.length;
    const presentToday = _details.attendanceToday.filter(a => a.status === 'P' || a.status === 'H').length;
    const nightShift = _details.attendanceToday.filter(a => a.extra_shift_type === 'night').length;
    const shortage = Math.max(0, (p.required_manpower || 0) - presentToday);

    return `
      <div class="kpi-row">
        <div class="pd-card">
          <div class="kpi-title">Total Deployed Staff</div>
          <div class="kpi-val">${totalStaff}</div>
          <div class="kpi-sub">Assigned to this project</div>
        </div>
        <div class="pd-card">
          <div class="kpi-title">Present Today</div>
          <div class="kpi-val" style="color:var(--success)">${presentToday}</div>
          <div class="kpi-sub">On duty today</div>
        </div>
        <div class="pd-card">
          <div class="kpi-title">Night Shift Today</div>
          <div class="kpi-val" style="color:var(--warning)">${nightShift}</div>
          <div class="kpi-sub">Scheduled for night shift</div>
        </div>
        <div class="pd-card">
          <div class="kpi-title">Manpower Shortage</div>
          <div class="kpi-val" style="color:${shortage > 0 ? 'var(--danger)' : 'var(--text-sec)'}">${shortage}</div>
          <div class="kpi-sub">Required count: ${p.required_manpower || 0}</div>
        </div>
      </div>

      <div class="card p-5">
        <div class="flex justify-between items-center mb-4">
          <h3 style="margin:0">Manpower Roster (${totalStaff} Deployed)</h3>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Staff Name</th>
                <th>Role</th>
                <th>Phone Number</th>
                <th style="text-align:right">Daily Salary Rate (Est)</th>
                <th style="text-align:center">Action</th>
              </tr>
            </thead>
            <tbody>
              ${_details.deployedStaff.length === 0 ? `
                <tr><td colspan="5" class="text-center p-4">No staff deployed to this site yet. Click "Deploy Staff" to assign workers.</td></tr>
              ` : _details.deployedStaff.map(emp => `
                <tr>
                  <td class="font-600">${Helpers.escapeHtml(emp.name)}</td>
                  <td><span class="badge" style="background:var(--bg-subtle); color:var(--text-sec); border:1.5px solid var(--border); font-size:11px;">${Helpers.escapeHtml(emp.role || 'Laborer')}</span></td>
                  <td>${Helpers.escapeHtml(emp.phone || '—')}</td>
                  <td style="text-align:right">${API.fmtRupees(emp.salary / 26)} / day</td>
                  <td style="text-align:center">
                    <button class="btn btn-sm btn-secondary pd-transfer-btn" data-id="${emp.id}" data-name="${Helpers.escapeHtml(emp.name)}">Transfer</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ── ATTENDANCE TAB ─────────────────────────────────────────────────────────
  function renderAttendanceTab() {
    const presentToday = _details.attendanceToday.filter(a => a.status === 'P' || a.status === 'H').length;
    const absentToday = _details.attendanceToday.filter(a => a.status === 'A').length;

    return `
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
        <div class="card p-4">
          <div class="text-xs text-muted">Attendance Date</div>
          <div class="flex gap-2 items-center mt-2">
            <input type="date" id="att-date-picker" class="form-input" style="padding:4px 8px; margin-bottom:0; font-size:0.9rem;" value="${_selectedDate}" />
          </div>
        </div>
        <div class="card p-4">
          <div class="text-xs text-muted">Present Today</div>
          <div class="text-2xl font-800 text-success mt-1">${presentToday}</div>
        </div>
        <div class="card p-4">
          <div class="text-xs text-muted">Absent Today</div>
          <div class="text-2xl font-800 text-danger mt-1">${absentToday}</div>
        </div>
        <div class="card p-4">
          <div class="text-xs text-muted">Pending Attendance</div>
          <div class="text-2xl font-800 text-warning mt-1">${Math.max(0, _details.deployedStaff.length - _details.attendanceToday.length)}</div>
        </div>
      </div>

      <div class="card p-5">
        <div class="flex justify-between items-center mb-4">
          <h3 style="margin:0">Mark Attendance (${Helpers.formatDate(_selectedDate)})</h3>
          <button class="btn btn-secondary btn-sm" id="pd-lock-att-btn">🔒 Mark All Present</button>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Staff Name</th>
                <th>Status</th>
                <th>In Time</th>
                <th>Out Time</th>
                <th>OT Hours</th>
                <th>Shift Type</th>
                <th style="text-align:center">Quick Actions</th>
              </tr>
            </thead>
            <tbody>
              ${_details.deployedStaff.length === 0 ? `
                <tr><td colspan="7" class="text-center p-4">No staff deployed. Deploy workers first in the "Manpower Deployment" tab.</td></tr>
              ` : _details.deployedStaff.map(emp => {
                const att = _details.attendanceToday.find(a => a.employee_id === emp.id) || {};
                const status = att.status || '—';
                const ot = att.overtime_hours || 0;
                
                let badgeClass = 'badge-muted';
                if (status === 'P') badgeClass = 'badge-success';
                else if (status === 'A') badgeClass = 'badge-danger';
                else if (status === 'H') badgeClass = 'badge-warning';

                return `
                  <tr>
                    <td class="font-600">${Helpers.escapeHtml(emp.name)}</td>
                    <td><span class="badge ${badgeClass}">${status === 'P' ? 'Present' : (status === 'A' ? 'Absent' : (status === 'H' ? 'Half Day' : status))}</span></td>
                    <td>${att.in_time || '—'}</td>
                    <td>${att.out_time || '—'}</td>
                    <td>${ot > 0 ? `${ot} hrs` : '—'}</td>
                    <td><span class="badge badge-subtle">${Helpers.escapeHtml(att.extra_shift_type || 'Day Shift')}</span></td>
                    <td style="text-align:center">
                      <div class="flex gap-1 justify-center">
                        <button class="btn btn-sm btn-success pd-mark-p" data-id="${emp.id}">P</button>
                        <button class="btn btn-sm btn-danger pd-mark-a" data-id="${emp.id}">A</button>
                        <button class="btn btn-sm btn-secondary pd-mark-h" data-id="${emp.id}">H</button>
                        <button class="btn btn-sm btn-accent pd-mark-ot" data-id="${emp.id}" data-ot="${ot}">OT</button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ── COSTING TAB ────────────────────────────────────────────────────────────
  function renderCostingTab() {
    const c = _details.costs;
    const totalCost = c.labor + c.ot + c.food + c.travel + c.otherExpenses + c.rent + c.electricity + (c.roomFoodLedger || 0);

    return `
      <div class="kpi-row">
        <div class="pd-card">
          <div class="kpi-title">Total Project Cost</div>
          <div class="kpi-val">${API.fmtRupees(totalCost)}</div>
          <div class="kpi-sub">Total operational expenses incurred</div>
        </div>
        <div class="pd-card">
          <div class="kpi-title">Labour Wages</div>
          <div class="kpi-val">${API.fmtRupees(c.labor)}</div>
          <div class="kpi-sub">Regular working shift salary</div>
        </div>
        <div class="pd-card">
          <div class="kpi-title">Overtime (OT) Cost</div>
          <div class="kpi-val">${API.fmtRupees(c.ot)}</div>
          <div class="kpi-sub">Calculated hourly OT wages</div>
        </div>
        <div class="pd-card">
          <div class="kpi-title">Accommodation & Utilities</div>
          <div class="kpi-val">${API.fmtRupees(c.rent + c.electricity + (c.roomFoodLedger || 0))}</div>
          <div class="kpi-sub">Room rents + submeter electricity + room food</div>
        </div>
      </div>

      <div class="card p-5">
        <h3 style="margin-top:0; margin-bottom:16px;">Operational Cost Breakdown</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cost Type</th>
                <th>Category</th>
                <th style="text-align:right">Total Amount</th>
                <th>Percentage</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="font-600">Base Salary Cost</td>
                <td class="text-muted">Labor Wages</td>
                <td style="text-align:right" class="amount">${API.fmtRupees(c.labor)}</td>
                <td class="text-sm font-600">${totalCost > 0 ? Math.round((c.labor / totalCost) * 100) : 0}%</td>
              </tr>
              <tr>
                <td class="font-600">Overtime Pay Cost</td>
                <td class="text-muted">OT Wages</td>
                <td style="text-align:right" class="amount">${API.fmtRupees(c.ot)}</td>
                <td class="text-sm font-600">${totalCost > 0 ? Math.round((c.ot / totalCost) * 100) : 0}%</td>
              </tr>
              <tr>
                <td class="font-600">Food Allowances</td>
                <td class="text-muted">Expenses</td>
                <td style="text-align:right" class="amount">${API.fmtRupees(c.food)}</td>
                <td class="text-sm font-600">${totalCost > 0 ? Math.round((c.food / totalCost) * 100) : 0}%</td>
              </tr>
              <tr>
                <td class="font-600">Travel Allowances</td>
                <td class="text-muted">Expenses</td>
                <td style="text-align:right" class="amount">${API.fmtRupees(c.travel)}</td>
                <td class="text-sm font-600">${totalCost > 0 ? Math.round((c.travel / totalCost) * 100) : 0}%</td>
              </tr>
              <tr>
                <td class="font-600">Site Material / Misc</td>
                <td class="text-muted">Expenses</td>
                <td style="text-align:right" class="amount">${API.fmtRupees(c.otherExpenses)}</td>
                <td class="text-sm font-600">${totalCost > 0 ? Math.round((c.otherExpenses / totalCost) * 100) : 0}%</td>
              </tr>
              <tr>
                <td class="font-600">Landlord Room Rents</td>
                <td class="text-muted">Accommodation</td>
                <td style="text-align:right" class="amount">${API.fmtRupees(c.rent)}</td>
                <td class="text-sm font-600">${totalCost > 0 ? Math.round((c.rent / totalCost) * 100) : 0}%</td>
              </tr>
              <tr>
                <td class="font-600">Electricity Submeter Payouts</td>
                <td class="text-muted">Utilities</td>
                <td style="text-align:right" class="amount">${API.fmtRupees(c.electricity)}</td>
                <td class="text-sm font-600">${totalCost > 0 ? Math.round((c.electricity / totalCost) * 100) : 0}%</td>
              </tr>
              <tr>
                <td class="font-600">Room Food Expenses (Ledger)</td>
                <td class="text-muted">Food Ledger</td>
                <td style="text-align:right" class="amount">${API.fmtRupees(c.roomFoodLedger || 0)}</td>
                <td class="text-sm font-600">${totalCost > 0 ? Math.round(((c.roomFoodLedger || 0) / totalCost) * 100) : 0}%</td>
              </tr>
              <tr style="border-top:2px solid var(--border); background:var(--bg-subtle)">
                <td colspan="2" class="font-700">Total Sum</td>
                <td style="text-align:right" class="amount font-700">${API.fmtRupees(totalCost)}</td>
                <td class="font-700">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ── CLIENT BILLING TAB ─────────────────────────────────────────────────────
  function renderBillingTab() {
    const today = new Date().toISOString().split('T')[0];
    const invoices = _details.invoices;

    const pendingBilling = invoices.filter(i => i.payment_status === 'Pending' || i.payment_status === 'Partially Paid').reduce((s, i) => s + (i.amount + i.gst_amount - i.paid_amount), 0);
    const overdueBilling = invoices.filter(i => (i.payment_status === 'Pending' || i.payment_status === 'Partially Paid') && i.due_date < today).reduce((s, i) => s + (i.amount + i.gst_amount - i.paid_amount), 0);

    const thisMonthPrefix = new Date().toISOString().slice(0, 7);
    const paidThisMonth = invoices.filter(i => i.payment_status === 'Paid' && i.updated_at && new Date(i.updated_at * 1000).toISOString().slice(0, 7) === thisMonthPrefix).reduce((s, i) => s + i.paid_amount, 0);

    const formatPriceLakhs = (val) => {
      const rs = val / 100;
      if (rs >= 100000) return `₹${(rs / 100000).toFixed(1)}L`;
      if (rs >= 1000) return `₹${(rs / 1000).toFixed(1)}k`;
      return `₹${rs.toLocaleString('en-IN')}`;
    };

    return `
      <div class="kpi-row">
        <div class="pd-card">
          <div class="kpi-title">Pending Billing</div>
          <div class="kpi-val" style="color:var(--warning)">${formatPriceLakhs(pendingBilling)}</div>
          <div class="kpi-sub">Total due from client</div>
        </div>
        <div class="pd-card">
          <div class="kpi-title">Overdue Billing</div>
          <div class="kpi-val" style="color:var(--danger)">${formatPriceLakhs(overdueBilling)}</div>
          <div class="kpi-sub">Due date has passed</div>
        </div>
        <div class="pd-card">
          <div class="kpi-title">Paid This Month</div>
          <div class="kpi-val" style="color:var(--success)">${formatPriceLakhs(paidThisMonth)}</div>
          <div class="kpi-sub">Collections in current month</div>
        </div>
      </div>

      <div class="card p-5">
        <h3 style="margin-top:0; margin-bottom:16px;">RA Bills / Client Invoices</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice Number</th>
                <th>Invoice Date</th>
                <th>Due Date</th>
                <th style="text-align:right">Base Amount</th>
                <th style="text-align:right">GST Amount</th>
                <th style="text-align:right">Retention</th>
                <th>Status</th>
                <th style="text-align:right">Paid Amount</th>
                <th style="text-align:center">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${invoices.length === 0 ? `
                <tr><td colspan="9" class="text-center p-4">No bills or invoices logged for this project yet.</td></tr>
              ` : invoices.map(i => {
                const totalInvoice = i.amount + i.gst_amount;
                const outstanding = totalInvoice - i.paid_amount;
                
                let badgeClass = 'badge-muted';
                if (i.payment_status === 'Paid') badgeClass = 'badge-success';
                else if (i.payment_status === 'Pending') badgeClass = 'badge-warning';
                else if (i.payment_status === 'Overdue' || (i.due_date < today && i.payment_status !== 'Paid')) badgeClass = 'badge-danger';

                return `
                  <tr>
                    <td class="font-600">${Helpers.escapeHtml(i.invoice_number)}</td>
                    <td>${Helpers.formatDate(i.invoice_date)}</td>
                    <td>
                      ${Helpers.formatDate(i.due_date)}
                      ${i.due_date < today && i.payment_status !== 'Paid' ? '<span style="color:var(--danger); font-size:10px; font-weight:700; display:block;">OVERDUE</span>' : ''}
                    </td>
                    <td style="text-align:right" class="amount">${API.fmtRupees(i.amount)}</td>
                    <td style="text-align:right" class="amount">${API.fmtRupees(i.gst_amount)}</td>
                    <td style="text-align:right" class="amount">${API.fmtRupees(i.retention_amount)}</td>
                    <td><span class="badge ${badgeClass}">${i.due_date < today && i.payment_status !== 'Paid' ? 'Overdue' : i.payment_status}</span></td>
                    <td style="text-align:right" class="amount font-700 text-success">${API.fmtRupees(i.paid_amount)}</td>
                    <td style="text-align:center">
                      <div class="flex gap-1 justify-center">
                        <button class="btn btn-sm btn-success pd-pay-invoice" data-id="${i.id}" data-total="${totalInvoice}" data-paid="${i.paid_amount}">Receive</button>
                        <button class="btn btn-sm btn-ghost pd-del-invoice" data-id="${i.id}">✕</button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ── PERFORMANCE & PROFITABILITY TAB ────────────────────────────────────────
  function renderPerformanceTab() {
    const p = _details.project;
    const totalStaff = _details.deployedStaff.length;
    const presentToday = _details.attendanceToday.filter(a => a.status === 'P' || a.status === 'H').length;
    const attPct = totalStaff > 0 ? Math.round((presentToday / totalStaff) * 100) : 0;

    const totalOTHours = _details.attendanceToday.reduce((sum, a) => sum + (a.overtime_hours || 0), 0);
    const otUsage = totalOTHours > 20 ? 'High' : (totalOTHours > 5 ? 'Medium' : 'Low');

    const delayRisk = p.status === 'Delayed' ? 'High' : (p.progress < 50 && p.status === 'On Hold' ? 'Medium' : 'Low');

    // Profitability calculations
    const clientBillingSum = _details.invoices.reduce((sum, i) => sum + i.amount + i.gst_amount, 0);
    const totalRev = (p.revenue || 0) + clientBillingSum;

    const c = _details.costs;
    const totalCost = c.labor + c.ot + c.food + c.travel + c.otherExpenses + c.rent + c.electricity + (c.roomFoodLedger || 0);

    const netProfit = totalRev - totalCost;
    const profitMargin = totalRev > 0 ? Math.round((netProfit / totalRev) * 100) : 0;

    const formatPriceLakhs = (val) => {
      const rs = Math.abs(val) / 100;
      const prefix = val < 0 ? '-' : '';
      if (rs >= 100000) return `${prefix}₹${(rs / 100000).toFixed(1)}L`;
      if (rs >= 1000) return `${prefix}₹${(rs / 1000).toFixed(1)}k`;
      return `${prefix}₹${rs.toLocaleString('en-IN')}`;
    };

    return `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Operational Performance -->
        <div class="lg:col-span-2 flex flex-col gap-6">
          <div class="card p-5">
            <h3 style="margin-top:0; margin-bottom:16px;">Operational Performance KPIs</h3>
            
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Current Value</th>
                    <th>Evaluation Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="font-600">Daily Attendance Rate</td>
                    <td class="font-700">${attPct}%</td>
                    <td><span class="badge ${attPct >= 90 ? 'badge-success' : (attPct >= 75 ? 'badge-warning' : 'badge-danger')}">${attPct >= 90 ? 'Excellent' : (attPct >= 75 ? 'Satisfactory' : 'Critical Shortage')}</span></td>
                  </tr>
                  <tr>
                    <td class="font-600">Daily OT Dependency</td>
                    <td class="font-700">${totalOTHours} Hours Total</td>
                    <td><span class="badge ${otUsage === 'Low' ? 'badge-success' : (otUsage === 'Medium' ? 'badge-warning' : 'badge-danger')}">${otUsage} Dependency</span></td>
                  </tr>
                  <tr>
                    <td class="font-600">Delay & Milestone Risk</td>
                    <td class="font-700">${Helpers.escapeHtml(p.delay_reason || 'No Delay Recorded')}</td>
                    <td><span class="badge ${delayRisk === 'Low' ? 'badge-success' : (delayRisk === 'Medium' ? 'badge-warning' : 'badge-danger')}">${delayRisk} Risk</span></td>
                  </tr>
                  <tr>
                    <td class="font-600">Supervisor Efficiency</td>
                    <td class="font-700">${Helpers.escapeHtml(p.supervisor_name || 'N/A')}</td>
                    <td><span class="badge badge-success">Active Deployment</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Alert boxes -->
          <div class="flex flex-col gap-3">
            ${netProfit < 0 ? `
              <div style="background:var(--danger-faint); border:1px solid var(--danger); border-radius:8px; padding:16px; display:flex; align-items:center; gap:12px;">
                <div style="font-size:24px;">🚨</div>
                <div>
                  <div class="font-700 text-danger" style="font-size:0.95rem">Loss-Making Project Alert</div>
                  <div class="text-xs text-muted" style="margin-top:2px;">Operational costs (${API.fmtRupees(totalCost)}) exceed logged billing/contract revenue (${API.fmtRupees(totalRev)}). Review billing terms immediately.</div>
                </div>
              </div>
            ` : ''}
            ${attPct < 80 ? `
              <div style="background:var(--danger-faint); border:1px solid var(--danger); border-radius:8px; padding:16px; display:flex; align-items:center; gap:12px;">
                <div style="font-size:24px;">⚠️</div>
                <div>
                  <div class="font-700 text-danger" style="font-size:0.95rem">High Absenteeism Detected</div>
                  <div class="text-xs text-muted" style="margin-top:2px;">Attendance rate is below 80% today. Ensure backup manpower is deployed to avoid milestone delays.</div>
                </div>
              </div>
            ` : ''}
            ${otUsage === 'High' ? `
              <div style="background:var(--warning-faint); border:1px solid var(--warning); border-radius:8px; padding:16px; display:flex; align-items:center; gap:12px;">
                <div style="font-size:24px;">🕒</div>
                <div>
                  <div class="font-700 text-warning" style="font-size:0.95rem">High Overtime Dependency</div>
                  <div class="text-xs text-muted" style="margin-top:2px;">Wages are heavily inflated due to high OT dependency (${totalOTHours} hrs today). Evaluate shifts schedule.</div>
                </div>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Profitability Dashboard Widget -->
        <div>
          <div class="card p-5" style="border-top:4px solid ${netProfit >= 0 ? 'var(--success)' : 'var(--danger)'};">
            <h3 style="margin-top:0; margin-bottom:16px;">Project Profitability</h3>
            
            <div style="display:flex; flex-direction:column; gap:16px;">
              <div>
                <div class="text-xs text-muted font-700 uppercase">Project Revenue</div>
                <div class="text-2xl font-800" style="color:var(--accent);">${formatPriceLakhs(totalRev)}</div>
                <div class="text-xs text-muted mt-1">Contract value + Billing invoices</div>
              </div>
              
              <div>
                <div class="text-xs text-muted font-700 uppercase">Project Cost</div>
                <div class="text-2xl font-800" style="color:var(--text);">${formatPriceLakhs(totalCost)}</div>
                <div class="text-xs text-muted mt-1">Regular wage + OT + Room + Expense</div>
              </div>
              
              <div style="border-top:1px dashed var(--border); padding-top:16px;">
                <div class="text-xs text-muted font-700 uppercase">Net Profit</div>
                <div class="text-3xl font-800" style="color:${netProfit >= 0 ? 'var(--success)' : 'var(--danger)'};">${formatPriceLakhs(netProfit)}</div>
                <div class="text-xs text-muted mt-1">Current profit margin: <strong>${profitMargin}%</strong></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ── INTERACTIVE EVENT BINDINGS FOR TABS ───────────────────────────────────
  function attachTabEvents() {
    // Stage updates handler
    const saveProgressBtn = document.getElementById('pd-save-progress');
    if (saveProgressBtn) {
      saveProgressBtn.addEventListener('click', async () => {
        saveProgressBtn.innerHTML = '<span class="btn-loader"></span> Saving...';
        saveProgressBtn.disabled = true;

        const data = {
          id: _projectId,
          currentStage: document.getElementById('pd-stage').value,
          progress: parseInt(document.getElementById('pd-progress').value) || 0,
          delayReason: document.getElementById('pd-delay').value,
          status: document.getElementById('pd-status').value
        };

        const r = await window.API.updateProject(data);
        if (r.success) {
          Toast.success('Project details updated.');
          await load();
        } else {
          Toast.error(r.error);
          saveProgressBtn.innerHTML = 'Save Updates';
          saveProgressBtn.disabled = false;
        }
      });
    }

    // Manpower transfer click
    container().querySelectorAll('.pd-transfer-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openTransferManpowerModal(parseInt(btn.dataset.id), btn.dataset.name);
      });
    });

    // Date picker attendance
    const datePicker = document.getElementById('att-date-picker');
    if (datePicker) {
      datePicker.addEventListener('change', async (e) => {
        _selectedDate = e.target.value;
        await load();
      });
    }

    // Attendance locking/marking all present
    const lockBtn = document.getElementById('pd-lock-att-btn');
    if (lockBtn) {
      lockBtn.addEventListener('click', () => {
        Modal.confirm(`Mark all deployed staff members Present for ${Helpers.formatDate(_selectedDate)}?`, async () => {
          const promises = _details.deployedStaff.map(emp => {
            return window.API.markAttendance({
              employeeId: emp.id,
              date: _selectedDate,
              status: 'P',
              projectId: _projectId
            });
          });
          await Promise.all(promises);
          Toast.success('Marked all as Present.');
          await load();
        });
      });
    }

    // Mark individual attendance status
    container().querySelectorAll('.pd-mark-p, .pd-mark-a, .pd-mark-h').forEach(btn => {
      btn.addEventListener('click', async () => {
        const empId = parseInt(btn.dataset.id);
        const status = btn.classList.contains('pd-mark-p') ? 'P' : (btn.classList.contains('pd-mark-a') ? 'A' : 'H');
        const res = await window.API.markAttendance({
          employeeId: empId,
          date: _selectedDate,
          status: status,
          projectId: _projectId
        });
        if (res.success) {
          Toast.success('Attendance status recorded.');
          await load();
        } else Toast.error(res.error);
      });
    });

    // Overtime setting action
    container().querySelectorAll('.pd-mark-ot').forEach(btn => {
      btn.addEventListener('click', () => {
        const empId = parseInt(btn.dataset.id);
        const currentOt = parseFloat(btn.dataset.ot || 0);
        Modal.open({
          title: 'Mark Overtime Hours',
          size: 'modal-sm',
          body: `
            <div class="form-group mb-3">
              <label class="form-label">OT Hours today</label>
              <input type="number" id="ot-hours-input" class="form-input" min="0" max="16" value="${currentOt}" />
            </div>
            <div class="form-group mb-3">
              <label class="form-label">Shift Type</label>
              <select id="ot-shift-type" class="form-select">
                <option value="">Standard Day Shift</option>
                <option value="night">Night Shift</option>
                <option value="shutdown">Shutdown Shift</option>
              </select>
            </div>
          `,
          footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" id="ot-save-btn">Save OT</button>`
        });

        document.getElementById('ot-save-btn').addEventListener('click', async () => {
          const otHours = parseFloat(document.getElementById('ot-hours-input').value) || 0;
          const shiftType = document.getElementById('ot-shift-type').value;

          const res = await window.API.markAttendance({
            employeeId: empId,
            date: _selectedDate,
            status: 'P', // Mark Present automatically if doing OT
            projectId: _projectId,
            overtime_hours: otHours,
            extra_shift_type: shiftType || null
          });

          if (res.success) {
            Toast.success('Overtime logged successfully.');
            Modal.close();
            await load();
          } else Toast.error(res.error);
        });
      });
    });

    // Billing payment reception modal
    container().querySelectorAll('.pd-pay-invoice').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        const total = parseFloat(btn.dataset.total) / 100;
        const currentPaid = parseFloat(btn.dataset.paid) / 100;
        const pending = total - currentPaid;

        Modal.open({
          title: 'Receive Client Payment',
          size: 'modal-sm',
          body: `
            <div class="alert alert-info mb-3">Pending Amount: <strong>₹${pending.toLocaleString('en-IN')}</strong></div>
            <div class="form-group mb-3">
              <label class="form-label">Received Amount (₹)</label>
              <input type="number" id="collection-amt" class="form-input" value="${pending}" placeholder="0.00" />
            </div>
          `,
          footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-success" id="receive-payment-btn">Record Payment</button>`
        });

        document.getElementById('receive-payment-btn').addEventListener('click', async () => {
          const enteredRs = parseFloat(document.getElementById('collection-amt').value) || 0;
          const totalPaidPaisa = Math.round((currentPaid + enteredRs) * 100);
          
          let paymentStatus = 'Partially Paid';
          if (totalPaidPaisa >= Math.round(total * 100)) {
            paymentStatus = 'Paid';
          }

          const res = await window.API.updateInvoice({
            id,
            paidAmount: totalPaidPaisa,
            paymentStatus
          });

          if (res.success) {
            Toast.success('Payment recorded.');
            Modal.close();
            await load();
          } else Toast.error(res.error);
        });
      });
    });

    // Delete Invoice action
    container().querySelectorAll('.pd-del-invoice').forEach(btn => {
      btn.addEventListener('click', () => {
        Modal.confirm('Delete this invoice permanently?', async () => {
          const id = parseInt(btn.dataset.id);
          const res = await window.API.deleteInvoice(id);
          if (res.success) { Toast.success('Deleted invoice.'); await load(); }
          else Toast.error(res.error);
        }, { danger: true });
      });
    });
  }

  // ── MODAL: DEPLOY STAFF ───────────────────────────────────────────────────
  function openDeployStaffModal() {
    const list = _details.availableStaff;
    if (list.length === 0) {
      Modal.open({
        title: 'Deploy Staff',
        body: `<p class="text-muted p-4 text-center">All active workers are currently deployed to projects.</p>`,
        footer: `<button class="btn btn-secondary" onclick="Modal.close()">Close</button>`
      });
      return;
    }

    Modal.open({
      title: 'Deploy Staff to Project',
      size: 'modal-md',
      body: `
        <p class="text-sm text-muted mb-3">Select the active staff members you wish to deploy to this project site.</p>
        <div class="form-group" style="max-height: 250px; overflow-y: auto; border: 1px solid var(--border); border-radius:8px; padding:10px;">
          ${list.map(emp => `
            <div style="display:flex; align-items:center; gap:10px; padding:8px; border-bottom:1px solid var(--border)">
              <input type="checkbox" class="deploy-emp-check" value="${emp.id}" id="deploy-check-${emp.id}" style="width:16px; height:16px;" />
              <label for="deploy-check-${emp.id}" style="cursor:pointer; flex:1">
                <span class="font-600">${Helpers.escapeHtml(emp.name)}</span>
                <span class="text-xs text-muted">(${Helpers.escapeHtml(emp.role || 'Staff')})</span>
              </label>
            </div>
          `).join('')}
        </div>
      `,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" id="deploy-submit-btn">Deploy Selected</button>`
    });

    document.getElementById('deploy-submit-btn').addEventListener('click', async () => {
      const selectedIds = Array.from(document.querySelectorAll('.deploy-emp-check:checked')).map(cb => parseInt(cb.value));
      if (selectedIds.length === 0) return Toast.error('No employee selected.');

      Helpers.setLoading('deploy-submit-btn', true);
      const res = await window.API.transferManpower({
        employeeIds: selectedIds,
        targetProjectId: _projectId,
        operatorId: AppState.get('user')?.id
      });
      Helpers.setLoading('deploy-submit-btn', false);

      if (res.success) {
        Toast.success('Staff deployed.');
        Modal.close();
        await load();
      } else Toast.error(res.error);
    });
  }

  // ── MODAL: TRANSFER STAFF ──────────────────────────────────────────────────
  async function openTransferManpowerModal(empId, empName) {
    const projRes = await window.API.getProjects({ simple: true, excludeInternal: true });
    const otherProjects = (projRes.projects || []).filter(p => p.id !== _projectId);

    if (otherProjects.length === 0) {
      Modal.open({
        title: 'Transfer Manpower',
        body: `<p class="text-muted p-4 text-center">No other ongoing or upcoming projects are currently registered.</p>`,
        footer: `<button class="btn btn-secondary" onclick="Modal.close()">Close</button>`
      });
      return;
    }

    Modal.open({
      title: 'Transfer Manpower',
      size: 'modal-sm',
      body: `
        <p class="text-sm text-muted mb-3">Select the target project site to transfer <strong>${empName}</strong> to, or choose 'Unassign' to remove them from all projects.</p>
        <div class="form-group">
          <label class="form-label">Target Project / Site</label>
          <select id="transfer-target-select" class="form-select">
            <option value="">Unassign / Remove from roster</option>
            ${otherProjects.map(p => `<option value="${p.id}">${Helpers.escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
      `,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" id="transfer-submit-btn">Transfer Worker</button>`
    });

    document.getElementById('transfer-submit-btn').addEventListener('click', async () => {
      const targetProjId = document.getElementById('transfer-target-select').value;

      Helpers.setLoading('transfer-submit-btn', true);
      const res = await window.API.transferManpower({
        employeeIds: [empId],
        targetProjectId: targetProjId || null,
        operatorId: AppState.get('user')?.id
      });
      Helpers.setLoading('transfer-submit-btn', false);

      if (res.success) {
        Toast.success('Employee transferred.');
        Modal.close();
        await load();
      } else Toast.error(res.error);
    });
  }

  // ── MODAL: INVOICE FORM ────────────────────────────────────────────────────
  function openInvoiceForm() {
    Modal.open({
      title: 'New Client Invoice / RA Bill',
      size: 'modal-md',
      body: `
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Invoice / Bill Number *</label>
            <input type="text" id="inv-no" class="form-input" placeholder="e.g. RA-BILL-01" />
          </div>
          <div class="form-group">
            <label class="form-label">Payment Status</label>
            <select id="inv-status" class="form-select">
              <option value="Pending">Pending</option>
              <option value="Paid">Paid</option>
              <option value="Partially Paid">Partially Paid</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Invoice Date *</label>
            <input type="date" id="inv-date" class="form-input" value="${Helpers.todayIso()}" />
          </div>
          <div class="form-group">
            <label class="form-label">Due Date *</label>
            <input type="date" id="inv-due" class="form-input" value="${Helpers.todayIso()}" />
          </div>
          <div class="form-group">
            <label class="form-label">Invoice Amount (₹) *</label>
            <input type="number" id="inv-amount" class="form-input" placeholder="0.00" />
          </div>
          <div class="form-group">
            <label class="form-label">GST Tax Amount (₹)</label>
            <input type="number" id="inv-gst" class="form-input" placeholder="0.00" />
          </div>
          <div class="form-group">
            <label class="form-label">Retention Amount Deducted (₹)</label>
            <input type="number" id="inv-retention" class="form-input" placeholder="0.00" value="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Amount Paid / Received (₹)</label>
            <input type="number" id="inv-paid" class="form-input" placeholder="0.00" value="0" />
          </div>
        </div>
      `,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" id="inv-save-btn">Log Invoice</button>`
    });

    document.getElementById('inv-save-btn').addEventListener('click', async () => {
      const invoiceNumber = document.getElementById('inv-no').value.trim();
      const invoiceDate = document.getElementById('inv-date').value;
      const dueDate = document.getElementById('inv-due').value;
      const amount = parseFloat(document.getElementById('inv-amount').value) || 0;

      if (!invoiceNumber || !invoiceDate || !dueDate || amount <= 0) {
        return Toast.error('Please fill all required fields correctly.');
      }

      Helpers.setLoading('inv-save-btn', true);
      const res = await window.API.createInvoice({
        projectId: _projectId,
        invoiceNumber,
        invoiceDate,
        dueDate,
        amount,
        gstAmount: parseFloat(document.getElementById('inv-gst').value) || 0,
        retentionAmount: parseFloat(document.getElementById('inv-retention').value) || 0,
        paymentStatus: document.getElementById('inv-status').value,
        paidAmount: parseFloat(document.getElementById('inv-paid').value) || 0
      });
      Helpers.setLoading('inv-save-btn', false);

      if (res.success) {
        Toast.success('RA Bill created successfully.');
        Modal.close();
        await load();
      } else Toast.error(res.error);
    });
  }

  // ── MODAL: DAILY SITE PROGRESS LOG FORM ───────────────────────────────────
  function openSiteReportForm() {
    Modal.open({
      title: 'Submit Daily Site Report',
      size: 'modal-md',
      body: `
        <div class="form-row mb-3">
          <div class="form-group">
            <label class="form-label">Date</label>
            <input type="date" id="sr-date" class="form-input" value="${Helpers.todayIso()}" />
          </div>
          <div class="form-group">
            <label class="form-label">Supervisor</label>
            <input type="text" id="sr-supervisor" class="form-input" value="${Helpers.escapeHtml(_details.project.supervisor_name || '')}" />
          </div>
        </div>
        <div class="form-row mb-3">
          <div class="form-group">
            <label class="form-label">Manpower Count</label>
            <input type="number" id="sr-manpower" class="form-input" placeholder="0" min="0" value="${_details.deployedStaff.length}" />
          </div>
          <div class="form-group">
            <label class="form-label">OT Details</label>
            <input type="text" id="sr-ot" class="form-input" placeholder="e.g. 3 staff did 2 hours" />
          </div>
        </div>
        <div class="form-group mb-3">
          <label class="form-label">Work Done Today *</label>
          <textarea id="sr-work" class="form-input" rows="3" placeholder="Describe progress..."></textarea>
        </div>
        <div class="form-group mb-3">
          <label class="form-label">Materials Used</label>
          <input type="text" id="sr-material" class="form-input" placeholder="e.g. 50 bags cement" />
        </div>
        <div class="form-group mb-3">
          <label class="form-label">Issues / Delays</label>
          <input type="text" id="sr-issues" class="form-input" placeholder="Any blockages?" />
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="sr-save">Submit Report</button>
      `
    });

    document.getElementById('sr-save').addEventListener('click', async () => {
      const date = document.getElementById('sr-date').value;
      const workDone = document.getElementById('sr-work').value;

      if (!date || !workDone.trim()) {
        return Toast.error('Date and Work Done are required.');
      }

      const data = {
        projectId: _projectId,
        date,
        supervisorName: document.getElementById('sr-supervisor').value,
        manpowerCount: parseInt(document.getElementById('sr-manpower').value) || 0,
        otDetails: document.getElementById('sr-ot').value,
        workDone,
        materialUsed: document.getElementById('sr-material').value,
        issues: document.getElementById('sr-issues').value
      };

      Helpers.setLoading('sr-save', true);
      const r = await window.API.createSiteReport(data);
      Helpers.setLoading('sr-save', false);

      if (r.success) {
        Toast.success('Site Report added.');
        Modal.close();
        await load();
      } else {
        Toast.error(r.error);
      }
    });
  }

  return { init };
})();

window.ProjectDashboardPage = ProjectDashboardPage;
