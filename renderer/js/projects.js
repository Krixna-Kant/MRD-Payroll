/**
 * LocalPayroll — Projects Page (Overhauled)
 * Premium card-based grid layout with live operational stats.
 * Integrates data from Attendance, Expenses, and Site Reports.
 */

const ProjectsPage = (() => {
  const container  = () => document.getElementById('page-projects');
  const headerActs = () => document.getElementById('page-header-actions');

  let _projects = [];
  let _filterStatus = '';

  /**
   * Initialize the page
   */
  async function init(params = {}) {
    _filterStatus = params.status || '';
    renderSkeleton();
    await load();
  }

  /**
   * Fetch data from backend
   */
  async function load() {
    try {
      headerActs().innerHTML = `
        <button class="btn btn-primary" id="proj-add-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Project
        </button>
      `;
      document.getElementById('proj-add-btn').addEventListener('click', () => openForm());

      const res = await window.API.getProjects({ status: _filterStatus, excludeInternal: true });
      if (!res.success) throw new Error(res.error);

      _projects = res.projects || [];
      const totalCount = res.totalCount || 0;

      // Special Case: Auto-sync from Settings if Projects table is empty
      if (totalCount === 0 && !_filterStatus) {
        await attemptAutoSync();
      }

      render(totalCount);
    } catch (err) {
      console.error('[ProjectsPage] Load failed:', err);
      container().innerHTML = `
        <div class="empty-state">
          <div class="empty-icon" style="color:var(--danger)">✕</div>
          <h3>Failed to load projects</h3>
          <p>${err.message}</p>
          <button class="btn btn-secondary mt-3" onclick="ProjectsPage.load()">Retry Connection</button>
        </div>
      `;
    }
  }

  /**
   * Attempt to import projects from the old settings list if table is empty
   */
  async function attemptAutoSync() {
    console.log('[Projects] Table empty, checking Settings for auto-sync...');
    const sRes = await window.API.getSettings();
    if (sRes.success && sRes.settings?.projects_list) {
      try {
        const pNames = JSON.parse(sRes.settings.projects_list);
        if (pNames.length > 0) {
          Toast.info(`Found ${pNames.length} projects in Settings. Syncing...`);
          for (const name of pNames) {
            await window.API.createProject({ 
              name, 
              status: 'Ongoing',
              notes: 'Auto-synced from Settings list'
            });
          }
          // Reload after sync
          const res = await window.API.getProjects({ status: _filterStatus, excludeInternal: true });
          if (res.success) _projects = res.projects;
        }
      } catch(e) { console.warn('Auto-sync failed', e); }
    }
  }

  function renderSkeleton() {
    container().innerHTML = `
      <div class="toolbar">
        <div class="skeleton" style="width:150px;height:36px"></div>
        <div class="skeleton" style="width:120px;height:24px;margin-left:auto"></div>
      </div>
      <div class="grid-3 mt-4">
        ${Array(6).fill('<div class="skeleton" style="height:180px;border-radius:12px"></div>').join('')}
      </div>
    `;
  }

  function render(totalCount) {
    container().innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <select id="proj-filter-status" class="form-select" style="width:160px">
            <option value="" ${_filterStatus === '' ? 'selected' : ''}>All Statuses</option>
            <option value="Ongoing" ${_filterStatus === 'Ongoing' ? 'selected' : ''}>Ongoing</option>
            <option value="Upcoming" ${_filterStatus === 'Upcoming' ? 'selected' : ''}>Upcoming</option>
            <option value="Completed" ${_filterStatus === 'Completed' ? 'selected' : ''}>Completed</option>
            <option value="On Hold" ${_filterStatus === 'On Hold' ? 'selected' : ''}>On Hold</option>
          </select>
        </div>
        <div class="toolbar-right">
          <span class="text-muted text-sm" id="proj_count">Total Projects: <strong>${totalCount}</strong></span>
        </div>
      </div>

      ${_projects.length === 0 ? `
        <div class="empty-state" id="empty_proj">
          <div class="empty-icon">📁</div>
          <h3>No projects found</h3>
          <p>Create a new project to start tracking site progress and costs.</p>
          <button class="btn btn-primary mt-3" onclick="document.getElementById('proj-add-btn').click()">+ Create First Project</button>
        </div>
      ` : `
        <div class="grid-3 mt-4">
          ${_projects.map(p => renderProjectCard(p)).join('')}
        </div>
      `}
    `;

    // Filter change
    document.getElementById('proj-filter-status').addEventListener('change', e => {
      _filterStatus = e.target.value;
      load();
    });

    // Card Clicks
    container().querySelectorAll('.project-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.card-actions')) return; // Ignore action menu clicks
        Router.navigate('project_dashboard', { id: parseInt(card.dataset.id) });
      });
    });

    // Edit/Delete button bindings
    container().querySelectorAll('.proj-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(btn.dataset.id);
        const p = _projects.find(x => x.id === id);
        openForm(p);
      });
    });

    container().querySelectorAll('.proj-del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        const name = btn.dataset.name;
        Modal.confirm(`Are you sure you want to delete project <strong>${Helpers.escapeHtml(name)}</strong>? This action cannot be undone.`, async () => {
          const res = await window.API.deleteProject({ id, operatorId: AppState.get('user')?.id });
          if (res.success) {
            Toast.success('Project deleted.');
            load();
          } else {
            Toast.error(res.error);
          }
        }, { title: 'Delete Project', danger: true });
      });
    });
  }

  function renderProjectCard(p) {
    const statusClass = (p.status || '').toLowerCase().replace(/\s+/g, '-');
    const progress = p.progress || 0;
    
    // Format currency cleanly
    const formatPrice = (val) => {
      return API.fmtRupees(val);
    };

    const getTagColor = (tag) => {
      const map = {
        Red: '#ef4444',
        Orange: '#f97316',
        Yellow: '#eab308',
        Green: '#22c55e',
        Blue: '#3b82f6',
        Purple: '#a855f7',
        Teal: '#14b8a6'
      };
      return map[tag] || 'var(--border)';
    };

    const tagColor = getTagColor(p.color_tag);

    return `
      <div class="card project-card" data-id="${p.id}" style="cursor:pointer; border-top: 4px solid ${tagColor}; position: relative;">
        <div class="card-header">
          <div style="flex:1">
            <div class="project-icon-box" style="background: ${tagColor}15; color: ${tagColor}">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M13 21V11l4-2v12"/></svg>
            </div>
            <div class="project-client">
              ${Helpers.escapeHtml(p.client_name || 'Direct Client')}
              ${p.client_phone ? ` • ${Helpers.escapeHtml(p.client_phone)}` : ''}
            </div>
            <h3 class="project-title">${Helpers.escapeHtml(p.name)}</h3>
          </div>
          <div class="card-actions">
            <button class="btn btn-ghost btn-icon proj-edit-btn" data-id="${p.id}" title="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            ${AppState.get('user')?.role === 'admin' || AppState.get('settings')?.hr_delete_access === '1' ? `
            <button class="btn btn-ghost btn-icon proj-del-btn" data-id="${p.id}" data-name="${p.name}" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--danger)"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
            ` : ''}
          </div>
        </div>
        
        <div class="card-body">
          <div class="proj-meta" style="margin-bottom: 12px; display: flex; gap: 6px; flex-wrap: wrap;">
             <span class="proj-badge-status proj-badge-${statusClass}">${p.status || 'Upcoming'}</span>
             <span class="text-xs text-muted font-600">ID: ${p.code || 'N/A'}</span>
             ${p.project_type ? `<span class="badge" style="background: var(--bg-subtle); color: var(--text-sec); border: 1.5px solid var(--border); font-size:10px">${Helpers.escapeHtml(p.project_type)}</span>` : ''}
          </div>

          <div class="proj-progress-wrap" style="margin-bottom: 12px;">
            <div class="proj-progress-label">
              <span>Execution Progress</span>
              <span class="font-700">${progress}%</span>
            </div>
            <div class="proj-progress-bar">
              <div class="proj-progress-fill" style="width:${progress}%"></div>
            </div>
          </div>

          <div class="proj-stats-grid" style="margin-bottom: 12px;">
            <div class="proj-stat-item">
              <div class="proj-stat-label">Monthly Cost</div>
              <div class="proj-stat-value highlight">${formatPrice(p.monthlyLaborCost)}</div>
            </div>
            <div class="proj-stat-item" style="text-align:right">
              <div class="proj-stat-label">Total Site Cost</div>
              <div class="proj-stat-value">${formatPrice(p.laborCost)}</div>
            </div>
          </div>

          <div class="text-xs text-muted mt-2" style="display: flex; justify-content: space-between; border-top: 1px dashed var(--border); padding-top: 8px;">
            <span>Supervisor: <strong>${Helpers.escapeHtml(p.supervisor_name || 'N/A')}</strong></span>
            <span>Req Manpower: <strong>${p.required_manpower || 0}</strong></span>
          </div>

          ${p.shortage > 0 ? `
            <div style="background: var(--danger-faint); color: var(--danger); border-radius: 6px; padding: 4px 8px; font-size: 11px; font-weight: 600; margin-top: 8px; display: flex; align-items: center; gap: 4px;">
              <span>⚠️ Shortage Alert: Missing ${p.shortage} worker(s) today</span>
            </div>
          ` : ''}
          
          <div class="mt-3 flex justify-between items-center text-xs text-muted">
            <span>Started: <strong>${Helpers.formatDateShort(p.start_date)}</strong></span>
            <span>Billing Cycle: <strong>${Helpers.escapeHtml(p.billing_cycle || 'N/A')}</strong></span>
          </div>
        </div>
      </div>
    `;
  }

  function openForm(project = null) {
    const isEdit = !!project;
    Modal.open({
      title: isEdit ? 'Edit Project' : 'New Project',
      size: 'modal-md',
      body: `
        <div class="grid-2">
          <div class="form-group" style="grid-column: 1 / -1">
            <label class="form-label">Project Name *</label>
            <input type="text" id="pf-name" class="form-input" value="${Helpers.escapeHtml(project?.name || '')}" placeholder="e.g. IKEA GMP Renovation" />
          </div>
          <div class="form-group">
            <label class="form-label">Client Name</label>
            <input type="text" id="pf-client" class="form-input" value="${Helpers.escapeHtml(project?.client_name || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Project Code / ID</label>
            <input type="text" id="pf-code" class="form-input" value="${Helpers.escapeHtml(project?.code || '')}" placeholder="e.g. PRJ-001" />
          </div>
          <div class="form-group">
            <label class="form-label">Start Date</label>
            <input type="date" id="pf-start" class="form-input" value="${project?.start_date || Helpers.todayIso()}" />
          </div>
          <div class="form-group">
            <label class="form-label">Expected End Date</label>
            <input type="date" id="pf-end" class="form-input" value="${project?.end_date || ''}" />
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select id="pf-status" class="form-select">
              <option value="Upcoming" ${project?.status === 'Upcoming' ? 'selected' : ''}>Upcoming</option>
              <option value="Ongoing" ${project?.status === 'Ongoing' ? 'selected' : ''}>Ongoing</option>
              <option value="Completed" ${project?.status === 'Completed' ? 'selected' : ''}>Completed</option>
              <option value="On Hold" ${project?.status === 'On Hold' ? 'selected' : ''}>On Hold</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Supervisor Name</label>
            <input type="text" id="pf-supervisor" class="form-input" value="${Helpers.escapeHtml(project?.supervisor_name || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Contract Value (₹)</label>
            <input type="number" id="pf-revenue" class="form-input" value="${project?.revenue ? (project.revenue / 100) : ''}" placeholder="0.00" />
          </div>
          <div class="form-group">
            <label class="form-label">Progress (%)</label>
            <input type="number" id="pf-progress" class="form-input" min="0" max="100" value="${project?.progress || 0}" />
          </div>
          <div class="form-group">
            <label class="form-label">Project Type</label>
            <input type="text" id="pf-type" class="form-input" value="${Helpers.escapeHtml(project?.project_type || '')}" placeholder="e.g. Electrical, HVAC, BMS" />
          </div>
          <div class="form-group">
            <label class="form-label">Billing Cycle</label>
            <select id="pf-billing-cycle" class="form-select">
              <option value="Monthly" ${project?.billing_cycle === 'Monthly' ? 'selected' : ''}>Monthly</option>
              <option value="Bi-Weekly" ${project?.billing_cycle === 'Bi-Weekly' ? 'selected' : ''}>Bi-Weekly</option>
              <option value="Weekly" ${project?.billing_cycle === 'Weekly' ? 'selected' : ''}>Weekly</option>
              <option value="Milestones" ${project?.billing_cycle === 'Milestones' ? 'selected' : ''}>Milestones</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Client Email</label>
            <input type="email" id="pf-client-email" class="form-input" value="${Helpers.escapeHtml(project?.client_email || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Client Phone / Contact</label>
            <input type="text" id="pf-client-phone" class="form-input" value="${Helpers.escapeHtml(project?.client_phone || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Color Tag</label>
            <select id="pf-color-tag" class="form-select">
              <option value="Blue" ${project?.color_tag === 'Blue' ? 'selected' : ''}>Blue</option>
              <option value="Red" ${project?.color_tag === 'Red' ? 'selected' : ''}>Red</option>
              <option value="Green" ${project?.color_tag === 'Green' ? 'selected' : ''}>Green</option>
              <option value="Orange" ${project?.color_tag === 'Orange' ? 'selected' : ''}>Orange</option>
              <option value="Purple" ${project?.color_tag === 'Purple' ? 'selected' : ''}>Purple</option>
              <option value="Yellow" ${project?.color_tag === 'Yellow' ? 'selected' : ''}>Yellow</option>
              <option value="Teal" ${project?.color_tag === 'Teal' ? 'selected' : ''}>Teal</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Required Manpower Count</label>
            <input type="number" id="pf-req-manpower" class="form-input" min="0" value="${project?.required_manpower || 0}" />
          </div>
          <div class="form-group" style="grid-column: 1 / -1">
            <label class="form-label">Site Address</label>
            <textarea id="pf-address" class="form-input" rows="2">${Helpers.escapeHtml(project?.site_address || '')}</textarea>
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" id="pf-cancel">Cancel</button>
        <button class="btn btn-primary" id="pf-save">${isEdit ? 'Save Changes' : 'Create Project'}</button>
      `
    });

    document.getElementById('pf-cancel').addEventListener('click', Modal.close);
    document.getElementById('pf-save').addEventListener('click', async () => {
      const name = document.getElementById('pf-name').value.trim();
      if (!name) return Toast.error('Project Name is required.');

      const revenueRs = parseFloat(document.getElementById('pf-revenue').value) || 0;

      const data = {
        name,
        clientName: document.getElementById('pf-client').value.trim(),
        code: document.getElementById('pf-code').value.trim(),
        siteAddress: document.getElementById('pf-address').value.trim(),
        status: document.getElementById('pf-status').value,
        supervisorName: document.getElementById('pf-supervisor').value.trim(),
        startDate: document.getElementById('pf-start').value,
        endDate: document.getElementById('pf-end').value || null,
        revenue: Math.round(revenueRs * 100), // convert to paisa
        progress: parseInt(document.getElementById('pf-progress').value) || 0,
        projectType: document.getElementById('pf-type').value.trim(),
        billingCycle: document.getElementById('pf-billing-cycle').value,
        clientEmail: document.getElementById('pf-client-email').value.trim(),
        clientPhone: document.getElementById('pf-client-phone').value.trim(),
        colorTag: document.getElementById('pf-color-tag').value,
        requiredManpower: parseInt(document.getElementById('pf-req-manpower').value) || 0,
        operatorId: AppState.get('user')?.id,
        createdBy: AppState.get('user')?.id
      };

      Helpers.setLoading('pf-save', true);
      let r;
      if (isEdit) {
        data.id = project.id;
        r = await window.API.updateProject(data);
      } else {
        r = await window.API.createProject(data);
      }
      Helpers.setLoading('pf-save', false);

      if (r.success) {
        Toast.success(isEdit ? 'Project updated.' : 'Project created.');
        Modal.close();
        await load(); // Auto-refresh list
      } else {
        Toast.error(r.error);
      }
    });
  }

  return { init, load };
})();
