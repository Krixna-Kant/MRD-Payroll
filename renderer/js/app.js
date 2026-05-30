/**
 * LocalPayroll — App Core (renderer)
 * EventBus + AppState singleton + client-side Router + UI utilities.
 * Loaded first; all other JS modules depend on this.
 */

/* =============================================================================
   EVENT BUS — Lightweight pub/sub for decoupled module communication.
   When attendance is marked → emit 'data:attendance' → dashboard refreshes.
   ============================================================================= */
const EventBus = (() => {
  const _h = {};
  return {
    on(event, fn) {
      if (!_h[event]) _h[event] = [];
      _h[event].push(fn);
      return () => this.off(event, fn); // returns unsubscribe fn
    },
    off(event, fn) {
      if (!_h[event]) return;
      _h[event] = _h[event].filter(f => f !== fn);
    },
    emit(event, data) {
      (_h[event] || []).forEach(fn => fn(data));
    }
  };
})();

/* =============================================================================
   APP STATE — Central state store. Set triggers events so subscribers re-render.
   ============================================================================= */
const AppState = (() => {
  const now = new Date();
  const _s = {
    user:               null,
    theme:              localStorage.getItem('lp_theme') || 'dark',
    page:               'dashboard',
    currentMonth:       now.getMonth() + 1,
    currentYear:        now.getFullYear(),
    selectedEmployeeId: null,
  };

  return {
    get(k)     { return _s[k]; },
    getAll()   { return { ..._s }; },
    set(k, v)  {
      _s[k] = v;
      EventBus.emit(`state:${k}`, v);
    },
  };
})();

/* =============================================================================
   TOAST SYSTEM — Non-blocking notifications
   ============================================================================= */
const Toast = (() => {
  const container = () => document.getElementById('toast-container');

  function show(message, type = 'info', duration = 3500) {
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ'}</span>
      <span class="toast-msg">${message}</span>
      <button class="toast-close icon-btn">✕</button>
    `;
    el.querySelector('.toast-close').addEventListener('click', () => dismiss(el));
    container().appendChild(el);
    setTimeout(() => dismiss(el), duration);
    return el;
  }

  function dismiss(el) {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }

  return {
    success: (m, d) => show(m, 'success', d),
    error:   (m, d) => show(m, 'error', d),
    warning: (m, d) => show(m, 'warning', d),
    info:    (m, d) => show(m, 'info', d),
  };
})();

/* =============================================================================
   MODAL SYSTEM — Programmatic modals
   ============================================================================= */
const Modal = (() => {
  function open({ title, body, footer, size = '' }) {
    const overlay = document.getElementById('global-modal-overlay');
    const modal   = document.getElementById('global-modal');
    modal.className = `modal ${size}`;
    modal.innerHTML = `
      <div class="modal-header">
        <h2 class="modal-title">${title}</h2>
        <button class="modal-close btn btn-ghost btn-icon" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    `;
    modal.querySelector('.modal-close').addEventListener('click', close);
    overlay.hidden = false;
    // Focus first input if present
    setTimeout(() => modal.querySelector('input, select, textarea')?.focus(), 50);
  }

  function close() {
    document.getElementById('global-modal-overlay').hidden = true;
    document.getElementById('global-modal').innerHTML = '';
  }

  // Close on overlay click
  document.getElementById('global-modal-overlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('global-modal-overlay')) close();
  });

  function confirm(message, onConfirm, { title = 'Confirm', danger = false, confirmText = 'Confirm', cancelText = 'Cancel' } = {}) {
    open({
      title,
      size: 'modal-sm',
      body: `<p style="font-size:0.9rem;line-height:1.6">${message}</p>`,
      footer: `
        <button class="btn btn-secondary" id="modal-cancel-btn">${cancelText}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="modal-confirm-btn">${confirmText}</button>
      `
    });
    document.getElementById('modal-cancel-btn').addEventListener('click', close);
    document.getElementById('modal-confirm-btn').addEventListener('click', () => {
      close();
      onConfirm();
    });
  }

  return { open, close, confirm };
})();

/* =============================================================================
   ROUTER — Hash-less SPA router driven by AppState.page
   ============================================================================= */
const Router = (() => {
  const PAGE_META = {
    dashboard:  { title: 'Dashboard',  sub: 'Overview of your payroll'        },
    employees:  { title: 'Employees',  sub: 'Manage your team'                },
    projects:   { title: 'Projects',   sub: 'Project master & tracking'       },
    project_dashboard: { title: 'Project Dashboard', sub: ''                  },
    attendance: { title: 'Attendance', sub: 'Track daily attendance'          },
    advances:   { title: 'Advances',   sub: 'Salary advance ledger'           },
    payments:   { title: 'Payments',   sub: 'Salary payments & payslips'      },
    reports:    { title: 'Reports',    sub: 'Export PDF & Excel reports'      },
    activity:   { title: 'Activity Log', sub: 'System audit trail & user actions' },
    alerts:     { title: 'Alerts & Reminders', sub: 'Smart operational monitoring center' },
    leaves:     { title: 'Leave Management', sub: 'Employee leave requests & approvals' },
    expenses:   { title: 'Food & Travel Allowances', sub: 'Manage staff food and travel allowances' },
    accommodation: { title: 'Room Rent & Accommodation', sub: 'Manage staff rooms, landlord payments, and electricity readings' },
    'staff-docs': { title: 'Staff Documents', sub: 'Employee identity & compliance' },
    performance: { title: 'Performance & Bonus', sub: 'Manage employee reviews and bonuses' },
    assets:     { title: 'Asset Management', sub: 'Track and assign company tools & assets' },
    settings:   { title: 'Settings',   sub: 'Configure app & data'            },
  };

  const MODULES = {
    dashboard:  () => DashboardPage.init(),
    employees:  () => EmployeesPage.init(),
    projects:   (params) => ProjectsPage.init(params),
    project_dashboard: (params) => ProjectDashboardPage.init(params),
    attendance: (params) => AttendancePage.init(params),
    advances:   () => AdvancesPage.init(),
    payments:   () => PaymentsPage.init(),
    reports:    () => ReportsPage.init(),
    activity:   () => ActivityLogsPage.init(),
    alerts:     () => AlertsPage.init(),
    leaves:     () => LeavesPage.init(),
    expenses:   () => ExpensesPage.init(),
    accommodation: () => AccommodationPage.init(),
    'staff-docs': () => StaffDocsPage.init(),
    performance: () => PerformancePage.init(),
    assets:      () => AssetsPage.init(),
    settings:   () => SettingsPage.init(),
  };

  function navigate(page, params = {}) {
    if (!MODULES[page]) return;
    AppState.set('page', page);

    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(el => {
      // Don't highlight nav item if we are on a hidden sub-page, unless we map it
      if (page === 'project_dashboard' && el.dataset.page === 'projects') {
        el.classList.add('active');
      } else {
        el.classList.toggle('active', el.dataset.page === page);
      }
    });

    // Show correct page section and handle both class-based and attribute-based visibility
    document.querySelectorAll('.page-section').forEach(el => {
      const isActive = el.id === `page-${page}`;
      el.classList.toggle('active', isActive);
      el.hidden = !isActive;
    });

    // Update page header
    const meta = PAGE_META[page] || {};
    const headerEl = document.getElementById('page-header');
    if (headerEl) {
      headerEl.hidden = (page === 'dashboard');
    }
    document.getElementById('page-title').textContent = meta.title || page;
    document.getElementById('page-sub').textContent   = meta.sub   || '';
    
    // Add a global refresh/reload button to the header actions as a safety valve
    document.getElementById('page-header-actions').innerHTML = `
      <button class="btn btn-ghost btn-icon" onclick="window.location.reload()" title="Refresh Application" style="opacity:0.6 hover:opacity:1">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
      </button>
    `;

    const container = document.getElementById(`page-${page}`);
    if (container) {
      container.innerHTML = `
        <div style="display:flex; justify-content:center; align-items:center; height:300px; width:100%">
          <div class="btn-loader" style="width:40px; height:40px; border-width:4px; border-top-color:var(--accent)"></div>
        </div>
      `;
    }

    // Init the page module with robust error handling to prevent blank screens
    setTimeout(async () => {
      try {
        await MODULES[page]?.(params);
      } catch (err) {
        console.error(`[Router Critical Error] Failed to initialize module "${page}":`, err);
        
        if (container) {
          container.innerHTML = `
            <div class="empty-state" style="padding:40px">
              <div class="empty-icon" style="color:var(--danger); font-size:48px; margin-bottom:20px">⚠️</div>
              <h3 style="color:var(--danger); font-size:1.5rem">Module Rendering Failure</h3>
              <p style="max-width:500px; margin:10px auto; color:var(--text-muted)">
                We encountered a serious error while trying to load the <strong>${meta.title || page}</strong> module. 
                This might be due to a database mismatch or a script failure.
              </p>
              
              <div class="error-detail-box" style="text-align:left; font-family:var(--font-mono); font-size:12px; background:var(--bg-subtle); padding:15px; border-radius:8px; border:1px solid var(--border); max-width:600px; margin:20px auto; overflow-x:auto">
                <div style="color:var(--danger); font-weight:700; margin-bottom:8px">Error Trace:</div>
                <div style="white-space:pre-wrap; color:var(--text)">${err.stack || err.message}</div>
              </div>

              <div class="flex gap-3 justify-center mt-4">
                <button class="btn btn-primary" onclick="Router.navigate('${page}')" style="padding:10px 24px">🔄 Retry Module</button>
                <button class="btn btn-secondary" onclick="window.location.reload()" style="padding:10px 24px">🌐 Reload Application</button>
              </div>
            </div>
          `;
        }
        Toast.error("Critical module error. Check developer console for details.");
      }
    }, 10);
  }

  function init() {
    // Sidebar nav clicks
    document.querySelectorAll('.nav-item[data-page]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        navigate(el.dataset.page);
      });
    });

    // Check if database was automatically restored from OneDrive on startup
    if (window.API && window.API.checkStartupSync) {
      setTimeout(async () => {
        try {
          const res = await window.API.checkStartupSync();
          if (res && res.restored) {
            Toast.success(`Successfully loaded the latest data from OneDrive! (Backup: ${res.filename})`, 6000);
          }
        } catch (e) {
          console.error('[Sync] Error checking startup sync:', e);
        }
      }, 1000);
    }

    // Start on dashboard
    navigate('dashboard');
  }

  return { navigate, init };
})();

/* =============================================================================
   THEME MANAGER
   ============================================================================= */
const ThemeManager = (() => {
  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('lp_theme', theme);
    const moon = document.querySelector('.icon-moon');
    const sun  = document.querySelector('.icon-sun');
    if (moon) moon.style.display = theme === 'dark'  ? '' : 'none';
    if (sun)  sun.style.display  = theme === 'light' ? '' : 'none';
  }

  function toggle() {
    const next = AppState.get('theme') === 'dark' ? 'light' : 'dark';
    AppState.set('theme', next);
    apply(next);
  }

  function init() {
    apply(AppState.get('theme'));
    document.getElementById('theme-toggle')?.addEventListener('click', toggle);
  }

  return { init, apply };
})();

/* =============================================================================
   HELPERS — Shared across all page modules
   ============================================================================= */
const Helpers = (() => {

  const MONTH_NAMES = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];
  const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun',
                        'Jul','Aug','Sep','Oct','Nov','Dec'];

  function monthName(m)      { return MONTH_NAMES[(m || 1) - 1]; }
  function shortMonth(m)     { return SHORT_MONTHS[(m || 1) - 1]; }
  function todayIso(d) {
    const date = d || new Date();
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().slice(0, 10);
  }
  function formatDate(iso)   { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }); }
  function formatDateShort(iso) { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short' }); }
  function formatDateTime(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts; // Return as is if invalid
    return d.toLocaleDateString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric' }) + ' ' + 
           d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: true });
  }

  function buildMonthSelect(id, val, includeAll = false) {
    let opts = includeAll ? `<option value="">All Months</option>` : '';
    opts += MONTH_NAMES.map((n, i) =>
      `<option value="${i+1}" ${(i+1) === val ? 'selected' : ''}>${n}</option>`
    ).join('');
    return `<select id="${id}" class="form-select">${opts}</select>`;
  }

  function buildYearSelect(id, val, includeAll = false) {
    const cur = new Date().getFullYear();
    let opts = includeAll ? `<option value="">All Years</option>` : '';
    for (let y = cur + 1; y >= cur - 3; y--) {
      opts += `<option value="${y}" ${y === val ? 'selected' : ''}>${y}</option>`;
    }
    return `<select id="${id}" class="form-select">${opts}</select>`;
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function debounce(fn, ms = 300) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  }

  function setLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    const txt = btn.querySelector('.btn-text');
    const ldr = btn.querySelector('.btn-loader');
    if (txt) txt.hidden = loading;
    if (ldr) ldr.hidden = !loading;
  }

  function paginate(items, page, perPage) {
    const start = (page - 1) * perPage;
    return items.slice(start, start + perPage);
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  return {
    MONTH_NAMES, SHORT_MONTHS,
    monthName, shortMonth, todayIso, formatDate, formatDateShort, formatDateTime, formatTime,
    buildMonthSelect, buildYearSelect,
    escapeHtml, debounce, setLoading, paginate,
  };
})();

/* =============================================================================
   SIDEBAR COLLAPSE
   ============================================================================= */
document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
  document.getElementById('sidebar')?.classList.toggle('collapsed');
});

/* =============================================================================
   BOOT — Initialise theme; Auth module will show login screen
   ============================================================================= */
document.addEventListener('DOMContentLoaded', () => {
  ThemeManager.init();
  NotificationCenter.init();
  Chat.init();
  AuthModule.init(); // defined in auth.js
});
