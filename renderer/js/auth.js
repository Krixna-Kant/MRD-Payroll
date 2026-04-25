/**
 * LocalPayroll — Auth Module (renderer)
 * Handles login form, forced password-change modal, and logout.
 */

const AuthModule = (() => {

  // ── DOM refs (lazy) ─────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

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

    const res = await API.login(username, password);

    $('login-btn').disabled = false;
    $('login-btn').querySelector('.btn-text').hidden = false;
    $('login-btn').querySelector('.btn-loader').hidden = true;

    if (!res.success) {
      errEl.textContent = res.error;
      errEl.hidden = false;
      return;
    }

    // Store user in AppState
    AppState.set('user', res.user);

    // Update sidebar user chip
    $('user-name-display').textContent = res.user.fullName || res.user.username;
    $('user-role-display').textContent = res.user.role === 'admin' ? 'Administrator' : res.user.role === 'hr' ? 'HR Manager' : 'Staff';
    $('user-avatar').textContent = (res.user.fullName || res.user.username)[0].toUpperCase();

    // HR restriction mechanism: Hide non-attendance tabs for HR users.
    const isHR = res.user.role === 'hr';
    ['nav-employees', 'nav-advances', 'nav-payments', 'nav-settings', 'nav-reports'].forEach(id => {
       const el = $(id);
       if (el) { el.style.display = isHR ? 'none' : 'flex'; }
    });
    const div = document.querySelector('.nav-divider');
    if (div) { div.style.display = isHR ? 'none' : 'block'; }

    // Hide login, show app
    $('login-screen').style.display = 'none';

    // MANDATORY: force password change if using default password
    if (res.user.mustChangePassword) {
      showChangePwModal(res.user);
    } else {
      $('app-shell').hidden = false;
      Router.init();
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
  function logout() {
    Modal.confirm('Are you sure you want to log out?', () => {
      AppState.set('user', null);
      $('app-shell').hidden = true;
      $('login-screen').style.display = 'flex';
      $('login-username').value = '';
      $('login-password').value = '';
      $('login-error').hidden = true;
    }, { title: 'Logout' });
  }

  return { init };
})();
