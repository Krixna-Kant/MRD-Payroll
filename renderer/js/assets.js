/**
 * LocalPayroll — Asset Management Module (Premium UI)
 * Offline asset catalog, worker allocations, and maintenance logs.
 */

const AssetsPage = (() => {
  const container = () => document.getElementById('page-assets');
  const headerActs = () => document.getElementById('page-header-actions');

  let _assets = [];
  let _employees = [];
  let _projects = [];
  let _activeTab = 'directory'; // 'directory' | 'assignments' | 'maintenance'
  let _selectedFolder = 'all';  // 'all' | 'available' | 'maintenance' | 'employees' | 'project:id'
  let _searchQuery = '';
  let _filterCategory = '';
  let _filterStatus = '';
  let _viewMode = 'folders';    // 'folders' | 'details'
  let _folderSearchQuery = '';

  /**
   * Initialize the page
   */
  async function init() {
    _viewMode = 'folders';
    _folderSearchQuery = '';
    _activeTab = 'directory';
    _selectedFolder = 'all';
    _searchQuery = '';
    _filterCategory = '';
    _filterStatus = '';
    
    renderSkeleton();
    await load();
  }

  /**
   * Fetch data from backend
   */
  async function load() {
    try {
      // 1. Set Header Actions (New Asset Button)
      headerActs().innerHTML = `
        <button class="btn btn-primary" id="asset-add-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Asset
        </button>
      `;
      document.getElementById('asset-add-btn').addEventListener('click', () => openAssetForm());

      // 2. Fetch Assets
      const res = await API.getAssets();
      if (!res.success) throw new Error(res.error);
      _assets = res.assets || [];

      // 3. Fetch Employees (for assignment dropdown)
      const empRes = await API.getEmployees({ status: 'active' });
      if (empRes.success) {
        _employees = empRes.employees || [];
      }

      // 4. Fetch Projects (excluding internal department projects like Head Office)
      const projRes = await API.getProjects({ simple: true, excludeInternal: true });
      if (projRes.success) {
        _projects = projRes.projects || [];
      }

      render();
    } catch (err) {
      console.error('[AssetsPage] Load failed:', err);
      container().innerHTML = `
        <div class="empty-state">
          <div class="empty-icon" style="color:var(--danger)">✕</div>
          <h3>Failed to load Asset Management</h3>
          <p>${err.message}</p>
          <button class="btn btn-secondary mt-3" onclick="AssetsPage.load()">Retry</button>
        </div>
      `;
    }
  }

  function renderSkeleton() {
    container().innerHTML = `
      <div class="assets-kpi-grid">
        ${Array(5).fill('<div class="skeleton" style="height:90px; border-radius:12px"></div>').join('')}
      </div>
      <div class="toolbar mt-4">
        <div class="skeleton" style="width:200px; height:36px"></div>
        <div class="skeleton" style="width:120px; height:24px; margin-left:auto"></div>
      </div>
      <div class="grid-3 mt-4">
        ${Array(6).fill('<div class="skeleton" style="height:220px; border-radius:12px"></div>').join('')}
      </div>
    `;
  }

  function renderFoldersGrid() {
    const allCount = _assets.length;
    const availCount = _assets.filter(a => a.status === 'Available').length;
    const maintCount = _assets.filter(a => a.status === 'Maintenance').length;
    const empCount = _assets.filter(a => a.status === 'Assigned' && a.assigned_to_type === 'Employee').length;

    // Define folders data
    const folders = [
      { id: 'all', name: 'All Assets', count: allCount },
      { id: 'available', name: 'Available Assets', count: availCount },
      { id: 'employees', name: 'Handed to Team', count: empCount },
      { id: 'maintenance', name: 'Maintenance', count: maintCount }
    ];

    // Add projects
    _projects.forEach(p => {
      const pCount = _assets.filter(a => a.status === 'Assigned' && a.project_id === p.id).length;
      folders.push({ id: `project:${p.id}`, name: p.name, count: pCount });
    });

    // Filter folders by search query
    const q = (_folderSearchQuery || '').toLowerCase();
    const filteredFolders = folders.filter(f => f.name.toLowerCase().includes(q));

    if (filteredFolders.length === 0) {
      return `
        <div class="empty-state">
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          <h3>No folders found</h3>
          <p>Try searching for a different name.</p>
        </div>
      `;
    }

    return `
      <div class="folder-grid">
        ${filteredFolders.map(f => {
          return `
            <div class="folder-card" data-folder="${f.id}">
              <div class="folder-icon-wrap">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              </div>
              <div class="folder-info">
                <div class="folder-name">${Helpers.escapeHtml(f.name)}</div>
                <div class="folder-stats">
                  <span class="folder-stat-item">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                    ${f.count} ${f.count === 1 ? 'item' : 'items'}
                  </span>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function render() {
    // 1. Calculate KPIs
    const totalCount = _assets.length;
    const availableCount = _assets.filter(a => a.status === 'Available').length;
    const assignedCount = _assets.filter(a => a.status === 'Assigned').length;
    const maintCount = _assets.filter(a => a.status === 'Maintenance').length;
    const totalValuation = _assets.reduce((sum, a) => sum + (a.purchase_cost || 0), 0);

    let mainWorkspaceContent = '';

    if (_viewMode === 'folders') {
      mainWorkspaceContent = `
        <div class="toolbar" style="padding: 0 0 16px 0;">
          <div class="toolbar-left">
            <div class="search-bar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input id="assets-folder-search" class="form-input" placeholder="Search folders..." value="${Helpers.escapeHtml(_folderSearchQuery)}" style="width:320px" />
            </div>
          </div>
          <div class="toolbar-right">
            <button id="asset-add-btn-folders" class="btn btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Asset
            </button>
          </div>
        </div>
        <div id="assets-folder-grid-container">
          ${renderFoldersGrid()}
        </div>
      `;
    } else {
      // Find selected folder name for breadcrumb
      let selectedFolderName = 'All Assets';
      if (_selectedFolder === 'available') selectedFolderName = 'Available Assets';
      else if (_selectedFolder === 'employees') selectedFolderName = 'Handed to Team';
      else if (_selectedFolder === 'maintenance') selectedFolderName = 'Maintenance';
      else if (_selectedFolder.startsWith('project:')) {
        const projId = parseInt(_selectedFolder.split(':')[1]);
        const proj = _projects.find(p => p.id === projId);
        selectedFolderName = proj ? proj.name : 'Project Site';
      }

      mainWorkspaceContent = `
        <!-- Breadcrumb Navigation -->
        <div class="breadcrumb" style="padding: 0 0 16px 0; border-bottom: 1px solid var(--border); margin-bottom: 16px;">
          <div class="breadcrumb-item">
            <span class="breadcrumb-btn" id="assets-bc-root">Assets Directory</span>
          </div>
          <div class="breadcrumb-separator">/</div>
          <div class="breadcrumb-item active">
            <span>${Helpers.escapeHtml(selectedFolderName)}</span>
          </div>
        </div>

        <!-- Tab Navigation -->
        <div class="assets-tabs" style="padding: 0; margin-bottom: 0;">
          <div class="assets-tab ${_activeTab === 'directory' ? 'active' : ''}" data-tab="directory">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Assets Directory
          </div>
          <div class="assets-tab ${_activeTab === 'assignments' ? 'active' : ''}" data-tab="assignments">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            Active Allocations
          </div>
          <div class="assets-tab ${_activeTab === 'maintenance' ? 'active' : ''}" data-tab="maintenance">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            Maintenance Streams
          </div>
        </div>

        <!-- Filters -->
        <div class="assets-filters" style="padding: 16px 0; border-bottom: 1.5px solid var(--border);">
          <div class="assets-search-wrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="assets-search" class="form-input assets-search-input" value="${Helpers.escapeHtml(_searchQuery)}" placeholder="Search by name, model or serial number..." />
          </div>

          <select id="assets-filter-category" class="form-select" style="width: 160px;">
            <option value="">All Categories</option>
            <option value="Tools" ${_filterCategory === 'Tools' ? 'selected' : ''}>Tools</option>
            <option value="Vehicles" ${_filterCategory === 'Vehicles' ? 'selected' : ''}>Vehicles</option>
            <option value="Electronics" ${_filterCategory === 'Electronics' ? 'selected' : ''}>Electronics</option>
            <option value="Safety Gear" ${_filterCategory === 'Safety Gear' ? 'selected' : ''}>Safety Gear</option>
            <option value="Office" ${_filterCategory === 'Office' ? 'selected' : ''}>Office Equipment</option>
            <option value="Other" ${_filterCategory === 'Other' ? 'selected' : ''}>Other</option>
          </select>

          <select id="assets-filter-status" class="form-select" style="width: 160px;">
            <option value="">All Statuses</option>
            <option value="Available" ${_filterStatus === 'Available' ? 'selected' : ''}>Available</option>
            <option value="Assigned" ${_filterStatus === 'Assigned' ? 'selected' : ''}>Assigned</option>
            <option value="Maintenance" ${_filterStatus === 'Maintenance' ? 'selected' : ''}>In Maintenance</option>
            <option value="Scrapped" ${_filterStatus === 'Scrapped' ? 'selected' : ''}>Scrapped</option>
            <option value="Lost" ${_filterStatus === 'Lost' ? 'selected' : ''}>Lost</option>
          </select>
        </div>

        <!-- Active tab workspace -->
        <div id="assets-tab-content">
          ${renderTabContent()}
        </div>
      `;
    }

    // Render Page Layout
    container().innerHTML = `
      <div class="assets-container">
        <!-- KPI Dashboard -->
        <div class="assets-kpi-grid">
          <div class="assets-kpi-card total">
            <div class="kpi-icon">📁</div>
            <div class="kpi-label">Total Assets</div>
            <div class="kpi-value">${totalCount}</div>
            <div class="kpi-subtext">Total cataloged items</div>
          </div>
          <div class="assets-kpi-card available">
            <div class="kpi-icon">✓</div>
            <div class="kpi-label">Available</div>
            <div class="kpi-value">${availableCount}</div>
            <div class="kpi-subtext">Ready for deployment</div>
          </div>
          <div class="assets-kpi-card assigned">
            <div class="kpi-icon">👤</div>
            <div class="kpi-label">Assigned</div>
            <div class="kpi-value">${assignedCount}</div>
            <div class="kpi-subtext">Allocated to workers / sites</div>
          </div>
          <div class="assets-kpi-card maintenance">
            <div class="kpi-icon">🔧</div>
            <div class="kpi-label">Maintenance</div>
            <div class="kpi-value">${maintCount}</div>
            <div class="kpi-subtext">Under repair or service</div>
          </div>
          <div class="assets-kpi-card valuation">
            <div class="kpi-icon">₹</div>
            <div class="kpi-label">Total Valuation</div>
            <div class="kpi-value">${API.fmtRupeesShort(totalValuation)}</div>
            <div class="kpi-subtext">Asset capital investment</div>
          </div>
        </div>

        <!-- Main Workspace -->
        <div class="assets-main-panel" style="padding: 20px;">
          ${mainWorkspaceContent}
        </div>
      </div>
    `;

    // 3. Attach Events
    attachEvents();
  }

  function renderTabContent() {
    // Filter assets array
    const filtered = _assets.filter(a => {
      // 1. Folder filter
      if (_selectedFolder === 'available') {
        if (a.status !== 'Available') return false;
      } else if (_selectedFolder === 'maintenance') {
        if (a.status !== 'Maintenance') return false;
      } else if (_selectedFolder === 'employees') {
        if (a.status !== 'Assigned' || a.assigned_to_type !== 'Employee') return false;
      } else if (_selectedFolder.startsWith('project:')) {
        const projId = parseInt(_selectedFolder.split(':')[1]);
        if (a.status !== 'Assigned' || a.project_id !== projId) return false;
      }

      // 2. Query/Category/Status Filters
      if (_searchQuery) {
        const query = _searchQuery.toLowerCase();
        const matchesName = (a.name || '').toLowerCase().includes(query);
        const matchesSerial = (a.serial_no || '').toLowerCase().includes(query);
        const matchesModel = (a.model_no || '').toLowerCase().includes(query);
        if (!matchesName && !matchesSerial && !matchesModel) return false;
      }
      if (_filterCategory && a.category !== _filterCategory) return false;
      if (_filterStatus && a.status !== _filterStatus) return false;
      return true;
    });

    if (_activeTab === 'directory') {
      return renderDirectory(filtered);
    } else if (_activeTab === 'assignments') {
      return renderAssignments(filtered.filter(a => a.status === 'Assigned'));
    } else if (_activeTab === 'maintenance') {
      return renderMaintenance(filtered.filter(a => a.status === 'Maintenance'));
    }
    return '';
  }

  // ── Tab: Assets Directory ──────────────────────────────────────────────────
  function renderDirectory(list) {
    if (list.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">📦</div>
          <h3>No assets found</h3>
          <p>Try refining your filters or catalog a new asset.</p>
        </div>
      `;
    }

    return `
      <div class="assets-grid">
        ${list.map(a => {
          const statusClass = a.status.toLowerCase();
          const formatCost = a.purchase_cost ? API.fmtRupees(a.purchase_cost) : '—';
          const purchaseDateStr = a.purchase_date ? Helpers.formatDate(a.purchase_date) : '—';
          
          return `
            <div class="asset-card">
              <div class="asset-card-header">
                <div class="asset-card-title-wrap">
                  <div class="asset-card-category">${Helpers.escapeHtml(a.category)}</div>
                  <h4 class="asset-card-name" title="${Helpers.escapeHtml(a.name)}">${Helpers.escapeHtml(a.name)}</h4>
                </div>
                <span class="asset-status-badge ${statusClass}">${a.status}</span>
              </div>

              <div class="asset-card-details">
                <div class="asset-detail-row">
                  <span>Serial No:</span>
                  <span>${Helpers.escapeHtml(a.serial_no || '—')}</span>
                </div>
                <div class="asset-detail-row">
                  <span>Model:</span>
                  <span>${Helpers.escapeHtml(a.model_no || '—')}</span>
                </div>
                <div class="asset-detail-row">
                  <span>Purchase Date:</span>
                  <span>${purchaseDateStr}</span>
                </div>
                <div class="asset-detail-row">
                  <span>Cost:</span>
                  <span>${formatCost}</span>
                </div>
              </div>

              ${a.status === 'Assigned' ? `
                <div class="asset-card-assignee">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  <span>
                    ${a.assigned_to_type === 'Employee' 
                      ? `Assignee: <strong>${Helpers.escapeHtml(a.employee_name || 'Staff')}</strong>`
                      : `Site: <strong>${Helpers.escapeHtml(a.project_name || 'Project')}</strong>`
                    }
                  </span>
                </div>
              ` : ''}

              <div class="asset-card-actions">
                ${a.status === 'Available' ? `
                  <button class="btn btn-secondary btn-sm asset-action-assign" data-id="${a.id}">Assign</button>
                  <button class="btn btn-ghost btn-sm asset-action-maint" data-id="${a.id}">Service</button>
                ` : ''}
                ${a.status === 'Assigned' ? `
                  <button class="btn btn-primary btn-sm asset-action-return" data-id="${a.id}">Return / Retrieve</button>
                ` : ''}
                ${a.status === 'Maintenance' ? `
                  <button class="btn btn-success btn-sm asset-action-complete" data-id="${a.id}">Complete Service</button>
                ` : ''}
                
                <button class="btn btn-ghost btn-icon asset-action-history" data-id="${a.id}" title="View History Log">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </button>
                <button class="btn btn-ghost btn-icon asset-action-edit" data-id="${a.id}" title="Edit Asset">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="btn btn-ghost btn-icon asset-action-del" data-id="${a.id}" title="Delete" style="color:var(--danger)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // ── Tab: Active Allocations ────────────────────────────────────────────────
  function renderAssignments(list) {
    if (list.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">👤</div>
          <h3>No active allocations</h3>
          <p>Assign tools or assets to staff members or active site projects.</p>
        </div>
      `;
    }

    return `
      <div class="table-wrap p-4">
        <table>
          <thead>
            <tr>
              <th>Asset Name</th>
              <th>Category</th>
              <th>Serial Number</th>
              <th>Assigned To</th>
              <th>Assigned Date</th>
              <th>Expected Return</th>
              <th>Condition</th>
              <th style="text-align:center">Action</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(a => `
              <tr>
                <td class="font-600">${Helpers.escapeHtml(a.name)}</td>
                <td><span class="badge" style="background:var(--bg-subtle)">${Helpers.escapeHtml(a.category)}</span></td>
                <td><code>${Helpers.escapeHtml(a.serial_no || '—')}</code></td>
                <td>
                  ${a.assigned_to_type === 'Employee'
                    ? `<span style="font-weight:600">👤 ${Helpers.escapeHtml(a.employee_name || 'Staff')}</span> <span class="text-xs text-muted">(${Helpers.escapeHtml(a.employee_role || '')})</span>`
                    : `<span style="font-weight:600">🏢 ${Helpers.escapeHtml(a.project_name || 'Project Site')}</span>`
                  }
                </td>
                <td>${Helpers.formatDate(a.assigned_date)}</td>
                <td>${a.expected_return_date ? Helpers.formatDate(a.expected_return_date) : '<span class="text-muted">No deadline</span>'}</td>
                <td><span class="badge badge-success">${a.condition_on_assign}</span></td>
                <td style="text-align:center">
                  <button class="btn btn-sm btn-primary asset-action-return" data-id="${a.id}">Retrieve</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ── Tab: Maintenance Streams ───────────────────────────────────────────────
  function renderMaintenance(list) {
    if (list.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">🔧</div>
          <h3>No assets in maintenance</h3>
          <p>Assets sent for repairs, calibration, or servicing will appear here.</p>
        </div>
      `;
    }

    return `
      <div class="table-wrap p-4">
        <table>
          <thead>
            <tr>
              <th>Asset Name</th>
              <th>Category</th>
              <th>Serial Number</th>
              <th>Sent Date</th>
              <th>Status</th>
              <th style="text-align:center">Action</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(a => `
              <tr>
                <td class="font-600">${Helpers.escapeHtml(a.name)}</td>
                <td><span class="badge" style="background:var(--bg-subtle)">${Helpers.escapeHtml(a.category)}</span></td>
                <td><code>${Helpers.escapeHtml(a.serial_no || '—')}</code></td>
                <td>${Helpers.formatDate(a.assigned_date || Helpers.todayIso())}</td>
                <td><span class="asset-status-badge maintenance">In Service</span></td>
                <td style="text-align:center">
                  <button class="btn btn-sm btn-success asset-action-complete" data-id="${a.id}">Complete Service</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Bind DOM Events
   */
  function attachEvents() {
    if (_viewMode === 'folders') {
      // Folder search
      const folderSearchInput = document.getElementById('assets-folder-search');
      if (folderSearchInput) {
        folderSearchInput.addEventListener('input', Helpers.debounce(e => {
          _folderSearchQuery = e.target.value;
          const gridContainer = document.getElementById('assets-folder-grid-container');
          if (gridContainer) gridContainer.innerHTML = renderFoldersGrid();
          rebindFolderClicks();
        }, 200));
      }

      // Add asset button click inside folders toolbar
      const addBtnFolders = document.getElementById('asset-add-btn-folders');
      if (addBtnFolders) {
        addBtnFolders.addEventListener('click', () => openAssetForm());
      }

      rebindFolderClicks();
    } else {
      // Breadcrumb root click
      const bcRoot = document.getElementById('assets-bc-root');
      if (bcRoot) {
        bcRoot.addEventListener('click', () => {
          _viewMode = 'folders';
          _folderSearchQuery = '';
          render();
        });
      }

      // 1. Tab switches
      container().querySelectorAll('.assets-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          _activeTab = tab.dataset.tab;
          render();
        });
      });

      // 2. Filter Inputs
      const searchInput = document.getElementById('assets-search');
      if (searchInput) {
        searchInput.addEventListener('input', Helpers.debounce(e => {
          _searchQuery = e.target.value;
          const body = document.getElementById('assets-tab-content');
          if (body) body.innerHTML = renderTabContent();
          bindCardActions();
        }, 250));
      }

      const catFilter = document.getElementById('assets-filter-category');
      if (catFilter) {
        catFilter.addEventListener('change', e => {
          _filterCategory = e.target.value;
          const body = document.getElementById('assets-tab-content');
          if (body) body.innerHTML = renderTabContent();
          bindCardActions();
        });
      }

      const statusFilter = document.getElementById('assets-filter-status');
      if (statusFilter) {
        statusFilter.addEventListener('change', e => {
          _filterStatus = e.target.value;
          const body = document.getElementById('assets-tab-content');
          if (body) body.innerHTML = renderTabContent();
          bindCardActions();
        });
      }

      // 3. Card/Table Action Bindings
      bindCardActions();
    }
  }

  function rebindFolderClicks() {
    container().querySelectorAll('.folder-card').forEach(card => {
      card.addEventListener('click', () => {
        _selectedFolder = card.dataset.folder;
        _viewMode = 'details';
        render();
      });
    });
  }

  function bindCardActions() {
    // Assign asset click
    container().querySelectorAll('.asset-action-assign').forEach(btn => {
      btn.addEventListener('click', () => openAssignModal(parseInt(btn.dataset.id)));
    });

    // Return asset click
    container().querySelectorAll('.asset-action-return').forEach(btn => {
      btn.addEventListener('click', () => openRetrieveModal(parseInt(btn.dataset.id)));
    });

    // Send for Service click
    container().querySelectorAll('.asset-action-maint').forEach(btn => {
      btn.addEventListener('click', () => openMaintenanceModal(parseInt(btn.dataset.id)));
    });

    // Complete Service click
    container().querySelectorAll('.asset-action-complete').forEach(btn => {
      btn.addEventListener('click', () => openCompleteMaintenanceModal(parseInt(btn.dataset.id)));
    });

    // Edit asset click
    container().querySelectorAll('.asset-action-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        const asset = _assets.find(x => x.id === id);
        openAssetForm(asset);
      });
    });

    // Delete asset click
    container().querySelectorAll('.asset-action-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        const asset = _assets.find(x => x.id === id);
        Modal.confirm(`Are you sure you want to delete asset <strong>${Helpers.escapeHtml(asset.name)}</strong>? This will clear all historical records associated with this asset.`, async () => {
          const r = await API.deleteAsset(id);
          if (r.success) {
            Toast.success('Asset deleted successfully.');
            await load();
          } else Toast.error(r.error);
        }, { title: 'Delete Asset Confirmation', danger: true });
      });
    });

    // View History click
    container().querySelectorAll('.asset-action-history').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        const asset = _assets.find(x => x.id === id);
        openHistoryModal(asset);
      });
    });
  }

  // ── Form Modal: Create / Edit Asset ────────────────────────────────────────
  function openAssetForm(asset = null) {
    const isEdit = !!asset;
    
    Modal.open({
      title: isEdit ? 'Edit Asset Details' : 'Catalog New Asset',
      size: 'modal-md',
      body: `
        <div class="grid-2">
          <div class="form-group" style="grid-column: 1 / -1">
            <label class="form-label">Asset Name *</label>
            <input type="text" id="af-name" class="form-input" value="${Helpers.escapeHtml(asset?.name || '')}" placeholder="e.g. Bosch Heavy Drill Machine GSB 20-2" required />
          </div>
          
          <div class="form-group">
            <label class="form-label">Category *</label>
            <select id="af-category" class="form-select">
              <option value="Tools" ${asset?.category === 'Tools' ? 'selected' : ''}>Tools & Hardware</option>
              <option value="Vehicles" ${asset?.category === 'Vehicles' ? 'selected' : ''}>Vehicles & Trucks</option>
              <option value="Electronics" ${asset?.category === 'Electronics' ? 'selected' : ''}>Electronics / Computers</option>
              <option value="Safety Gear" ${asset?.category === 'Safety Gear' ? 'selected' : ''}>Safety Gear & PPE</option>
              <option value="Office" ${asset?.category === 'Office' ? 'selected' : ''}>Office Equipment</option>
              <option value="Other" ${asset?.category === 'Other' ? 'selected' : ''}>Other</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Serial / Identification No.</label>
            <input type="text" id="af-serial" class="form-input" value="${Helpers.escapeHtml(asset?.serial_no || '')}" placeholder="e.g. SN-998822A" />
          </div>

          <div class="form-group">
            <label class="form-label">Model Number</label>
            <input type="text" id="af-model" class="form-input" value="${Helpers.escapeHtml(asset?.model_no || '')}" placeholder="e.g. GSB-20-2 RE" />
          </div>

          <div class="form-group">
            <label class="form-label">Purchase Date</label>
            <input type="date" id="af-purchase-date" class="form-input" value="${asset?.purchase_date || Helpers.todayIso()}" />
          </div>

          <div class="form-group">
            <label class="form-label">Purchase Cost (₹)</label>
            <input type="number" id="af-purchase-cost" class="form-input" value="${asset?.purchase_cost ? (asset.purchase_cost / 100) : ''}" placeholder="0.00" />
          </div>

          ${isEdit ? `
            <div class="form-group">
              <label class="form-label">Operational Status</label>
              <select id="af-status" class="form-select">
                <option value="Available" ${asset?.status === 'Available' ? 'selected' : ''}>Available</option>
                <option value="Assigned" ${asset?.status === 'Assigned' ? 'selected' : ''}>Assigned (Allocated)</option>
                <option value="Maintenance" ${asset?.status === 'Maintenance' ? 'selected' : ''}>In Maintenance</option>
                <option value="Scrapped" ${asset?.status === 'Scrapped' ? 'selected' : ''}>Scrapped</option>
                <option value="Lost" ${asset?.status === 'Lost' ? 'selected' : ''}>Lost</option>
              </select>
            </div>
          ` : ''}

          <div class="form-group" style="grid-column: 1 / -1">
            <label class="form-label">Notes & Specifications</label>
            <textarea id="af-notes" class="form-input" rows="2" placeholder="e.g. 700W motor, kept in Box 3B">${Helpers.escapeHtml(asset?.notes || '')}</textarea>
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="af-save-btn">${isEdit ? 'Save Changes' : 'Catalog Asset'}</button>
      `
    });

    document.getElementById('af-save-btn').addEventListener('click', async () => {
      const name = document.getElementById('af-name').value.trim();
      const category = document.getElementById('af-category').value;
      if (!name) return Toast.error('Asset Name is required.');

      const data = {
        name,
        category,
        modelNo: document.getElementById('af-model').value.trim(),
        serialNo: document.getElementById('af-serial').value.trim(),
        purchaseDate: document.getElementById('af-purchase-date').value,
        purchaseCost: parseFloat(document.getElementById('af-purchase-cost').value) || 0,
        notes: document.getElementById('af-notes').value.trim()
      };

      if (isEdit) {
        data.id = asset.id;
        data.status = document.getElementById('af-status').value;
      }

      Helpers.setLoading('af-save-btn', true);
      const r = isEdit ? await API.updateAsset(data) : await API.createAsset(data);
      Helpers.setLoading('af-save-btn', false);

      if (r.success) {
        Toast.success(isEdit ? 'Asset updated.' : 'Asset cataloged.');
        Modal.close();
        await load();
      } else {
        Toast.error(r.error);
      }
    });
  }

  // ── Form Modal: Allocate Asset ─────────────────────────────────────────────
  function openAssignModal(assetId) {
    if (_employees.length === 0 && _projects.length === 0) {
      Modal.open({
        title: 'Allocate Asset',
        body: '<p class="text-muted text-center p-4">Create employees or active projects first to assign assets.</p>',
        footer: '<button class="btn btn-secondary" onclick="Modal.close()">Close</button>'
      });
      return;
    }

    Modal.open({
      title: 'Allocate / Assign Asset',
      size: 'modal-md',
      body: `
        <div class="form-group mb-3">
          <label class="form-label font-700">Allocation Type</label>
          <div class="flex gap-4 mt-2">
            <label class="flex items-center gap-1 cursor-pointer">
              <input type="radio" name="assign-type" value="Employee" checked style="width:16px;height:16px" />
              <span>Team Member / Employee</span>
            </label>
            <label class="flex items-center gap-1 cursor-pointer">
              <input type="radio" name="assign-type" value="Project" style="width:16px;height:16px" />
              <span>Project Site / Location</span>
            </label>
          </div>
        </div>

        <div class="form-group mb-3" id="group-assign-emp">
          <label class="form-label">Select Employee *</label>
          <select id="asf-employee" class="form-select">
            <option value="">-- Choose Employee --</option>
            ${_employees.map(e => `<option value="${e.id}">${Helpers.escapeHtml(e.name)} (${Helpers.escapeHtml(e.role || 'Staff')})</option>`).join('')}
          </select>
        </div>

        <div class="form-group mb-3" id="group-assign-proj">
          <label class="form-label">Select Project Site (Optional)</label>
          <select id="asf-project" class="form-select">
            <option value="">-- Choose Site --</option>
            ${_projects.map(p => `<option value="${p.id}">${Helpers.escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>

        <div class="grid-2 mb-3">
          <div class="form-group">
            <label class="form-label">Assigned Date *</label>
            <input type="date" id="asf-assigned-date" class="form-input" value="${Helpers.todayIso()}" />
          </div>
          <div class="form-group">
            <label class="form-label">Expected Return Date</label>
            <input type="date" id="asf-expected-return" class="form-input" />
          </div>
        </div>

        <div class="form-group mb-3">
          <label class="form-label">Initial Condition *</label>
          <select id="asf-condition" class="form-select">
            <option value="New">Brand New</option>
            <option value="Good" selected>Good / Working</option>
            <option value="Fair">Fair / Worn</option>
            <option value="Damaged">Damaged / Needs Attention</option>
          </select>
        </div>

        <div class="form-group mb-3">
          <label class="form-label">Allocation Notes</label>
          <input type="text" id="asf-notes" class="form-input" placeholder="e.g. Handed over key, charger included" />
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="asf-submit-btn">Handover Asset</button>
      `
    });

    // Handle toggle between Employee and Project
    const typeRadios = document.getElementsByName('assign-type');
    const empGroup = document.getElementById('group-assign-emp');
    const projGroup = document.getElementById('group-assign-proj');

    typeRadios.forEach(radio => {
      radio.addEventListener('change', e => {
        const type = e.target.value;
        const projLabel = projGroup.querySelector('.form-label');
        if (type === 'Employee') {
          empGroup.style.display = 'flex';
          projGroup.style.display = 'flex';
          if (projLabel) projLabel.textContent = 'Select Project Site (Optional)';
        } else {
          empGroup.style.display = 'none';
          projGroup.style.display = 'flex';
          if (projLabel) projLabel.textContent = 'Select Project Site *';
        }
      });
    });

    document.getElementById('asf-submit-btn').addEventListener('click', async () => {
      const typeSelected = Array.from(typeRadios).find(r => r.checked).value;
      const assignedDate = document.getElementById('asf-assigned-date').value;
      
      let employeeId = null;
      let projectId = null;

      if (typeSelected === 'Employee') {
        const val = document.getElementById('asf-employee').value;
        if (!val) return Toast.error('Please select an employee.');
        employeeId = parseInt(val);

        // Fetch optional project site if selected
        const pVal = document.getElementById('asf-project').value;
        if (pVal) {
          projectId = parseInt(pVal);
        }
      } else {
        const val = document.getElementById('asf-project').value;
        if (!val) return Toast.error('Please select a project site.');
        projectId = parseInt(val);
      }

      if (!assignedDate) return Toast.error('Assigned Date is required.');

      const data = {
        assetId,
        assignedToType: typeSelected,
        employeeId,
        projectId,
        assignedDate,
        expectedReturnDate: document.getElementById('asf-expected-return').value || null,
        conditionOnAssign: document.getElementById('asf-condition').value,
        notes: document.getElementById('asf-notes').value.trim()
      };

      Helpers.setLoading('asf-submit-btn', true);
      const r = await API.assignAsset(data);
      Helpers.setLoading('asf-submit-btn', false);

      if (r.success) {
        Toast.success('Asset handover recorded.');
        Modal.close();
        await load();
      } else Toast.error(r.error);
    });
  }

  // ── Form Modal: Retrieve / Return Asset ────────────────────────────────────
  function openRetrieveModal(assetId) {
    Modal.open({
      title: 'Retrieve / Return Asset',
      size: 'modal-sm',
      body: `
        <div class="form-group mb-3">
          <label class="form-label">Return Date *</label>
          <input type="date" id="rtf-date" class="form-input" value="${Helpers.todayIso()}" />
        </div>

        <div class="form-group mb-3">
          <label class="form-label">Return Condition *</label>
          <select id="rtf-condition" class="form-select">
            <option value="Good" selected>Good / Working</option>
            <option value="Fair">Fair / Worn</option>
            <option value="Damaged">Damaged (Sends to Maintenance)</option>
          </select>
        </div>

        <div class="form-group mb-3">
          <label class="form-label">Return Notes</label>
          <input type="text" id="rtf-notes" class="form-input" placeholder="e.g. Returned with case, slight scratch" />
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="rtf-submit-btn">Return to Catalog</button>
      `
    });

    document.getElementById('rtf-submit-btn').addEventListener('click', async () => {
      const returnDate = document.getElementById('rtf-date').value;
      if (!returnDate) return Toast.error('Return Date is required.');

      const data = {
        assetId,
        actualReturnDate: returnDate,
        conditionOnReturn: document.getElementById('rtf-condition').value,
        notes: document.getElementById('rtf-notes').value.trim()
      };

      Helpers.setLoading('rtf-submit-btn', true);
      const r = await API.retrieveAsset(data);
      Helpers.setLoading('rtf-submit-btn', false);

      if (r.success) {
        Toast.success('Asset return cataloged.');
        Modal.close();
        await load();
      } else Toast.error(r.error);
    });
  }

  // ── Form Modal: Send to Maintenance ────────────────────────────────────────
  function openMaintenanceModal(assetId) {
    Modal.open({
      title: 'Send Asset for Maintenance',
      size: 'modal-sm',
      body: `
        <div class="form-group mb-3">
          <label class="form-label">Service Type *</label>
          <select id="mnf-type" class="form-select">
            <option value="Routine Service" selected>Routine Service / Tuning</option>
            <option value="Repair">Repair / Part Replacement</option>
            <option value="Calibration">Calibration / Safety Check</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div class="form-group mb-3">
          <label class="form-label">Service Provider / Workshop</label>
          <input type="text" id="mnf-provider" class="form-input" placeholder="e.g. Bosch Service Center, Local Tech" />
        </div>

        <div class="form-group mb-3">
          <label class="form-label">Sent Date *</label>
          <input type="date" id="mnf-date" class="form-input" value="${Helpers.todayIso()}" />
        </div>

        <div class="form-group mb-3">
          <label class="form-label">Description of Issue / Scope</label>
          <textarea id="mnf-remarks" class="form-input" rows="2" placeholder="e.g. Chuck is loose, carbon brushes replacement"></textarea>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-warning" id="mnf-submit-btn">Send to Repair</button>
      `
    });

    document.getElementById('mnf-submit-btn').addEventListener('click', async () => {
      const sentDate = document.getElementById('mnf-date').value;
      const maintenanceType = document.getElementById('mnf-type').value;

      if (!sentDate) return Toast.error('Sent Date is required.');

      const data = {
        assetId,
        maintenanceType,
        provider: document.getElementById('mnf-provider').value.trim(),
        sentDate,
        remarks: document.getElementById('mnf-remarks').value.trim()
      };

      Helpers.setLoading('mnf-submit-btn', true);
      const r = await API.startAssetMaintenance(data);
      Helpers.setLoading('mnf-submit-btn', false);

      if (r.success) {
        Toast.success('Asset marked in maintenance.');
        Modal.close();
        await load();
      } else Toast.error(r.error);
    });
  }

  // ── Form Modal: Complete Maintenance ───────────────────────────────────────
  function openCompleteMaintenanceModal(assetId) {
    Modal.open({
      title: 'Complete Asset Maintenance',
      size: 'modal-sm',
      body: `
        <div class="form-group mb-3">
          <label class="form-label">Return Date *</label>
          <input type="date" id="mcf-date" class="form-input" value="${Helpers.todayIso()}" />
        </div>

        <div class="form-group mb-3">
          <label class="form-label">Total Repair Cost (₹)</label>
          <input type="number" id="mcf-cost" class="form-input" placeholder="0.00" />
        </div>

        <div class="form-group mb-3">
          <label class="form-label">Resolution Comments</label>
          <textarea id="mcf-remarks" class="form-input" rows="2" placeholder="e.g. Carbon brushes changed, tested OK."></textarea>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-success" id="mcf-submit-btn">Mark Resolved</button>
      `
    });

    document.getElementById('mcf-submit-btn').addEventListener('click', async () => {
      const returnedDate = document.getElementById('mcf-date').value;
      if (!returnedDate) return Toast.error('Return Date is required.');

      const data = {
        assetId,
        returnedDate,
        cost: parseFloat(document.getElementById('mcf-cost').value) || 0,
        remarks: document.getElementById('mcf-remarks').value.trim()
      };

      Helpers.setLoading('mcf-submit-btn', true);
      const r = await API.completeAssetMaintenance(data);
      Helpers.setLoading('mcf-submit-btn', false);

      if (r.success) {
        Toast.success('Asset returned to available stock.');
        Modal.close();
        await load();
      } else Toast.error(r.error);
    });
  }

  // ── Modal: Asset History & Audit Log ───────────────────────────────────────
  async function openHistoryModal(asset) {
    // 1. Open skeleton modal
    Modal.open({
      title: `History Log: ${Helpers.escapeHtml(asset.name)}`,
      size: 'modal-md',
      body: `
        <p class="text-sm text-muted mb-3">Loading history streams for serial <strong>${Helpers.escapeHtml(asset.serial_no || 'N/A')}</strong>...</p>
        <div style="display:flex; justify-content:center; align-items:center; height:150px;">
          <span class="btn-loader" style="width:30px; height:30px; border-width:3px"></span>
        </div>
      `,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Close</button>`
    });

    try {
      // 2. Fetch history
      const r = await API.getAssetHistory(asset.id);
      if (!r.success) throw new Error(r.error);

      const assigns = r.assignments || [];
      const services = r.maintenance || [];

      // 3. Render content
      Modal.open({
        title: `History Log: ${Helpers.escapeHtml(asset.name)}`,
        size: 'modal-md',
        body: `
          <div class="asset-history-split">
            <!-- Allocations Column -->
            <div class="asset-history-column">
              <div class="asset-history-header">
                <span>Handover Logs</span>
                <span class="badge" style="background:var(--bg-subtle)">${assigns.length} total</span>
              </div>
              <div class="asset-history-timeline">
                ${assigns.length === 0 ? `
                  <p class="text-xs text-muted text-center p-3">No allocation history recorded.</p>
                ` : assigns.map(log => {
                  const targetStr = log.assigned_to_type === 'Employee' 
                    ? `👤 ${Helpers.escapeHtml(log.employee_name || 'Staff')}`
                    : `🏢 Site: ${Helpers.escapeHtml(log.project_name || 'Project')}`;
                  const rangeStr = log.actual_return_date 
                    ? `${Helpers.formatDateShort(log.assigned_date)} to ${Helpers.formatDateShort(log.actual_return_date)}`
                    : `Since ${Helpers.formatDateShort(log.assigned_date)} <span style="color:var(--info); font-size:10px; font-weight:700">ACTIVE</span>`;

                  return `
                    <div class="asset-history-card">
                      <div class="asset-history-meta">
                        <span>${rangeStr}</span>
                        <span>Assign Cond: <strong>${log.condition_on_assign}</strong></span>
                      </div>
                      <div class="asset-history-text">${targetStr}</div>
                      ${log.notes ? `<div class="asset-history-notes">${Helpers.escapeHtml(log.notes)}</div>` : ''}
                      ${log.condition_on_return ? `<div class="asset-history-meta mt-1">Returned Cond: <strong>${log.condition_on_return}</strong></div>` : ''}
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- Maintenance Column -->
            <div class="asset-history-column">
              <div class="asset-history-header">
                <span>Service Logs</span>
                <span class="badge" style="background:var(--bg-subtle)">${services.length} total</span>
              </div>
              <div class="asset-history-timeline">
                ${services.length === 0 ? `
                  <p class="text-xs text-muted text-center p-3">No maintenance logs recorded.</p>
                ` : services.map(log => {
                  const rangeStr = log.returned_date
                    ? `${Helpers.formatDateShort(log.sent_date)} to ${Helpers.formatDateShort(log.returned_date)}`
                    : `Sent ${Helpers.formatDateShort(log.sent_date)} <span style="color:var(--warning); font-size:10px; font-weight:700">IN SERVICE</span>`;

                  return `
                    <div class="asset-history-card">
                      <div class="asset-history-meta">
                        <span>${rangeStr}</span>
                        <span class="text-success font-700">${log.returned_date ? API.fmtRupees(log.cost) : 'Ongoing'}</span>
                      </div>
                      <div class="asset-history-text">🔧 ${Helpers.escapeHtml(log.maintenance_type)}</div>
                      <div style="font-size: 0.72rem; color:var(--text-muted)">Provider: ${Helpers.escapeHtml(log.provider || '—')}</div>
                      ${log.remarks ? `<div class="asset-history-notes">${Helpers.escapeHtml(log.remarks)}</div>` : ''}
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
        `,
        footer: `<button class="btn btn-secondary" onclick="Modal.close()">Close</button>`
      });
    } catch(err) {
      Toast.error('Failed to load history: ' + err.message);
      Modal.close();
    }
  }

  return { init, load };
})();

window.AssetsPage = AssetsPage;
