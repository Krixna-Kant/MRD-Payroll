/**
 * LocalPayroll — Projects Module
 * Manages project master list, costs, status, and navigation to project dashboards.
 */
const ProjectsPage = (() => {
  const container = () => document.getElementById('page-projects');
  const headerActs = () => document.getElementById('page-header-actions');

  let _projects = [];
  let _filterStatus = '';

  async function init() {
    headerActs().innerHTML = `
      <button class="btn btn-primary" id="add-project-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span class="btn-text">New Project</span>
      </button>
    `;
    document.getElementById('add-project-btn').addEventListener('click', openForm);

    await load();
  }

  async function load() {
    try {
      const res = await window.API.getProjects({ status: _filterStatus });
      _projects = res.projects || [];
      render();
    } catch (err) {
      Toast.error('Failed to load projects: ' + err.message);
    }
  }

  function render() {
    container().innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left flex gap-2 items-center">
          <select id="proj-filter-status" class="form-select" style="width:150px">
            <option value="">All Statuses</option>
            <option value="Upcoming" ${_filterStatus === 'Upcoming' ? 'selected' : ''}>Upcoming</option>
            <option value="Ongoing" ${_filterStatus === 'Ongoing' ? 'selected' : ''}>Ongoing</option>
            <option value="On Hold" ${_filterStatus === 'On Hold' ? 'selected' : ''}>On Hold</option>
            <option value="Delayed" ${_filterStatus === 'Delayed' ? 'selected' : ''}>Delayed</option>
            <option value="Completed" ${_filterStatus === 'Completed' ? 'selected' : ''}>Completed</option>
          </select>
        </div>
        <div class="toolbar-right">
          <div class="text-sm text-muted">Total Projects: ${_projects.length}</div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4" id="projects-grid">
        ${_projects.length === 0 ? `
          <div class="empty-state" style="grid-column: 1 / -1">
            <h3>No projects found</h3>
            <p class="text-muted">Create a new project to start tracking site progress and costs.</p>
          </div>
        ` : _projects.map(p => `
          <div class="card project-card" style="cursor:pointer; display:flex; flex-direction:column; gap:12px; position:relative;" data-id="${p.id}">
            <div class="flex justify-between items-start">
              <div>
                <h3 style="margin:0;font-size:1.1rem;color:var(--primary)">${Helpers.escapeHtml(p.name)}</h3>
                <div class="text-xs text-muted" style="margin-top:2px">${Helpers.escapeHtml(p.client_name || 'No Client')}</div>
              </div>
              ${statusBadge(p.status)}
            </div>
            
            <div style="background:var(--bg-sec);border-radius:6px;padding:8px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.85rem">
              <div><span class="text-muted">Start:</span> ${Helpers.formatDateShort(p.start_date)}</div>
              <div><span class="text-muted">Stage:</span> ${Helpers.escapeHtml(p.current_stage || '—')}</div>
              <div><span class="text-muted">Expense:</span> <span class="font-600">${window.API.fmtRupees(p.totalExpenses || 0)}</span></div>
              <div><span class="text-muted">Present Today:</span> <span class="font-600">${p.presentToday || 0}</span></div>
            </div>
            
            <div style="margin-top:auto">
              <div class="flex justify-between text-xs mb-1">
                <span>Progress</span>
                <span>${p.progress}%</span>
              </div>
              <div style="width:100%;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
                <div style="width:${p.progress}%;height:100%;background:var(--accent)"></div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    document.getElementById('proj-filter-status')?.addEventListener('change', e => {
      _filterStatus = e.target.value;
      load();
    });

    container().querySelectorAll('.project-card').forEach(card => {
      card.addEventListener('click', () => {
        Router.navigate('project_dashboard', { id: parseInt(card.dataset.id) });
      });
    });
  }

  function statusBadge(s) {
    const map = { 'Upcoming': 'badge-info', 'Ongoing': 'badge-success', 'On Hold': 'badge-warning', 'Delayed': 'badge-danger', 'Completed': 'badge-muted' };
    return `<span class="badge ${map[s] || 'badge-muted'}">${s}</span>`;
  }

  function openForm(project = null) {
    const isEdit = !!project;
    Modal.open({
      title: isEdit ? 'Edit Project' : 'Create Project',
      size: 'modal-md',
      body: `
        <div class="form-row mb-3">
          <div class="form-group">
            <label class="form-label">Project Name *</label>
            <input type="text" id="pf-name" class="form-input" value="${Helpers.escapeHtml(project?.name || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Client Name</label>
            <input type="text" id="pf-client" class="form-input" value="${Helpers.escapeHtml(project?.client_name || '')}" />
          </div>
        </div>
        <div class="form-row mb-3">
          <div class="form-group">
            <label class="form-label">Project Code</label>
            <input type="text" id="pf-code" class="form-input" value="${Helpers.escapeHtml(project?.code || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select id="pf-status" class="form-select">
              <option value="Upcoming" ${project?.status === 'Upcoming' ? 'selected' : ''}>Upcoming</option>
              <option value="Ongoing" ${project?.status === 'Ongoing' ? 'selected' : ''}>Ongoing</option>
              <option value="On Hold" ${project?.status === 'On Hold' ? 'selected' : ''}>On Hold</option>
              <option value="Delayed" ${project?.status === 'Delayed' ? 'selected' : ''}>Delayed</option>
              <option value="Completed" ${project?.status === 'Completed' ? 'selected' : ''}>Completed</option>
            </select>
          </div>
        </div>
        <div class="form-group mb-3">
          <label class="form-label">Site Address</label>
          <input type="text" id="pf-address" class="form-input" value="${Helpers.escapeHtml(project?.site_address || '')}" />
        </div>
        <div class="form-row mb-3">
          <div class="form-group">
            <label class="form-label">Supervisor Name</label>
            <input type="text" id="pf-supervisor" class="form-input" value="${Helpers.escapeHtml(project?.supervisor_name || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Start Date</label>
            <input type="date" id="pf-start" class="form-input" value="${project?.start_date || Helpers.todayIso()}" />
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="pf-save">${isEdit ? 'Save Changes' : 'Create Project'}</button>
      `
    });

    document.getElementById('pf-save').addEventListener('click', async () => {
      const name = document.getElementById('pf-name').value;
      if (!name) return Toast.error('Project Name is required.');

      const data = {
        name,
        clientName: document.getElementById('pf-client').value,
        code: document.getElementById('pf-code').value,
        siteAddress: document.getElementById('pf-address').value,
        status: document.getElementById('pf-status').value,
        supervisorName: document.getElementById('pf-supervisor').value,
        startDate: document.getElementById('pf-start').value,
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
        load();
      } else {
        Toast.error(r.error);
      }
    });
  }

  return { init };
})();
