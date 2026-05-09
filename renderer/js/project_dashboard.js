/**
 * LocalPayroll — Project Dashboard Module
 */
const ProjectDashboardPage = (() => {
  const container = () => document.getElementById('page-project_dashboard');
  const headerActs = () => document.getElementById('page-header-actions');

  let _projectId = null;
  let _project = null;
  let _siteReports = [];
  let _expenses = [];
  let _attendanceRecords = [];

  async function init(params) {
    if (!params || !params.id) {
      Router.navigate('projects');
      return;
    }
    _projectId = parseInt(params.id);

    headerActs().innerHTML = `
      <button class="btn btn-secondary" id="pd-back-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        <span class="btn-text">Back to Projects</span>
      </button>
      <button class="btn btn-success" id="pd-export-btn" style="margin-left:8px">
        <span class="btn-text">Excel Report</span>
      </button>
      <button class="btn btn-primary" id="pd-add-report-btn" style="margin-left:8px">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        <span class="btn-text">Daily Site Report</span>
      </button>
    `;
    
    document.getElementById('pd-back-btn').addEventListener('click', () => Router.navigate('projects'));
    document.getElementById('pd-add-report-btn').addEventListener('click', openSiteReportForm);
    document.getElementById('pd-export-btn').addEventListener('click', async () => {
      const btn = document.getElementById('pd-export-btn');
      btn.innerHTML = '<span class="btn-loader"></span> Exporting...';
      btn.disabled = true;
      const r = await window.API.exportProjectCostReport(_projectId);
      btn.innerHTML = 'Excel Report';
      btn.disabled = false;
      if (r.success) Toast.success('Report saved!');
      else if (r.error !== 'Cancelled.') Toast.error(r.error);
    });

    await load();
  }

  async function load() {
    try {
      const projRes = await window.API.getProjects({});
      _project = projRes.projects.find(p => p.id === _projectId);
      if (!_project) throw new Error('Project not found');

      // Update Header
      document.getElementById('page-title').textContent = _project.name;
      document.getElementById('page-sub').textContent = _project.site_address || 'Project Dashboard';

      // Load Site Reports
      const srRes = await window.API.getSiteReports({ projectId: _projectId });
      _siteReports = srRes.reports || [];

      // Calculate some pseudo-financials or real ones if available
      // In a real system, you would query labor cost from payments, but for now we aggregate expenses
      const expRes = await window.API.getExpenses({ project: _projectId });
      _expenses = expRes.expenses || [];
      const totalExp = _expenses.reduce((sum, e) => sum + e.amount, 0);

      render(totalExp);
    } catch (err) {
      Toast.error('Failed to load project details: ' + err.message);
    }
  }

  function render(totalExp) {
    container().innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div class="card" style="padding:16px">
          <div class="text-sm text-muted">Total Expense Cost</div>
          <div class="text-2xl font-600 mt-1">${window.API.fmtRupees(totalExp)}</div>
        </div>
        <div class="card" style="padding:16px">
          <div class="text-sm text-muted">Current Stage</div>
          <div class="text-xl font-600 mt-1" style="color:var(--accent)">${Helpers.escapeHtml(_project.current_stage || 'Not Set')}</div>
        </div>
        <div class="card" style="padding:16px">
          <div class="text-sm text-muted">Progress</div>
          <div class="text-xl font-600 mt-1">${_project.progress}%</div>
          <div style="width:100%;height:4px;background:var(--border);border-radius:2px;margin-top:6px;overflow:hidden">
            <div style="width:${_project.progress}%;height:100%;background:var(--success)"></div>
          </div>
        </div>
        <div class="card" style="padding:16px">
          <div class="text-sm text-muted">Status</div>
          <div class="text-xl font-600 mt-1">${statusBadge(_project.status)}</div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Site Reports Column -->
        <div class="lg:col-span-2">
          <div class="card">
            <div class="flex justify-between items-center mb-4">
              <h3 style="margin:0">Daily Site Reports</h3>
            </div>
            
            ${_siteReports.length === 0 ? `
              <div class="empty-state" style="padding:30px 0">
                <p class="text-muted">No site reports submitted yet.</p>
              </div>
            ` : `
              <div class="flex flex-col gap-3">
                ${_siteReports.map(r => `
                  <div style="border:1px solid var(--border);border-radius:8px;padding:12px">
                    <div class="flex justify-between items-start mb-2">
                      <div>
                        <div class="font-600">${Helpers.formatDate(r.date)}</div>
                        <div class="text-xs text-muted">Supervisor: ${Helpers.escapeHtml(r.supervisor_name || _project.supervisor_name || 'N/A')}</div>
                      </div>
                      <div class="flex gap-2">
                        <span class="badge badge-subtle">👷 ${r.manpower_count || 0} Staff</span>
                        <button class="btn btn-sm btn-accent pd-share-btn" 
                          data-id="${r.id}" 
                          data-date="${Helpers.formatDate(r.date)}"
                          data-work="${Helpers.escapeHtml(r.work_done)}"
                          data-staff="${r.manpower_count}"
                          title="Share to WhatsApp">💬 Share</button>
                        <button class="btn btn-sm btn-ghost pd-del-report" data-id="${r.id}" title="Delete">✕</button>
                      </div>
                    </div>
                    <div class="text-sm mt-2">
                      <div class="font-600 mb-1">Work Done:</div>
                      <p style="margin:0;color:var(--text-sec)">${Helpers.escapeHtml(r.work_done || 'None')}</p>
                    </div>
                    ${r.issues ? `
                      <div class="text-sm mt-2">
                        <div class="font-600 mb-1" style="color:var(--danger)">Issues / Delays:</div>
                        <p style="margin:0;color:var(--text-sec)">${Helpers.escapeHtml(r.issues)}</p>
                      </div>
                    ` : ''}
                    ${r.material_used ? `
                      <div class="text-sm mt-2 text-muted">
                        <span class="font-600">Materials:</span> ${Helpers.escapeHtml(r.material_used)}
                      </div>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>

        <!-- Progress Update Column -->
        <div>
          <div class="card" style="position:sticky;top:20px">
            <h3 style="margin:0 0 16px 0">Update Progress</h3>
            <div class="form-group mb-3">
              <label class="form-label">Current Stage</label>
              <input type="text" id="pd-stage" class="form-input" value="${Helpers.escapeHtml(_project.current_stage || '')}" placeholder="e.g. Wiring, Installation" />
            </div>
            <div class="form-group mb-3">
              <label class="form-label">Completion %</label>
              <input type="number" id="pd-progress" class="form-input" value="${_project.progress || 0}" min="0" max="100" />
            </div>
            <div class="form-group mb-3">
              <label class="form-label">Delay Reason (if any)</label>
              <input type="text" id="pd-delay" class="form-input" value="${Helpers.escapeHtml(_project.delay_reason || '')}" />
            </div>
            <div class="form-group mb-4">
              <label class="form-label">Status</label>
              <select id="pd-status" class="form-select">
                <option value="Upcoming" ${_project.status === 'Upcoming' ? 'selected' : ''}>Upcoming</option>
                <option value="Ongoing" ${_project.status === 'Ongoing' ? 'selected' : ''}>Ongoing</option>
                <option value="On Hold" ${_project.status === 'On Hold' ? 'selected' : ''}>On Hold</option>
                <option value="Delayed" ${_project.status === 'Delayed' ? 'selected' : ''}>Delayed</option>
                <option value="Completed" ${_project.status === 'Completed' ? 'selected' : ''}>Completed</option>
              </select>
            </div>
            <button class="btn btn-primary w-full" id="pd-save-progress">Save Updates</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('pd-save-progress').addEventListener('click', async () => {
      const btn = document.getElementById('pd-save-progress');
      btn.innerHTML = '<span class="btn-loader"></span> Saving...';
      btn.disabled = true;

      const data = {
        id: _projectId,
        currentStage: document.getElementById('pd-stage').value,
        progress: parseInt(document.getElementById('pd-progress').value) || 0,
        delayReason: document.getElementById('pd-delay').value,
        status: document.getElementById('pd-status').value
      };

      const r = await window.API.updateProject(data);
      if (r.success) {
        Toast.success('Project progress updated.');
        load();
      } else {
        Toast.error(r.error);
        btn.innerHTML = 'Save Updates';
        btn.disabled = false;
      }
    });

    container().querySelectorAll('.pd-del-report').forEach(btn => {
      btn.addEventListener('click', () => {
        Modal.confirm('Delete this site report?', async () => {
          const id = parseInt(btn.dataset.id);
          const r = await window.API.deleteSiteReport(id);
          if (r.success) { Toast.success('Deleted'); load(); }
          else Toast.error(r.error);
        }, { danger: true });
      });
    });

    container().querySelectorAll('.pd-share-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const msg = encodeURIComponent(
          `*Daily Site Report*\nProject: ${_project.name}\nDate: ${btn.dataset.date}\n\n*Manpower:* ${btn.dataset.staff} Staff\n*Work Done:*\n${btn.dataset.work}`
        );
        window.open(`https://wa.me/?text=${msg}`, '_blank');
      });
    });
  }

  function statusBadge(s) {
    const map = { 'Upcoming': 'badge-info', 'Ongoing': 'badge-success', 'On Hold': 'badge-warning', 'Delayed': 'badge-danger', 'Completed': 'badge-muted' };
    return `<span class="badge ${map[s] || 'badge-muted'}">${s}</span>`;
  }

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
            <input type="text" id="sr-supervisor" class="form-input" value="${Helpers.escapeHtml(_project.supervisor_name || '')}" />
          </div>
        </div>
        <div class="form-row mb-3">
          <div class="form-group">
            <label class="form-label">Manpower Count</label>
            <input type="number" id="sr-manpower" class="form-input" placeholder="0" min="0" />
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
        load();
      } else {
        Toast.error(r.error);
      }
    });
  }

  return { init };
})();
