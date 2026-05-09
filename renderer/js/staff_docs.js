/**
 * LocalPayroll — Staff Documents Module
 * Manage employee documents, OCR extraction, and Excel export.
 */

const StaffDocsPage = (() => {
  const container = () => document.getElementById('page-staff-docs');
  const headerActs = () => document.getElementById('page-header-actions');
  
  let _docs = [];
  let _employees = [];
  let _selectedEmpId = null;
  let _viewMode = 'folders'; // 'folders' or 'employee'
  let _activeEmployee = null;
  let _searchQ = '';

  const CATEGORIES = {
    'Identity Documents': ['Aadhaar Card', 'PAN Card', 'Voter ID', 'Driving License'],
    'Bank Documents': ['Passbook', 'Cancelled Cheque', 'UPI QR / Details'],
    'Employment Documents': ['Offer Letter', 'Joining Form', 'Agreement', 'Experience Letter'],
    'Site / Safety Documents': ['Safety Certificate', 'Training Certificate', 'Site Pass']
  };

  async function init() {
    _selectedEmpId = AppState.get('selectedEmployeeId') || null;
    
    headerActs().innerHTML = `
      <div class="flex gap-2">
        <button id="export-ocr-btn" class="btn btn-secondary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>
          Export OCR Data
        </button>
        <button id="add-doc-btn" class="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Upload Document
        </button>
      </div>
    `;

    document.getElementById('add-doc-btn').addEventListener('click', () => openUploadModal());
    document.getElementById('export-ocr-btn').addEventListener('click', exportOcrData);

    await load();
  }

  async function load() {
    try {
      const empRes = await API.getEmployees({ status: 'active' });
      _employees = empRes.employees || [];

      const docRes = await API.getStaffDocs({}); // Load all docs to compute counts
      _docs = docRes.docs || [];

      // If we are in 'employee' mode, make sure the active employee still exists
      if (_viewMode === 'employee' && _activeEmployee) {
        _activeEmployee = _employees.find(e => e.id === _activeEmployee.id) || null;
        if (!_activeEmployee) _viewMode = 'folders';
      }

      render();
    } catch (err) {
      console.error('Error loading staff documents:', err);
      container().innerHTML = `<div class="empty-state"><p>Error loading documents. Please try again.</p></div>`;
    }
  }

  function render() {
    if (_viewMode === 'employee' && _activeEmployee) {
      renderEmployeeView();
    } else {
      renderFoldersView();
    }
  }

  function renderFoldersView() {
    const q = (_searchQ || '').toLowerCase();
    const filteredEmps = _employees.filter(e => 
      e.name.toLowerCase().includes(q) || (e.employee_id && e.employee_id.toLowerCase().includes(q))
    );

    // Group docs by employee for stats
    const statsMap = {};
    _docs.forEach(d => {
      if (!statsMap[d.employee_id]) statsMap[d.employee_id] = { total: 0, ocr: 0, lastDate: null };
      statsMap[d.employee_id].total++;
      if (d.ocr_status === 'completed') statsMap[d.employee_id].ocr++;
      if (!statsMap[d.employee_id].lastDate || d.upload_date > statsMap[d.employee_id].lastDate) {
        statsMap[d.employee_id].lastDate = d.upload_date;
      }
    });

    container().innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-bar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="doc-search" class="form-input" placeholder="Search staff folders..." value="${Helpers.escapeHtml(_searchQ)}" style="width:320px" />
          </div>
        </div>
        <div class="toolbar-right">
          <button id="add-doc-btn-main" class="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Upload Document
          </button>
        </div>
      </div>

      ${filteredEmps.length === 0 ? `
        <div class="empty-state">
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
          <h3>No employees found</h3>
          <p>Try a different search term or add more employees.</p>
        </div>
      ` : `
        <div class="folder-grid">
          ${filteredEmps.map(e => {
            const stats = statsMap[e.id] || { total: 0, ocr: 0, lastDate: null };
            return `
              <div class="folder-card" data-emp-id="${e.id}">
                <div class="folder-icon-wrap">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                </div>
                <div class="folder-info">
                  <div class="folder-name">${Helpers.escapeHtml(e.name)}</div>
                  <div class="folder-stats">
                    <span class="folder-stat-item">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
                      ${stats.total} docs
                    </span>
                    <span class="folder-stat-item">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                      ${stats.ocr} OCR
                    </span>
                    ${stats.lastDate ? `
                      <span class="folder-stat-item" title="Last Upload">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        ${Helpers.formatDateShort(stats.lastDate)}
                      </span>
                    ` : ''}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    `;

    // Bind events
    document.getElementById('doc-search').addEventListener('input', Helpers.debounce(e => {
      _searchQ = e.target.value;
      render();
    }, 200));

    document.getElementById('add-doc-btn-main').addEventListener('click', () => openUploadModal());

    container().querySelectorAll('.folder-card').forEach(card => {
      card.addEventListener('click', () => {
        const empId = parseInt(card.dataset.empId);
        _activeEmployee = _employees.find(e => e.id === empId);
        _viewMode = 'employee';
        render();
      });
    });
  }

  function renderEmployeeView() {
    const empDocs = _docs.filter(d => d.employee_id === _activeEmployee.id);
    const q = (_searchQ || '').toLowerCase();
    const filteredDocs = empDocs.filter(d => 
      (d.document_name || '').toLowerCase().includes(q) || (d.document_type || '').toLowerCase().includes(q)
    );

    container().innerHTML = `
      <div class="breadcrumb">
        <div class="breadcrumb-item">
          <span class="breadcrumb-btn" id="bc-root">Staff Documents</span>
        </div>
        <div class="breadcrumb-separator">/</div>
        <div class="breadcrumb-item active">
          <span>${Helpers.escapeHtml(_activeEmployee.name)}</span>
        </div>
      </div>

      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-bar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="doc-search-inner" class="form-input" placeholder="Search in this folder..." value="${Helpers.escapeHtml(_searchQ)}" style="width:280px" />
          </div>
        </div>
        <div class="toolbar-right">
          <button id="add-doc-btn-inner" class="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Upload Document
          </button>
        </div>
      </div>

      ${filteredDocs.length === 0 ? `
        <div class="empty-state">
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>
          <h3>No documents in this folder</h3>
          <p>Click "Upload Document" to add files for ${Helpers.escapeHtml(_activeEmployee.name)}.</p>
        </div>
      ` : `
        <div class="doc-grid">
          ${filteredDocs.map(d => renderDocCard(d)).join('')}
        </div>
      `}
    `;

    // Bind events
    document.getElementById('bc-root').addEventListener('click', () => {
      _viewMode = 'folders';
      _activeEmployee = null;
      render();
    });

    document.getElementById('doc-search-inner').addEventListener('input', Helpers.debounce(e => {
      _searchQ = e.target.value;
      render();
    }, 200));

    document.getElementById('add-doc-btn-inner').addEventListener('click', () => openUploadModal(_activeEmployee.id));

    container().querySelectorAll('.doc-preview-btn').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); previewDoc(parseInt(btn.dataset.id)); }));
    container().querySelectorAll('.doc-ocr-btn').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); runOcr(parseInt(btn.dataset.id)); }));
    container().querySelectorAll('.doc-del-btn').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); deleteDoc(parseInt(btn.dataset.id), btn.dataset.name); }));
  }

  function renderDocCard(d) {
    const ext = (d.document_name || '').split('.').pop().toLowerCase();
    const isPdf = ext === 'pdf';
    const today = new Date().toISOString().split('T')[0];
    const isExpired = d.expiry_date && d.expiry_date < today;
    
    let ocrLabel = '';
    if (d.ocr_status === 'completed') ocrLabel = '<span class="text-success">OCR Done</span>';
    else if (d.ocr_status === 'processing') ocrLabel = '<span class="text-warning">OCR...</span>';
    else if (d.ocr_status === 'failed') ocrLabel = '<span class="text-danger">OCR Fail</span>';
    else ocrLabel = '<span class="text-muted">OCR Pending</span>';

    return `
      <div class="doc-card">
        <div class="doc-card-header">
          <div class="doc-icon-wrap ${isPdf ? 'pdf' : 'img'}">
            ${isPdf ? `
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
            ` : `
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            `}
          </div>
          <div class="flex gap-1">
            <button class="btn btn-icon btn-ghost doc-preview-btn" data-id="${d.id}" title="Preview">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="btn btn-icon btn-ghost doc-del-btn" data-id="${d.id}" data-name="${Helpers.escapeHtml(d.document_name)}" title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </div>
        <div class="doc-card-body">
          <div class="doc-card-title">${Helpers.escapeHtml(d.document_name)}</div>
          <div class="doc-card-type">${Helpers.escapeHtml(d.document_type)} • ${Helpers.escapeHtml(d.category)}</div>
          
          <div class="mt-2 flex items-center justify-between">
            <span class="text-xs font-600 uppercase tracking-wider">${ocrLabel}</span>
            ${d.expiry_date ? `<span class="badge ${isExpired ? 'badge-danger' : 'badge-warning'}">${Helpers.formatDateShort(d.expiry_date)}</span>` : ''}
          </div>
        </div>
        <div class="doc-card-footer">
          <div class="doc-meta">${Helpers.formatDateShort(d.upload_date)}</div>
          <button class="btn btn-sm btn-accent doc-ocr-btn" data-id="${d.id}">
             ${d.ocr_status === 'completed' ? 'View OCR' : 'Run OCR'}
          </button>
        </div>
      </div>
    `;
  }

  function renderDocRow(d) {
    if (!d) return '';
    const today = new Date().toISOString().split('T')[0];
    const isExpired = d.expiry_date && d.expiry_date < today;
    const isExpiringSoon = d.expiry_date && !isExpired && (new Date(d.expiry_date) - new Date()) / (1000 * 60 * 60 * 24) < 30;

    let ocrBadge = '';
    if (d.ocr_status === 'completed') ocrBadge = '<span class="badge badge-success">OCR Done</span>';
    else if (d.ocr_status === 'processing') ocrBadge = '<span class="badge badge-warning">OCR...</span>';
    else if (d.ocr_status === 'failed') ocrBadge = '<span class="badge badge-danger">OCR Failed</span>';
    else ocrBadge = '<span class="badge badge-muted">Pending</span>';

    return `
      <tr>
        <td>
          <div class="flex items-center gap-2">
            ${fileIcon(d.document_name || 'unknown')}
            <span class="font-600">${Helpers.escapeHtml(d.document_name || 'Unnamed Document')}</span>
          </div>
        </td>
        <td class="td-muted">${Helpers.escapeHtml(d.employee_name || 'Unknown')}</td>
        <td>
          <div class="flex flex-col">
            <span>${d.document_type || '—'}</span>
            <span class="text-xs text-muted">${d.category || '—'}</span>
          </div>
        </td>
        <td class="td-muted">${Helpers.formatDate(d.upload_date)}</td>
        <td>
          ${d.expiry_date ? `
            <div class="flex flex-col">
              <span class="${isExpired ? 'text-danger' : (isExpiringSoon ? 'text-warning' : 'text-muted')}">${Helpers.formatDate(d.expiry_date)}</span>
              ${isExpired ? '<span class="text-xs text-danger font-700">EXPIRED</span>' : (isExpiringSoon ? '<span class="text-xs text-warning font-700">EXPIRING SOON</span>' : '')}
            </div>
          ` : '—'}
        </td>
        <td>${ocrBadge}</td>
        <td style="text-align:right">
          <div class="flex gap-2 justify-end">
            <button class="btn btn-sm btn-secondary doc-preview-btn" data-id="${d.id}" title="Preview">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="btn btn-sm btn-accent doc-ocr-btn" data-id="${d.id}" title="Run OCR / View Data">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13.8 12H3"/></svg>
            </button>
            <button class="btn btn-sm btn-danger doc-del-btn" data-id="${d.id}" data-name="${Helpers.escapeHtml(d.document_name || '')}" title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  function fileIcon(name) {
    if (!name) return '';
    const parts = name.split('.');
    const ext = parts.length > 1 ? parts.pop().toLowerCase() : '';
    if (ext === 'pdf') return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>';
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
  }


  async function openUploadModal(empIdOverride = null) {
    const preSelectedEmpId = empIdOverride || _selectedEmpId;
    Modal.open({
      title: 'Upload Staff Document',
      size: 'modal-lg',
      body: `
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Employee *</label>
            <select id="uf-emp" class="form-select">
              <option value="">Select Employee</option>
              ${_employees.map(e => `<option value="${e.id}" ${parseInt(preSelectedEmpId) === e.id ? 'selected' : ''}>${Helpers.escapeHtml(e.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Category *</label>
            <select id="uf-cat" class="form-select">
              ${Object.keys(CATEGORIES).map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row mt-3">
          <div class="form-group">
            <label class="form-label">Document Type *</label>
            <select id="uf-type" class="form-select"></select>
          </div>
          <div class="form-group">
            <label class="form-label">Expiry Date (optional)</label>
            <input id="uf-expiry" type="date" class="form-input" />
          </div>
        </div>
        <div class="form-group mt-3">
          <label class="form-label">Select File * (JPG, PNG, PDF)</label>
          <div class="upload-dropzone" id="uf-dropzone">
             <div class="text-center">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-muted"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <div class="mt-2 font-600">Click to browse or Drag & Drop</div>
                <div class="text-xs text-muted mt-1" id="uf-file-name">No file selected</div>
             </div>
             <input type="file" id="uf-file-input" hidden accept=".jpg,.jpeg,.png,.pdf" />
          </div>
        </div>
        <div id="uf-error" class="form-error mt-3" hidden></div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="uf-save">Upload Document</button>
      `
    });

    const catSelect = document.getElementById('uf-cat');
    const typeSelect = document.getElementById('uf-type');
    const updateTypes = () => {
      const types = CATEGORIES[catSelect.value] || [];
      typeSelect.innerHTML = types.map(t => `<option value="${t}">${t}</option>`).join('');
    };
    catSelect.addEventListener('change', updateTypes);
    updateTypes();

    const dropzone = document.getElementById('uf-dropzone');
    const fileInput = document.getElementById('uf-file-input');
    const fileNameDisplay = document.getElementById('uf-file-name');
    let selectedFilePath = null;

    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => {
      if (e.target.files.length > 0) {
        selectedFilePath = e.target.files[0].path;
        fileNameDisplay.textContent = e.target.files[0].name;
        fileNameDisplay.classList.remove('text-muted');
        fileNameDisplay.classList.add('text-accent');
      }
    });

    document.getElementById('uf-save').addEventListener('click', async () => {
      const empId = document.getElementById('uf-emp').value;
      const cat = document.getElementById('uf-cat').value;
      const type = document.getElementById('uf-type').value;
      const expiry = document.getElementById('uf-expiry').value;
      const errEl = document.getElementById('uf-error');

      if (!empId || !selectedFilePath) {
        errEl.textContent = 'Please select an employee and a file.';
        errEl.hidden = false;
        return;
      }

      Helpers.setLoading('uf-save', true);
      const res = await API.uploadStaffDoc({ employeeId: empId, category: cat, docType: type, filePath: selectedFilePath, expiryDate: expiry });
      Helpers.setLoading('uf-save', false);

      if (res.success) {
        Modal.close();
        Toast.success('Document uploaded successfully.');
        load();
      } else {
        errEl.textContent = res.error;
        errEl.hidden = false;
      }
    });
  }

  async function previewDoc(id) {
    const res = await API.previewStaffDoc(id);
    if (!res.success) { Toast.error(res.error); return; }

    const ext = res.filePath.split('.').pop().toLowerCase();
    let body = '';
    
    if (ext === 'pdf') {
      body = `<iframe src="file://${res.filePath}" style="width:100%;height:500px;border:none"></iframe>`;
    } else {
      body = `<div class="text-center"><img src="file://${res.filePath}" style="max-width:100%;max-height:500px;border-radius:8px" /></div>`;
    }

    Modal.open({
      title: 'Document Preview',
      size: 'modal-lg',
      body: body,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Close</button>`
    });
  }

  async function runOcr(id) {
    const doc = _docs.find(d => d.id === id);
    if (!doc) return;

    if (doc.ocr_status === 'completed' && doc.ocr_data) {
      showOcrDataModal(doc);
      return;
    }

    Modal.open({
      title: 'OCR Extraction',
      body: `
        <div class="text-center p-4">
          <div class="btn-loader" style="width:40px;height:40px;margin:0 auto"></div>
          <div class="mt-3 font-600">Extracting data from ${doc.document_type}...</div>
          <p class="text-sm text-muted">This may take a few seconds.</p>
        </div>
      `,
      footer: ''
    });

    const res = await API.runStaffDocOcr(id);
    Modal.close();

    if (res.success) {
      doc.ocr_status = 'completed';
      doc.ocr_data = JSON.stringify(res.extracted);
      showOcrDataModal(doc);
      load();
    } else {
      Toast.error(res.error);
      load();
    }
  }

  function showOcrDataModal(doc) {
    const data = JSON.parse(doc.ocr_data || '{}');
    const fields = doc.document_type === 'Aadhaar Card' ? ['aadhaar_no', 'dob', 'gender', 'address'] :
                   doc.document_type === 'PAN Card' ? ['pan_no', 'father_name', 'dob'] :
                   (doc.document_type === 'Passbook' || doc.document_type === 'Cancelled Cheque') ? ['account_holder_name', 'account_no', 'ifsc_code', 'bank_name'] :
                   Object.keys(data);

    Modal.open({
      title: `OCR Data — ${doc.document_type}`,
      size: 'modal-md',
      body: `
        <div class="alert alert-info mb-3">
           <p class="text-sm">Verify and edit the extracted data below. Click "Save & Map" to update the employee profile.</p>
        </div>
        <div id="ocr-fields">
          ${fields.map(f => `
            <div class="form-group mb-2">
              <label class="form-label text-xs uppercase">${f.replace(/_/g, ' ')}</label>
              <input class="form-input ocr-input" data-key="${f}" value="${Helpers.escapeHtml(data[f] || '')}" />
            </div>
          `).join('')}
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Close</button>
        <button class="btn btn-primary" id="ocr-save-btn">Save & Map to Profile</button>
      `
    });

    document.getElementById('ocr-save-btn').addEventListener('click', async () => {
      const updatedData = {};
      document.querySelectorAll('.ocr-input').forEach(input => {
        updatedData[input.dataset.key] = input.value.trim();
      });

      Helpers.setLoading('ocr-save-btn', true);
      await API.updateStaffDocOcr({ docId: doc.id, ocrData: updatedData });
      await API.mapOcrToProfile({ employeeId: doc.employee_id, data: updatedData });
      Helpers.setLoading('ocr-save-btn', false);

      Modal.close();
      Toast.success('Data saved and profile updated.');
      load();
    });
  }

  async function exportOcrData() {
    const res = await API.exportStaffOcrExcel();
    if (res.success) Toast.success('OCR Data exported successfully!');
    else if (res.error !== 'Cancelled.') Toast.error(res.error);
  }

  function deleteDoc(id, name) {
    Modal.confirm(`Delete document <strong>${name}</strong>?`, async () => {
      const res = await API.deleteStaffDoc(id);
      if (res.success) {
        Toast.success('Document deleted.');
        load();
      } else {
        Toast.error(res.error);
      }
    }, { danger: true });
  }

  return { init };
})();
