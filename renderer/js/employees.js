/**
 * LocalPayroll — Employees Page
 * Add / Edit / Delete employees. Live search. Employee detail view.
 */

const EmployeesPage = (() => {
  const container   = () => document.getElementById('page-employees');
  const headerActs  = () => document.getElementById('page-header-actions');
  let _employees    = [];
  let _searchQ      = '';

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    headerActs().innerHTML = `<button id="add-employee-btn" class="btn btn-primary">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add Employee
    </button>`;
    document.getElementById('add-employee-btn').addEventListener('click', () => openForm());
    await load();
  }

  // ── Load list ─────────────────────────────────────────────────────────────
  async function load() {
    const res = await API.getEmployees({ search: _searchQ, status: 'active' });
    _employees = res.employees || [];
    render();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function render() {
    const filtered = _employees.filter(e =>
      !_searchQ ||
      e.name.toLowerCase().includes(_searchQ.toLowerCase()) ||
      (e.phone || '').includes(_searchQ)
    );

    container().innerHTML = `
      <!-- Toolbar -->
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-bar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="emp-search" class="form-input" placeholder="Search by name or phone..." value="${Helpers.escapeHtml(_searchQ)}" style="width:260px" />
          </div>
          <span class="text-muted text-sm">${filtered.length} employee${filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <!-- Table -->
      ${filtered.length === 0 ? emptyState() : `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Role / Designation</th>
                ${AppState.get('user')?.role !== 'hr' || AppState.get('settings')?.hr_edit_salary === '1' ? '<th>Per Day Salary</th>' : ''}
                <th style="text-align:center">Running Balance</th>
                <th>Joining Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((e, i) => `
                <tr>
                  <td class="td-muted">${i + 1}</td>
                  <td>
                    <div class="flex items-center gap-2">
                      <div class="user-avatar" style="background:${avatarColor(e.name)};width:30px;height:30px;font-size:0.72rem">
                        ${e.name[0].toUpperCase()}
                      </div>
                      <span class="font-600">${Helpers.escapeHtml(e.name)}</span>
                    </div>
                  </td>
                  <td class="td-muted">${Helpers.escapeHtml(e.phone || '—')}</td>
                  <td class="td-muted">${Helpers.escapeHtml(e.role || '—')}</td>
                  ${AppState.get('user')?.role !== 'hr' || AppState.get('settings')?.hr_edit_salary === '1' ? `<td><span class="amount amount-success">${API.fmtRupees(e.salary)}</span></td>` : ''}
                  <td style="text-align:center">
                    <div class="flex flex-col items-center">
                      <span class="amount ${e.balance < 0 ? 'amount-danger' : (e.balance > 0 ? 'amount-success' : 'text-muted')} font-600">
                         ${e.balance === 0 ? '₹0.00' : (e.balance < 0 ? '-' : '+') + API.fmtRupees(Math.abs(e.balance))}
                      </span>
                      <span class="text-xs ${e.balance < 0 ? 'text-danger' : (e.balance > 0 ? 'text-success' : 'text-muted')}" style="font-size:9px; font-weight:700; text-transform:uppercase; margin-top:2px">
                         ${e.balance < 0 ? 'Advance' : (e.balance > 0 ? 'Pending' : 'Settled')}
                      </span>
                    </div>
                  </td>
                  <td class="td-muted">${Helpers.formatDate(e.joining_date)}</td>
                  <td><span class="badge ${e.status === 'active' ? 'badge-success' : 'badge-muted'}">${e.status}</span></td>
                  <td>
                    <div class="flex gap-2">
                      <button class="btn btn-sm btn-secondary emp-view-btn" data-id="${e.id}" title="View Details">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </button>
                      <button class="btn btn-sm btn-secondary emp-edit-btn" data-id="${e.id}" title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      ${AppState.get('user')?.role === 'admin' || AppState.get('settings')?.hr_delete_access === '1' ? `
                      <button class="btn btn-sm btn-danger emp-del-btn" data-id="${e.id}" data-name="${Helpers.escapeHtml(e.name)}" title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    `;

    // Bind search
    const searchEl = document.getElementById('emp-search');
    searchEl?.addEventListener('input', Helpers.debounce(e => {
      _searchQ = e.target.value;
      render();
    }, 200));

    // Bind action buttons
    container().querySelectorAll('.emp-view-btn').forEach(btn =>
      btn.addEventListener('click', () => viewEmployee(parseInt(btn.dataset.id))));
    container().querySelectorAll('.emp-edit-btn').forEach(btn =>
      btn.addEventListener('click', () => openForm(parseInt(btn.dataset.id))));
    container().querySelectorAll('.emp-del-btn').forEach(btn =>
      btn.addEventListener('click', () => deleteEmployee(parseInt(btn.dataset.id), btn.dataset.name)));
  }

  function emptyState() {
    return `<div class="empty-state">
      <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
      <h3>No employees found</h3>
      <p>${_searchQ ? 'No results match your search.' : 'Click "Add Employee" to get started.'}</p>
    </div>`;
  }

  // ── Avatar color from name ────────────────────────────────────────────────
  function avatarColor(name) {
    const colors = ['#6366f1','#8b5cf6','#ec4899','#10b981','#f59e0b','#ef4444','#3b82f6'];
    let h = 0;
    for (let c of name) h = (h * 31 + c.charCodeAt(0)) % colors.length;
    return colors[Math.abs(h)];
  }


  // -- Add / Edit Form -------------------------------------------------------
  async function openForm(id = null) {
    let emp = null;
    if (id) { const res = await API.getEmployee(id); emp = res.employee; }
    const isEdit = !!emp;
    const salaryRupees = emp ? API.toRupees(emp.salary) : '';

    Modal.open({
      title: isEdit ? 'Edit Employee — ' + emp.name : 'Add New Employee',
      size: 'modal-lg',
      body: buildFormBody(emp, isEdit, salaryRupees),
      footer: `
        <button class="btn btn-secondary" id="ef-cancel">Cancel</button>
        <button class="btn btn-primary" id="ef-save">
          <span class="btn-text">${isEdit ? 'Save Changes' : 'Add Employee'}</span>
          <span class="btn-loader" hidden></span>
        </button>`
    });

    document.getElementById('ef-cancel').addEventListener('click', Modal.close);
    document.getElementById('ef-save').addEventListener('click', () => saveEmployee(id));

    // OCR section toggle
    const ocrBody  = document.getElementById('ocr-section-body');
    const ocrArrow = document.getElementById('ocr-toggle-arrow');
    let ocrExpanded = true;
    document.getElementById('ocr-section-toggle').addEventListener('click', () => {
      ocrExpanded = !ocrExpanded;
      ocrBody.style.display = ocrExpanded ? '' : 'none';
      ocrArrow.style.transform = ocrExpanded ? '' : 'rotate(-90deg)';
    });

    // File drop zone
    const dropzone    = document.getElementById('ocr-dropzone');
    const fileInput   = document.getElementById('ocr-file-input');
    const dropContent = document.getElementById('ocr-drop-content');
    const previewWrap = document.getElementById('ocr-preview-wrap');
    const previewImg  = document.getElementById('ocr-preview-img');
    const previewName = document.getElementById('ocr-preview-name');
    const runBtn      = document.getElementById('ocr-run-btn');
    let _filePath = null;

    const setFile = (file) => {
      if (!file) return;
      _filePath = file.path;
      previewName.textContent = file.name;
      const ext = file.name.split('.').pop().toLowerCase();
      previewImg.style.display = ['jpg','jpeg','png'].includes(ext) ? '' : 'none';
      if (['jpg','jpeg','png'].includes(ext)) previewImg.src = URL.createObjectURL(file);
      dropContent.style.display = 'none';
      previewWrap.style.display = '';
      runBtn.disabled = false;
    };

    dropzone.addEventListener('click', e => {
      if (!e.target.closest('#ocr-clear-btn') && !e.target.closest('#ocr-preview-wrap')) fileInput.click();
    });
    fileInput.addEventListener('change', e => { if (e.target.files[0]) setFile(e.target.files[0]); });
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('ocr-dropzone-active'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('ocr-dropzone-active'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault(); dropzone.classList.remove('ocr-dropzone-active');
      if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
    });

    document.getElementById('ocr-clear-btn').addEventListener('click', e => {
      e.stopPropagation();
      _filePath = null; fileInput.value = '';
      previewImg.src = ''; previewWrap.style.display = 'none'; dropContent.style.display = '';
      runBtn.disabled = true;
      const rc = document.getElementById('ocr-result-card');
      const cb = document.getElementById('ocr-confidence-bar-wrap');
      if (rc) rc.style.display = 'none';
      if (cb) cb.style.display = 'none';
      setOcrStatus('idle', 'Upload to auto-fill');
    });

    runBtn.addEventListener('click', async () => {
      if (!_filePath) return;
      const docType = document.getElementById('ocr-doc-type').value;
      runBtn.disabled = true;
      document.getElementById('ocr-loader').style.display = 'flex';
      document.getElementById('ocr-result-card').style.display = 'none';
      document.getElementById('ocr-confidence-bar-wrap').style.display = 'none';
      setOcrStatus('processing', '🔄 OCR Processing…');
      const res = await API.runInlineOcr(_filePath, docType);
      document.getElementById('ocr-loader').style.display = 'none';
      runBtn.disabled = false;
      if (!res.success) {
        setOcrStatus('failed', '❌ OCR Failed');
        Toast.error('OCR failed: ' + res.error);
        return;
      }
      setOcrStatus('done', '✅ OCR Completed');
      showConfidenceBar(res.confidence || 0);
      showOcrResults(res.extracted, docType, res.confidence || 0, id);
    });
  }

  function buildFormBody(emp, isEdit, salaryRupees) {
    const v   = (f) => Helpers.escapeHtml(emp?.[f] || '');
    const sel = (f, o) => emp?.[f] === o ? 'selected' : '';
    return `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Full Name *</label>
          <input id="ef-name" class="form-input" placeholder="e.g. Ravi Kumar" value="${v('name')}" /></div>
        <div class="form-group"><label class="form-label">Phone Number</label>
          <input id="ef-phone" class="form-input" placeholder="10-digit mobile number" value="${v('phone')}" /></div>
      </div>
      <div class="form-row mt-3">
        <div class="form-group"><label class="form-label">Role / Designation</label>
          <input id="ef-role" class="form-input" placeholder="e.g. Driver, Cook, Guard" value="${v('role')}" /></div>
        <div class="form-group"><label class="form-label">Per Day Salary (₹) *</label>
          <input id="ef-salary" class="form-input" type="number" min="0" step="50" placeholder="e.g. 400" value="${salaryRupees}" ${(AppState.get('user')?.role === 'hr' && AppState.get('settings')?.hr_edit_salary !== '1') ? 'readonly style="background:var(--bg-subtle);cursor:not-allowed" title="Only Admin can edit salary"' : ''} /></div>
      </div>
      <div class="form-row mt-3">
        <div class="form-group"><label class="form-label">Joining Date</label>
          <input id="ef-joining" class="form-input" type="date" value="${emp?.joining_date || ''}" /></div>
        <div class="form-group"><label class="form-label">Status</label>
          <select id="ef-status" class="form-select">
            <option value="active" ${(emp?.status||'active')==='active'?'selected':''}>Active</option>
            <option value="inactive" ${emp?.status==='inactive'?'selected':''}>Inactive</option>
          </select></div>
      </div>
      <div class="form-group mt-3"><label class="form-label">Notes (optional)</label>
        <input id="ef-notes" class="form-input" placeholder="Any additional information" value="${v('notes')}" /></div>

      <div class="ocr-section mt-4">
        <div class="ocr-section-header" id="ocr-section-toggle">
          <div class="ocr-section-title">
            <div class="ocr-icon-wrap">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            </div>
            <span>Identity Document Upload &amp; OCR Auto-Fill</span>
            <span class="ocr-badge-new">SMART</span>
          </div>
          <div class="flex items-center gap-2">
            <span id="ocr-status-badge" class="ocr-status-badge ocr-status-idle">Upload to auto-fill</span>
            <svg id="ocr-toggle-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition:transform 0.3s"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        </div>
        <div id="ocr-section-body" class="ocr-section-body">
          <div class="form-row mb-3">
            <div class="form-group"><label class="form-label">Document Type</label>
              <select id="ocr-doc-type" class="form-select">
                <option value="Aadhaar Card">Aadhaar Card</option>
                <option value="PAN Card">PAN Card</option>
                <option value="Driving License">Driving License</option>
                <option value="Voter ID">Voter ID</option>
                <option value="Passbook">Passbook / Cancelled Cheque</option>
              </select></div>
            <div class="form-group flex items-end">
              <div class="ocr-hint-box">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Upload a clear JPG/PNG image. OCR will extract &amp; auto-fill fields below.
              </div></div>
          </div>
          <div class="ocr-dropzone" id="ocr-dropzone">
            <input type="file" id="ocr-file-input" hidden accept=".jpg,.jpeg,.png,.pdf" />
            <div id="ocr-drop-content">
              <div class="ocr-drop-icon">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </div>
              <div class="ocr-drop-title">Drag &amp; Drop or <span class="ocr-browse-link">Browse File</span></div>
              <div class="ocr-drop-sub">JPG, PNG, PDF &bull; Camera capture supported on mobile</div>
            </div>
            <div id="ocr-preview-wrap" style="display:none" class="ocr-preview-wrap">
              <img id="ocr-preview-img" src="" alt="Preview" class="ocr-preview-img" />
              <div class="ocr-preview-overlay">
                <span id="ocr-preview-name" class="ocr-preview-name"></span>
                <button id="ocr-clear-btn" class="ocr-clear-btn">&times;</button>
              </div>
            </div>
          </div>
          <div class="flex gap-2 mt-3 items-center" style="flex-wrap:wrap">
            <button id="ocr-run-btn" class="btn btn-accent" disabled>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13.8 12H3"/></svg>
              Run OCR &amp; Auto-Fill
            </button>
            <div id="ocr-loader" class="ocr-loader" style="display:none">
              <div class="ocr-loader-dots"><span></span><span></span><span></span></div>
              <span class="text-sm text-muted">Extracting data…</span>
            </div>
            <div id="ocr-confidence-bar-wrap" style="display:none" class="ocr-confidence-wrap">
              <span class="text-xs text-muted">Confidence:</span>
              <div class="ocr-conf-bar"><div id="ocr-conf-fill" class="ocr-conf-fill"></div></div>
              <span id="ocr-conf-pct" class="text-xs font-600"></span>
            </div>
          </div>
          <div id="ocr-result-card" class="ocr-result-card" style="display:none">
            <div class="ocr-result-header">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Extracted Data &mdash; Review &amp; Edit before saving</span>
            </div>
            <div id="ocr-result-fields" class="ocr-result-fields"></div>
            <div id="ocr-dup-warnings" class="ocr-dup-warnings" style="display:none"></div>
          </div>
        </div>
      </div>

      <div class="divider mt-4"></div>
      <h4 class="text-sm font-700 mb-2 uppercase text-muted">Identity &amp; Bank Details (Auto-filled by OCR)</h4>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Aadhaar Number</label>
          <div class="input-with-badge-wrap">
            <input id="ef-aadhaar" class="form-input" placeholder="XXXX XXXX XXXX" value="${v('aadhaar_no')}" />
            <span id="dup-badge-aadhaar" class="dup-badge" style="display:none">⚠ Duplicate</span>
          </div></div>
        <div class="form-group"><label class="form-label">PAN Number</label>
          <div class="input-with-badge-wrap">
            <input id="ef-pan" class="form-input" placeholder="ABCDE1234F" value="${v('pan_no')}" />
            <span id="dup-badge-pan" class="dup-badge" style="display:none">⚠ Duplicate</span>
          </div></div>
      </div>
      <div class="form-row mt-3">
        <div class="form-group"><label class="form-label">DOB</label>
          <input id="ef-dob" class="form-input" placeholder="DD/MM/YYYY" value="${v('dob')}" /></div>
        <div class="form-group"><label class="form-label">Gender</label>
          <select id="ef-gender" class="form-select">
            <option value="">Select</option>
            <option value="Male" ${sel('gender','Male')}>Male</option>
            <option value="Female" ${sel('gender','Female')}>Female</option>
          </select></div>
      </div>
      <div class="form-group mt-3"><label class="form-label">Father Name</label>
        <input id="ef-father" class="form-input" placeholder="Father's name (from PAN)" value="${v('father_name')}" /></div>
      <div class="form-group mt-3"><label class="form-label">Address</label>
        <input id="ef-address" class="form-input" value="${v('address')}" /></div>
      <div class="form-row mt-3">
        <div class="form-group"><label class="form-label">Bank Name</label>
          <input id="ef-bank-name" class="form-input" value="${v('bank_name')}" /></div>
        <div class="form-group"><label class="form-label">Account Number</label>
          <div class="input-with-badge-wrap">
            <input id="ef-acc-no" class="form-input" value="${v('account_no')}" />
            <span id="dup-badge-account" class="dup-badge" style="display:none">⚠ Duplicate</span>
          </div></div>
      </div>
      <div class="form-row mt-3">
        <div class="form-group"><label class="form-label">IFSC Code</label>
          <input id="ef-ifsc" class="form-input" value="${v('ifsc_code')}" /></div>
        <div class="form-group"><label class="form-label">Account Holder Name</label>
          <input id="ef-acc-holder" class="form-input" value="${v('account_holder_name')}" /></div>
      </div>
      ${!isEdit ? `<div class="form-group mt-3">
        <label class="form-label text-accent">Opening Balance (₹)</label>
        <input id="ef-balance" type="number" class="form-input" placeholder="e.g. -2000 if they owe you" value="0" />
        <div class="text-xs text-muted mt-1">Positive = Company owes employee, Negative = Employee owes company (Advance).</div>
      </div>` : ''}
      <div id="ef-error" class="form-error mt-3" hidden></div>
    `;
  }

  function setOcrStatus(type, text) {
    const el = document.getElementById('ocr-status-badge');
    if (!el) return;
    el.textContent = text;
    const map = { processing:'ocr-status-processing', done:'ocr-status-done', failed:'ocr-status-failed', idle:'ocr-status-idle' };
    el.className = 'ocr-status-badge ' + (map[type] || 'ocr-status-idle');
  }

  function showConfidenceBar(conf) {
    const wrap = document.getElementById('ocr-confidence-bar-wrap');
    const fill = document.getElementById('ocr-conf-fill');
    const pct  = document.getElementById('ocr-conf-pct');
    if (!wrap) return;
    wrap.style.display = 'flex';
    fill.style.width = conf + '%';
    fill.className = 'ocr-conf-fill ' + (conf >= 70 ? 'ocr-conf-high' : conf >= 40 ? 'ocr-conf-mid' : 'ocr-conf-low');
    pct.textContent = conf + '%';
    pct.className   = 'text-xs font-600 ' + (conf >= 70 ? 'text-success' : conf >= 40 ? 'text-warning' : 'text-danger');
  }

  const OCR_FIELD_MAP = {
    name:                { id:'ef-name',       label:'Full Name' },
    aadhaar_no:          { id:'ef-aadhaar',    label:'Aadhaar Number' },
    pan_no:              { id:'ef-pan',         label:'PAN Number' },
    dob:                 { id:'ef-dob',         label:'DOB' },
    gender:              { id:'ef-gender',      label:'Gender' },
    address:             { id:'ef-address',     label:'Address' },
    father_name:         { id:'ef-father',      label:'Father Name' },
    bank_name:           { id:'ef-bank-name',   label:'Bank Name' },
    account_no:          { id:'ef-acc-no',      label:'Account Number' },
    ifsc_code:           { id:'ef-ifsc',        label:'IFSC Code' },
    account_holder_name: { id:'ef-acc-holder',  label:'Account Holder' },
  };

  function showOcrResults(extracted, docType, conf, editId) {
    const card      = document.getElementById('ocr-result-card');
    const container = document.getElementById('ocr-result-fields');
    const dupWarn   = document.getElementById('ocr-dup-warnings');
    card.style.display = '';
    dupWarn.innerHTML  = '';
    dupWarn.style.display = 'none';

    const lowConf   = conf < 50;
    const validKeys = Object.keys(extracted).filter(k => !k.startsWith('_') && extracted[k]);

    if (!validKeys.length) {
      container.innerHTML = '<p class="text-muted text-sm" style="padding:8px">No data could be extracted. Ensure the image is clear and well-lit.</p>';
      return;
    }

    let html = '';
    validKeys.forEach(key => {
      const map = OCR_FIELD_MAP[key];
      if (!map) return;
      const val  = extracted[key];
      const warn = lowConf
        || (key === 'aadhaar_no' && !/^d{4}s?d{4}s?d{4}$/.test(val))
        || (key === 'pan_no'     && !/^[A-Z]{5}d{4}[A-Z]$/i.test(val));
      const warnHtml = warn ? ' <span class="ocr-warn-icon" title="Low confidence">⚠</span>' : '';
      html += '<div class="ocr-field-row' + (warn ? ' ocr-field-warn' : '') + '">'
            + '<div class="ocr-field-label">' + map.label + warnHtml + '</div>'
            + '<input class="form-input ocr-autofill-input" data-ocr-key="' + key + '" value="' + Helpers.escapeHtml(val) + '" />'
            + '</div>';
    });
    container.innerHTML = html;

    // Auto-fill form fields
    validKeys.forEach(key => {
      const map = OCR_FIELD_MAP[key];
      if (!map) return;
      const el = document.getElementById(map.id);
      if (!el) return;
      if (el.tagName === 'SELECT') {
        const opt = [...el.options].find(o => o.value.toLowerCase() === extracted[key].toLowerCase());
        if (opt) el.value = opt.value;
      } else {
        el.value = extracted[key];
      }
      el.classList.add('ocr-autofilled');
      setTimeout(() => el.classList.remove('ocr-autofilled'), 2500);
    });

    // Live sync: editing in result card updates form
    container.querySelectorAll('.ocr-autofill-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const map = OCR_FIELD_MAP[inp.dataset.ocrKey];
        if (!map) return;
        const formEl = document.getElementById(map.id);
        if (formEl) formEl.value = inp.value;
      });
    });

    // Duplicate detection
    [
      { field: 'aadhaar_no', val: extracted.aadhaar_no, badge: 'dup-badge-aadhaar', label: 'Aadhaar' },
      { field: 'pan_no',     val: extracted.pan_no,     badge: 'dup-badge-pan',     label: 'PAN' },
      { field: 'account_no', val: extracted.account_no, badge: 'dup-badge-account', label: 'Account No' },
    ].forEach(async ({ field, val, badge, label }) => {
      if (!val) return;
      const r = await API.checkDuplicateEmployee(field, val, editId);
      if (r.duplicate) {
        const b = document.getElementById(badge);
        if (b) { b.textContent = '⚠ ' + label + ' used by ' + r.employeeName; b.style.display = ''; }
        dupWarn.innerHTML += '<div class="ocr-dup-warn-row">⚠ <strong>' + label + '</strong> already registered to <strong>'
                           + Helpers.escapeHtml(r.employeeName) + '</strong>. Please verify before saving.</div>';
        dupWarn.style.display = '';
      }
    });
  }

  async function saveEmployee(id) {
    const errEl = document.getElementById('ef-error');
    errEl.hidden = true;
    const data = {
      name:                document.getElementById('ef-name').value.trim(),
      phone:               document.getElementById('ef-phone').value.trim(),
      role:                document.getElementById('ef-role').value.trim(),
      salary:              document.getElementById('ef-salary').value,
      fixedGrossSalary:    0,
      joiningDate:         document.getElementById('ef-joining').value,
      status:              document.getElementById('ef-status').value,
      notes:               document.getElementById('ef-notes').value.trim(),
      aadhaar_no:          document.getElementById('ef-aadhaar').value.trim(),
      pan_no:              document.getElementById('ef-pan').value.trim(),
      dob:                 document.getElementById('ef-dob').value.trim(),
      gender:              document.getElementById('ef-gender').value,
      father_name:         document.getElementById('ef-father')?.value.trim() || '',
      address:             document.getElementById('ef-address').value.trim(),
      bank_name:           document.getElementById('ef-bank-name').value.trim(),
      account_no:          document.getElementById('ef-acc-no').value.trim(),
      ifsc_code:           document.getElementById('ef-ifsc').value.trim(),
      account_holder_name: document.getElementById('ef-acc-holder').value.trim(),
      balance:             id ? 0 : (parseFloat(document.getElementById('ef-balance')?.value) || 0)
    };
    if (!data.name) { errEl.textContent = 'Employee name is required.'; errEl.hidden = false; return; }
    Helpers.setLoading('ef-save', true);
    const res = id ? await API.updateEmployee(id, data) : await API.createEmployee(data);
    Helpers.setLoading('ef-save', false);
    if (!res.success) { errEl.textContent = res.error; errEl.hidden = false; return; }
    Modal.close();
    Toast.success(id ? 'Employee updated.' : 'Employee added successfully!');
    await load();
    EventBus.emit('data:refresh');
  }

  // ── View Employee Detail ───────────────────────────────────────────────────
  async function viewEmployee(id) {
    const res = await API.getEmployee(id);
    if (!res.success) { Toast.error('Employee not found.'); return; }
    const e = res.employee;

    Modal.open({
      title: `Employee Profile`,
      size: 'modal-lg',
      body: `
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
          <div class="user-avatar" style="background:${avatarColor(e.name)};width:54px;height:54px;font-size:1.4rem;border-radius:14px">
            ${e.name[0].toUpperCase()}
          </div>
          <div>
            <div style="font-size:1.2rem;font-weight:700">${Helpers.escapeHtml(e.name)}</div>
            <div class="text-muted">${Helpers.escapeHtml(e.role || 'No role assigned')}</div>
            <span class="badge ${e.status === 'active' ? 'badge-success' : 'badge-muted'}">${e.status}</span>
          </div>
        </div>
        <div class="grid-2">
          ${profileRow('📱 Phone', e.phone || '—')}
          ${AppState.get('user')?.role !== 'hr' || AppState.get('settings')?.hr_edit_salary === '1' ? profileRow('💰 Per Day Salary', API.fmtRupees(e.salary)) : ''}
          ${profileRow('📅 Joining Date', Helpers.formatDate(e.joining_date))}
          <div class="card" style="padding:14px; border:2px solid ${e.balance < 0 ? 'var(--danger-subtle)' : 'var(--success-subtle)'}">
             <div class="text-xs text-muted">Running Balance</div>
             <div class="font-700 amount ${e.balance < 0 ? 'amount-danger' : (e.balance > 0 ? 'amount-success' : 'text-muted')}" style="font-size:1.1rem; margin-top:4px">
                ${e.balance === 0 ? '₹0.00' : (e.balance < 0 ? '-' : '+') + API.fmtRupees(Math.abs(e.balance))}
             </div>
             <div class="text-xs font-700 mt-1" style="text-transform:uppercase; color:${e.balance < 0 ? 'var(--danger)' : (e.balance > 0 ? 'var(--success)' : 'var(--text-muted)')}">
                ${e.balance < 0 ? 'Employee owes (Advance)' : (e.balance > 0 ? 'Company owes (Pending)' : 'Settled')}
             </div>
              ${AppState.get('user')?.role === 'admin' || AppState.get('settings')?.hr_edit_salary === '1' ? `<button class="btn btn-sm btn-ghost mt-2" id="vw-adj-bal" style="padding:0; font-size:10px; color:var(--accent)">Adjust Balance</button>` : ''}
          </div>
        </div>
        <div style="margin-top:20px;margin-bottom:20px">
          ${profileRow('📝 Notes', e.notes || '—')}
        </div>
        <div class="divider"></div>
        <div class="flex gap-2">
          <button class="btn btn-secondary" id="vw-att"  data-id="${e.id}">Attendance</button>
          <button class="btn btn-secondary" id="vw-adv"  data-id="${e.id}">Advances</button>
          <button class="btn btn-secondary" id="vw-pay"  data-id="${e.id}">Payments</button>
          <button class="btn btn-secondary" id="vw-docs" data-id="${e.id}">📁 Docs</button>
          <button class="btn btn-accent"    id="vw-ledger" data-id="${e.id}">📜 Ledger</button>
          <button class="btn btn-secondary" id="vw-excel" data-id="${e.id}" style="margin-left:auto">
            Excel
          </button>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" id="vw-edit" data-id="${e.id}">Edit</button>
        <button class="btn btn-secondary modal-close-btn">Close</button>
      `
    });

    document.querySelector('.modal-close-btn')?.addEventListener('click', Modal.close);
    document.getElementById('vw-edit')?.addEventListener('click', () => { Modal.close(); openForm(e.id); });
    document.getElementById('vw-att')?.addEventListener('click',  () => { Modal.close(); AppState.set('selectedEmployeeId', e.id); Router.navigate('attendance'); });
    document.getElementById('vw-adv')?.addEventListener('click',  () => { Modal.close(); AppState.set('selectedEmployeeId', e.id); Router.navigate('advances'); });
    document.getElementById('vw-pay')?.addEventListener('click',  () => { Modal.close(); AppState.set('selectedEmployeeId', e.id); Router.navigate('payments'); });
    document.getElementById('vw-docs')?.addEventListener('click', () => { Modal.close(); AppState.set('selectedEmployeeId', e.id); Router.navigate('staff-docs'); });
    document.getElementById('vw-excel')?.addEventListener('click', async () => {
      const r = await API.exportEmployeeExcel(e.id);
      if (r.success) Toast.success('Excel exported!'); else if (r.error !== 'Cancelled.') Toast.error(r.error);
    });
    document.getElementById('vw-ledger')?.addEventListener('click', () => { Modal.close(); openLedgerModal(e); });
    document.getElementById('vw-adj-bal')?.addEventListener('click', () => { Modal.close(); openAdjustBalanceModal(e); });
  }

  // ── Ledger Modal ──────────────────────────────────────────────────────────
  async function openLedgerModal(emp) {
    Modal.open({
      title: `Ledger — ${emp.name}`,
      size: 'modal-lg',
      body: `<div id="ledger-content" class="p-4"><div class="loader"></div></div>`,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Close</button>`
    });

    const res = await API.getLedger(emp.id);
    const content = document.getElementById('ledger-content');
    
    if (!res.success) { content.innerHTML = `<p class="text-danger">${res.error}</p>`; return; }
    
    const history = res.history || [];
    if (history.length === 0) {
      content.innerHTML = `<div class="empty-state">No transactions found for this employee.</div>`;
      return;
    }

    content.innerHTML = `
      <div class="table-wrap">
        <table style="font-size:0.9rem">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Balance</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${history.map(t => `
              <tr>
                <td>${Helpers.formatDate(t.date)}</td>
                <td><span class="badge badge-muted">${t.type}</span></td>
                <td class="amount ${t.amount < 0 ? 'amount-danger' : 'amount-success'}">
                   ${t.amount < 0 ? '-' : '+'}${API.fmtRupees(Math.abs(t.amount))}
                </td>
                <td class="amount font-600">${API.fmtRupees(t.running_balance)}</td>
                <td class="text-xs text-muted">${Helpers.escapeHtml(t.notes || '')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ── Adjust Balance Modal ──────────────────────────────────────────────────
  function openAdjustBalanceModal(emp) {
    Modal.open({
      title: `Adjust Balance — ${emp.name}`,
      body: `
        <div class="form-group">
          <label class="form-label">Adjustment Amount (₹)</label>
          <input id="adj-amount" type="number" class="form-input" placeholder="e.g. 500 or -500" />
          <div class="text-xs text-muted mt-1">Positive to increase balance, Negative to decrease (add advance).</div>
        </div>
        <div class="form-group mt-3">
          <label class="form-label">Notes</label>
          <input id="adj-notes" class="form-input" placeholder="Reason for adjustment" />
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="adj-save">Apply Adjustment</button>
      `
    });

    document.getElementById('adj-save').addEventListener('click', async () => {
      const amount = parseFloat(document.getElementById('adj-amount').value) || 0;
      const notes = document.getElementById('adj-notes').value;
      
      if (amount === 0) { Modal.close(); return; }

      const res = await API.updateBalance({ employeeId: emp.id, amount, notes });
      if (res.success) {
        Toast.success('Balance adjusted.');
        Modal.close();
        load();
      } else {
        Toast.error(res.error);
      }
    });
  }

  function profileRow(label, value) {
    return `<div class="card" style="padding:14px">
      <div class="text-xs text-muted">${label}</div>
      <div class="font-600" style="margin-top:4px">${Helpers.escapeHtml(String(value))}</div>
    </div>`;
  }

  // ── Delete Employee ────────────────────────────────────────────────────────
  function deleteEmployee(id, name) {
    Modal.confirm(
      `Delete <strong>${Helpers.escapeHtml(name)}</strong>?<br><span class="text-muted text-sm">All attendance, advances, and payment records will also be deleted.</span>`,
      async () => {
        const res = await API.deleteEmployee(id);
        if (!res.success) { Toast.error(res.error); return; }
        Toast.success('Employee deleted.');
        await load();
        EventBus.emit('data:refresh');
      },
      { title: 'Confirm Delete', danger: true }
    );
  }

  return { init };
})();
