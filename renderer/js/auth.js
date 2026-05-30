/**
 * LocalPayroll — Auth Module (renderer)
 * Handles login form, forced password-change modal, and logout.
 */

const AuthModule = (() => {

  // ── DOM refs (lazy) ─────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  
  let heartbeatInterval = null;

  // ── Init (called on DOMContentLoaded) ───────────────────────────────────
  function init() {
    $('login-form').addEventListener('submit', handleLogin);
    $('toggle-password').addEventListener('click', togglePw);
    $('logout-btn').addEventListener('click', logout);
    $('cp-submit').addEventListener('click', handleChangePassword);

    // Show login screen (app-shell stays hidden)
    $('login-screen').style.display = 'flex';
    $('app-shell').hidden = true;
  }

  // ── Toggle password visibility ───────────────────────────────────────────
  function togglePw() {
    const inp = $('login-password');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  }

  // ── Login ────────────────────────────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    const username = $('login-username').value.trim();
    const password = $('login-password').value;
    const errEl    = $('login-error');

    errEl.hidden = true;
    $('login-btn').disabled = true;
    $('login-btn').querySelector('.btn-text').hidden = true;
    $('login-btn').querySelector('.btn-loader').hidden = false;

    try {
      const res = await API.login(username, password);

      $('login-btn').disabled = false;
      $('login-btn').querySelector('.btn-text').hidden = false;
      $('login-btn').querySelector('.btn-loader').hidden = true;

      if (!res.success) {
        errEl.textContent = res.error;
        errEl.hidden = false;
        return;
      }

      // Store user in AppState with lowercase role for consistent RBAC
      const role = (res.user.role || 'staff').toLowerCase();
      res.user.role = role;
      AppState.set('user', res.user);

      // Update sidebar user chip
      $('user-name-display').textContent = res.user.fullName || res.user.username;
      $('user-role-display').textContent = role === 'admin' ? 'Administrator' : role === 'hr' ? 'HR Manager' : 'Staff';
      $('user-avatar').textContent = (res.user.fullName || res.user.username)[0].toUpperCase();

      // Fetch global settings and store in AppState for RBAC
      try {
        const sRes = await API.getSettings();
        AppState.set('settings', sRes.settings || {});
      } catch(e) {
        AppState.set('settings', {});
      }

      // ── RBAC UI Enforcement ──
      const isHR = role === 'hr';
      const settings = AppState.get('settings');
      
      const hrCanFinancials = settings.hr_access_financials === '1';
      const hrCanAudit      = settings.hr_access_audit === '1';
      const hrCanSettings   = settings.hr_access_settings === '1';
      
      // List of nav items to hide for HR
      const restrictedNavs = [];
      if (isHR) restrictedNavs.push('nav-performance');
      if (!hrCanFinancials) restrictedNavs.push('nav-payments', 'nav-expenses');
      if (!hrCanSettings) restrictedNavs.push('nav-settings');
      if (!hrCanAudit) restrictedNavs.push('nav-activity');
      
      restrictedNavs.forEach(id => {
        const el = $(id);
        if (el) { el.style.display = isHR ? 'none' : 'flex'; }
      });

      // Handle "System & Security" section title and divider
      const systemTitle = document.querySelector('.nav-title'); // Assuming first one is "System & Security"
      const divider = document.querySelector('.nav-divider');
      
      if (isHR) {
        if (systemTitle) systemTitle.style.display = (hrCanSettings || hrCanAudit || hrCanFinancials) ? 'block' : 'none';
        if (divider) divider.style.display = (hrCanSettings || hrCanAudit || hrCanFinancials) ? 'block' : 'none';
        
        const reportsNav = document.querySelector('[data-page="reports"]');
        if (reportsNav) reportsNav.style.display = hrCanFinancials ? 'flex' : 'none';
        
        const activityNav = document.querySelector('[data-page="activity"]');
        if (activityNav) activityNav.style.display = hrCanAudit ? 'flex' : 'none';
      } else {
        if (systemTitle) systemTitle.style.display = 'block';
        if (divider) divider.style.display = 'block';
        const reportsNav = document.querySelector('[data-page="reports"]');
        if (reportsNav) reportsNav.style.display = 'flex';
        const activityNav = document.querySelector('[data-page="activity"]');
        if (activityNav) activityNav.style.display = 'flex';
      }

      // Hide login, show app
      $('login-screen').style.display = 'none';

      // MANDATORY: force password change if using default password
      if (res.user.mustChangePassword) {
        showChangePwModal(res.user);
      } else {
        $('app-shell').hidden = false;
        Router.init();
      }

      // Start Heartbeat (every 30 seconds)
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      heartbeatInterval = setInterval(() => {
        window.electronAPI.heartbeat({ username: res.user.username });
      }, 30000);

    } catch (err) {
      console.error('[Auth] Login error:', err);
      $('login-btn').disabled = false;
      $('login-btn').querySelector('.btn-text').hidden = false;
      $('login-btn').querySelector('.btn-loader').hidden = true;
      errEl.textContent = 'An unexpected error occurred. Please try again.';
      errEl.hidden = false;
    }
  }

  // ── Forced Password Change ────────────────────────────────────────────────
  function showChangePwModal(user) {
    $('change-pw-overlay').hidden = false;
    // Pre-clear fields
    $('cp-current').value = '';
    $('cp-new').value = '';
    $('cp-confirm').value = '';
    $('cp-error').hidden = true;

    // Store user ref for submit
    $('cp-submit')._userId = user.id;
  }

  async function handleChangePassword() {
    const userId  = $('cp-submit')._userId;
    const current = $('cp-current').value;
    const nw      = $('cp-new').value;
    const confirm = $('cp-confirm').value;
    const errEl   = $('cp-error');

    errEl.hidden = true;

    if (!current) { errEl.textContent = 'Enter your current password.'; errEl.hidden = false; return; }
    if (nw.length < 6) { errEl.textContent = 'New password must be at least 6 characters.'; errEl.hidden = false; return; }
    if (nw !== confirm) { errEl.textContent = 'Passwords do not match.'; errEl.hidden = false; return; }

    const btn = $('cp-submit');
    btn.disabled = true; btn.textContent = 'Saving...';

    const res = await API.changePassword(userId, current, nw);

    btn.disabled = false; btn.textContent = 'Update Password & Continue';

    if (!res.success) {
      errEl.textContent = res.error;
      errEl.hidden = false;
      return;
    }

    $('change-pw-overlay').hidden = true;
    $('app-shell').hidden = false;
    Toast.success('Password updated! Welcome to LocalPayroll.');
    Router.init();
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  async function logout() {
    Modal.confirm('Are you sure you want to log out?', async () => {
      const user = AppState.get('user');
      
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      
      if (user) {
        await API.logout({ user });
      }
      AppState.set('user', null);
      $('app-shell').hidden = true;
      $('login-screen').style.display = 'flex';
      $('login-username').value = '';
      $('login-password').value = '';
      $('login-error').hidden = true;
      Router.navigate('login');
    }, { title: 'Logout' });
  }

  return { init };
})();
