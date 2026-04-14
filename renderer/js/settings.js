/**
 * LocalPayroll — Settings Page
 * App configuration: company name, attendance toggle, working days, user management.
 */

const SettingsPage = (() => {
  const container  = () => document.getElementById('page-settings');
  const headerActs = () => document.getElementById('page-header-actions');

  async function init() {
    headerActs().innerHTML = '';
    const currentUser = AppState.get('user');
    const isAdmin = currentUser?.role === 'admin';

    // Fetch settings from DB via payments IPC (reuse reports as settings handler is inline)
    // We'll read from the page state and let user configure
    container().innerHTML = `
      <div class="grid-2">

        <div class="card" style="grid-column: 1 / -1">
          <div class="card-title">App Configuration</div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Company / Business Name</label>
              <input id="set-company" class="form-input" placeholder="Your company name (appears on payslips)" />
            </div>
            <div class="form-group">
              <label class="form-label">Working Days Per Month</label>
              <input id="set-working-days" type="number" class="form-input" min="20" max="31" step="1" placeholder="Default: 26" value="26" />
              <span class="text-xs text-muted mt-3">Used to prorate salary based on attendance (Indian standard: 26)</span>
            </div>
          </div>
          <div class="form-group mt-3">
            <label class="form-label" style="display:flex;align-items:center;gap:10px;cursor:pointer">
              <input id="set-att-toggle" type="checkbox" style="width:18px;height:18px;accent-color:var(--accent)" />
              Enable Attendance-Based Salary Calculation
              <span class="badge badge-muted">Optional</span>
            </label>
            <span class="text-xs text-muted">When ON: salary = (present days / working days) × monthly salary.<br>When OFF: full salary is always payable (advances still deducted).</span>
          </div>
          <div class="form-group mt-3">
            <label class="form-label">Active Projects List</label>
            <input id="set-projects" class="form-input" placeholder="e.g. Office, Site A, Site B" />
            <span class="text-xs text-muted mt-3">Comma-separated list of projects available for attendance tagging.</span>
          </div>
          <div class="mt-4">
            <button id="set-save-config" class="btn btn-primary">
              <span class="btn-text">Save Configuration</span>
              <span class="btn-loader" hidden></span>
            </button>
          </div>
        </div>

        <!-- User Management (admin only) -->
        <div class="card ${isAdmin ? '' : ''}">
          <div class="card-title">User Management
            ${!isAdmin ? '<span class="badge badge-muted" style="margin-left:8px">Admin Only</span>' : ''}
          </div>
          ${!isAdmin
            ? `<p class="text-muted text-sm">Only admins can manage users.</p>`
            : `
              <div id="users-list" class="mb-4"></div>
              <button id="set-add-user-btn" class="btn btn-secondary">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add User
              </button>
            `
          }
        </div>

        <!-- Change My Password -->
        <div class="card">
          <div class="card-title">Change My Password</div>
          <div class="form-group">
            <label class="form-label">Current Password</label>
            <input id="set-cur-pw" type="password" class="form-input" placeholder="Current password" />
          </div>
          <div class="form-group mt-3">
            <label class="form-label">New Password</label>
            <input id="set-new-pw" type="password" class="form-input" placeholder="Min. 6 characters" />
          </div>
          <div class="form-group mt-3">
            <label class="form-label">Confirm New Password</label>
            <input id="set-conf-pw" type="password" class="form-input" placeholder="Repeat new password" />
          </div>
          <div id="set-pw-error" class="form-error mt-3" hidden></div>
          <div class="mt-4">
            <button id="set-change-pw-btn" class="btn btn-primary">
              <span class="btn-text">Update Password</span>
              <span class="btn-loader" hidden></span>
            </button>
          </div>
        </div>

      </div>

      <!-- About -->
      <div class="card mt-4" style="text-align:center;padding:24px">
        <div style="font-size:2rem;margin-bottom:8px">₹</div>
        <div style="font-size:1.1rem;font-weight:700;margin-bottom:4px">LocalPayroll</div>
        <div class="text-muted text-sm">v1.1.0 · Offline-first payroll for small businesses</div>
        <div class="text-muted text-sm mt-3">Data stored locally at: <code>%APPDATA%/LocalPayroll/payroll.db</code></div>
      </div>
    `;

    await loadSettings();
    if (isAdmin) await loadUsers();

    bindSettingsEvents(isAdmin, currentUser);
  }

  async function loadSettings() {
    const res = await API.getSettings();
    if (!res.success) return;
    const s = res.settings;

    if (s.company_name)   document.getElementById('set-company').value = s.company_name;
    if (s.working_days)   document.getElementById('set-working-days').value = s.working_days;
    if (s.use_attendance) document.getElementById('set-att-toggle').checked = s.use_attendance === '1';
    
    if (s.projects_list) {
      try {
        const pArr = JSON.parse(s.projects_list);
        document.getElementById('set-projects').value = pArr.join(', ');
      } catch (e) {
        document.getElementById('set-projects').value = s.projects_list;
      }
    }
  }

  async function loadUsers() {
    const res = await API.getUsers();
    const users = res.users || [];
    const listEl = document.getElementById('users-list');
    if (!listEl) return;

    listEl.innerHTML = users.length === 0
      ? `<p class="text-muted text-sm">No users found.</p>`
      : `<div class="table-wrap"><table>
          <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Actions</th></tr></thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td class="font-600">${Helpers.escapeHtml(u.username)}</td>
                <td>${Helpers.escapeHtml(u.full_name || '—')}</td>
                <td>${u.role === 'admin' ? '<span class="badge badge-accent">Admin</span>' : '<span class="badge badge-muted">Staff</span>'}</td>
                <td>
                  <button class="btn btn-sm btn-danger usr-del-btn" data-id="${u.id}" data-name="${Helpers.escapeHtml(u.username)}">Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>`;

    listEl.querySelectorAll('.usr-del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        Modal.confirm(`Delete user <strong>${Helpers.escapeHtml(btn.dataset.name)}</strong>?`, async () => {
          const r = await API.deleteUser(parseInt(btn.dataset.id));
          if (r.success) { Toast.success('User deleted.'); await loadUsers(); }
          else Toast.error(r.error);
        }, { title: 'Delete User', danger: true });
      });
    });
  }

  function bindSettingsEvents(isAdmin, currentUser) {
    // Save config
    document.getElementById('set-save-config').addEventListener('click', async () => {
      const company_name  = document.getElementById('set-company').value.trim();
      const working_days  = document.getElementById('set-working-days').value;
      const use_attendance= document.getElementById('set-att-toggle').checked ? '1' : '0';
      const projStr       = document.getElementById('set-projects').value.trim();
      const projectsArr   = projStr.split(',').map(s => s.trim()).filter(Boolean);
      const projects_list = JSON.stringify(projectsArr);

      Helpers.setLoading('set-save-config', true);
      const res = await API.saveSettings({ company_name, working_days, use_attendance, projects_list });
      Helpers.setLoading('set-save-config', false);

      if (res.success) {
        Toast.success('Settings saved successfully!');
      } else {
        Toast.error('Failed to save settings: ' + res.error);
      }
    });

    // Change password
    document.getElementById('set-change-pw-btn').addEventListener('click', async () => {
      const errEl  = document.getElementById('set-pw-error');
      errEl.hidden = true;
      const cur    = document.getElementById('set-cur-pw').value;
      const nw     = document.getElementById('set-new-pw').value;
      const conf   = document.getElementById('set-conf-pw').value;

      if (!cur) { errEl.textContent = 'Enter current password.'; errEl.hidden = false; return; }
      if (nw.length < 6) { errEl.textContent = 'New password must be at least 6 characters.'; errEl.hidden = false; return; }
      if (nw !== conf) { errEl.textContent = 'Passwords do not match.'; errEl.hidden = false; return; }

      Helpers.setLoading('set-change-pw-btn', true);
      const res = await API.changePassword(currentUser.id, cur, nw);
      Helpers.setLoading('set-change-pw-btn', false);

      if (!res.success) { errEl.textContent = res.error; errEl.hidden = false; return; }

      Toast.success('Password updated!');
      document.getElementById('set-cur-pw').value  = '';
      document.getElementById('set-new-pw').value  = '';
      document.getElementById('set-conf-pw').value = '';
    });

    // Add user (admin)
    if (isAdmin) {
      document.getElementById('set-add-user-btn')?.addEventListener('click', () => {
        Modal.open({
          title: 'Add New User',
          size: 'modal-sm',
          body: `
            <div class="form-group"><label class="form-label">Username *</label><input id="nu-username" class="form-input" placeholder="e.g. manager1" /></div>
            <div class="form-group mt-3"><label class="form-label">Full Name</label><input id="nu-fullname" class="form-input" placeholder="Full name" /></div>
            <div class="form-group mt-3"><label class="form-label">Password *</label><input id="nu-password" type="password" class="form-input" placeholder="Min. 6 characters" /></div>
            <div class="form-group mt-3"><label class="form-label">Role</label>
              <select id="nu-role" class="form-select">
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div id="nu-error" class="form-error mt-3" hidden></div>
          `,
          footer: `
            <button class="btn btn-secondary" id="nu-cancel">Cancel</button>
            <button class="btn btn-primary" id="nu-save"><span class="btn-text">Create User</span><span class="btn-loader" hidden></span></button>
          `
        });
        document.getElementById('nu-cancel').addEventListener('click', Modal.close);
        document.getElementById('nu-save').addEventListener('click', async () => {
          const errEl = document.getElementById('nu-error');
          errEl.hidden = true;
          const username = document.getElementById('nu-username').value.trim();
          const fullName = document.getElementById('nu-fullname').value.trim();
          const password = document.getElementById('nu-password').value;
          const role     = document.getElementById('nu-role').value;

          if (!username) { errEl.textContent = 'Username required.'; errEl.hidden = false; return; }

          Helpers.setLoading('nu-save', true);
          const res = await API.createUser({ username, fullName, password, role });
          Helpers.setLoading('nu-save', false);

          if (!res.success) { errEl.textContent = res.error; errEl.hidden = false; return; }
          Modal.close();
          Toast.success('User created!');
          await loadUsers();
        });
      });
    }
  }

  return { init };
})();
