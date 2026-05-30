const fs = require('fs');
const orig = fs.readFileSync('renderer/js/employees.js', 'utf8');
const lines = orig.split('\n');
const before = lines.slice(0, 145).join('\n');
const after  = lines.slice(312).join('\n');

const newSection = `
  // -- Add / Edit Form -------------------------------------------------------
  async function openForm(id = null) {
    let emp = null;
    if (id) { const res = await API.getEmployee(id); emp = res.employee; }
    const isEdit = !!emp;
    const salaryRupees = emp ? API.toRupees(emp.salary) : '';

    Modal.open({
      title: isEdit ? 'Edit Employee \u2014 ' + emp.name : 'Add New Employee',
      size: 'modal-lg',
      body: buildFormBody(emp, isEdit, salaryRupees),
      footer: \`
        <button class="btn btn-secondary" id="ef-cancel">Cancel</button>
        <button class="btn btn-primary" id="ef-save">
          <span class="btn-text">\${isEdit ? 'Save Changes' : 'Add Employee'}</span>
          <span class="btn-loader" hidden></span>
        </button>\`
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
      setOcrStatus('processing', '\ud83d\udd04 OCR Processing\u2026');
      const res = await API.runInlineOcr(_filePath, docType);
      document.getElementById('ocr-loader').style.display = 'none';
      runBtn.disabled = false;
      if (!res.success) {
        setOcrStatus('failed', '\u274c OCR Failed');
        Toast.error('OCR failed: ' + res.error);
        return;
      }
      setOcrStatus('done', '\u2705 OCR Completed');
      showConfidenceBar(res.confidence || 0);
      showOcrResults(res.extracted, docType, res.confidence || 0, id);
    });
  }

  function buildFormBody(emp, isEdit, salaryRupees) {
    const v   = (f) => Helpers.escapeHtml(emp?.[f] || '');
    const sel = (f, o) => emp?.[f] === o ? 'selected' : '';
    return \`
      <div class="form-row">
        <div class="form-group"><label class="form-label">Full Name *</label>
          <input id="ef-name" class="form-input" placeholder="e.g. Ravi Kumar" value="\${v('name')}" /></div>
        <div class="form-group"><label class="form-label">Phone Number</label>
          <input id="ef-phone" class="form-input" placeholder="10-digit mobile number" value="\${v('phone')}" /></div>
      </div>
      <div class="form-row mt-3">
        <div class="form-group"><label class="form-label">Role / Designation</label>
          <input id="ef-role" class="form-input" placeholder="e.g. Driver, Cook, Guard" value="\${v('role')}" /></div>
        <div class="form-group"><label class="form-label">Per Day Salary (\u20b9) *</label>
          <input id="ef-salary" class="form-input" type="number" min="0" step="50" placeholder="e.g. 400" value="\${salaryRupees}" /></div>
      </div>
      <div class="form-row mt-3">
        <div class="form-group"><label class="form-label">Joining Date</label>
          <input id="ef-joining" class="form-input" type="date" value="\${emp?.joining_date || ''}" /></div>
        <div class="form-group"><label class="form-label">Status</label>
          <select id="ef-status" class="form-select">
            <option value="active" \${(emp?.status||'active')==='active'?'selected':''}>Active</option>
            <option value="inactive" \${emp?.status==='inactive'?'selected':''}>Inactive</option>
          </select></div>
      </div>
      <div class="form-group mt-3"><label class="form-label">Notes (optional)</label>
        <input id="ef-notes" class="form-input" placeholder="Any additional information" value="\${v('notes')}" /></div>

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
              <span class="text-sm text-muted">Extracting data\u2026</span>
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
            <input id="ef-aadhaar" class="form-input" placeholder="XXXX XXXX XXXX" value="\${v('aadhaar_no')}" />
            <span id="dup-badge-aadhaar" class="dup-badge" style="display:none">\u26a0 Duplicate</span>
          </div></div>
        <div class="form-group"><label class="form-label">PAN Number</label>
          <div class="input-with-badge-wrap">
            <input id="ef-pan" class="form-input" placeholder="ABCDE1234F" value="\${v('pan_no')}" />
            <span id="dup-badge-pan" class="dup-badge" style="display:none">\u26a0 Duplicate</span>
          </div></div>
      </div>
      <div class="form-row mt-3">
        <div class="form-group"><label class="form-label">DOB</label>
          <input id="ef-dob" class="form-input" placeholder="DD/MM/YYYY" value="\${v('dob')}" /></div>
        <div class="form-group"><label class="form-label">Gender</label>
          <select id="ef-gender" class="form-select">
            <option value="">Select</option>
            <option value="Male" \${sel('gender','Male')}>Male</option>
            <option value="Female" \${sel('gender','Female')}>Female</option>
          </select></div>
      </div>
      <div class="form-group mt-3"><label class="form-label">Father Name</label>
        <input id="ef-father" class="form-input" placeholder="Father's name (from PAN)" value="\${v('father_name')}" /></div>
      <div class="form-group mt-3"><label class="form-label">Address</label>
        <input id="ef-address" class="form-input" value="\${v('address')}" /></div>
      <div class="form-row mt-3">
        <div class="form-group"><label class="form-label">Bank Name</label>
          <input id="ef-bank-name" class="form-input" value="\${v('bank_name')}" /></div>
        <div class="form-group"><label class="form-label">Account Number</label>
          <div class="input-with-badge-wrap">
            <input id="ef-acc-no" class="form-input" value="\${v('account_no')}" />
            <span id="dup-badge-account" class="dup-badge" style="display:none">\u26a0 Duplicate</span>
          </div></div>
      </div>
      <div class="form-row mt-3">
        <div class="form-group"><label class="form-label">IFSC Code</label>
          <input id="ef-ifsc" class="form-input" value="\${v('ifsc_code')}" /></div>
        <div class="form-group"><label class="form-label">Account Holder Name</label>
          <input id="ef-acc-holder" class="form-input" value="\${v('account_holder_name')}" /></div>
      </div>
      \${!isEdit ? \`<div class="form-group mt-3">
        <label class="form-label text-accent">Opening Balance (\u20b9)</label>
        <input id="ef-balance" type="number" class="form-input" placeholder="e.g. -2000 if they owe you" value="0" />
        <div class="text-xs text-muted mt-1">Positive = Company owes employee, Negative = Employee owes company (Advance).</div>
      </div>\` : ''}
      <div id="ef-error" class="form-error mt-3" hidden></div>
    \`;
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
        || (key === 'aadhaar_no' && !/^\d{4}\s?\d{4}\s?\d{4}$/.test(val))
        || (key === 'pan_no'     && !/^[A-Z]{5}\d{4}[A-Z]$/i.test(val));
      const warnHtml = warn ? ' <span class="ocr-warn-icon" title="Low confidence">\u26a0</span>' : '';
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
        if (b) { b.textContent = '\u26a0 ' + label + ' used by ' + r.employeeName; b.style.display = ''; }
        dupWarn.innerHTML += '<div class="ocr-dup-warn-row">\u26a0 <strong>' + label + '</strong> already registered to <strong>'
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
`;

const combined = before + '\n' + newSection + '\n' + after;
fs.writeFileSync('renderer/js/employees.js', combined, 'utf8');
console.log('Done. Total lines:', combined.split('\n').length);
