/**
 * LocalPayroll — Notification Center
 * Handles the real-time alerting system, bell UI, and notification history.
 */
const NotificationCenter = (() => {
  const $ = id => document.getElementById(id);
  let _isOpen = false;
  let _alerts = [];
  let _unreadCount = 0;
  let _pollTimer = null;
  let _soundOn = localStorage.getItem('lp_notif_sound') !== 'off';

  function init() {
    // 1. Attach UI Listeners
    $('notif-bell')?.addEventListener('click', e => {
      e.stopPropagation();
      toggleDropdown();
    });

    $('notif-mark-all')?.addEventListener('click', e => {
      e.stopPropagation();
      markAllRead();
    });

    $('notif-clear-all')?.addEventListener('click', e => {
      e.stopPropagation();
      clearAll();
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (_isOpen && !$('notif-dropdown')?.contains(e.target) && !$('notif-bell')?.contains(e.target)) {
        closeDropdown();
      }
    });

    // 2. Start Polling
    startPolling();

    // 3. Listen for data events to refresh immediately
    EventBus.on('data:attendance', () => refresh());
    EventBus.on('data:advance', () => refresh());
    EventBus.on('data:leave', () => refresh());
    EventBus.on('data:payroll', () => refresh());
    EventBus.on('data:ocr', () => refresh());
  }

  async function startPolling() {
    await refresh();
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(refresh, 30000); // Every 30 seconds
  }

  async function refresh() {
    try {
      // a) Run Rules Engine on backend (generates new alerts)
      await API.runAlertRules();

      // b) Fetch alerts
      const res = await API.getAlerts({ isRead: 0 }); // Only pending
      if (res.success) {
        const newUnreadCount = res.summary?.unreadCount || 0;
        
        // c) Check if we have new unread notifications since last refresh
        if (newUnreadCount > _unreadCount) {
          triggerNewNotifAnimation();
        }

        _alerts = res.alerts || [];
        _unreadCount = newUnreadCount;
        updateUI();
      }
    } catch (err) {
      console.error('[NotificationCenter] Refresh error:', err);
    }
  }

  function updateUI() {
    const countEl = $('notif-count');
    if (countEl) {
      countEl.textContent = _unreadCount;
      countEl.hidden = (_unreadCount === 0);
    }

    const listEl = $('notif-list');
    if (!listEl) return;

    if (_alerts.length === 0) {
      listEl.innerHTML = `
        <div class="notif-empty">
          <div class="notif-empty-icon">🔔</div>
          <p>All caught up!</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = _alerts.map(a => renderNotifItem(a)).join('');

    // Attach item listeners
    listEl.querySelectorAll('.notif-item').forEach(el => {
      el.addEventListener('click', () => handleNotifClick(el.dataset.id, el.dataset.module));
    });

    listEl.querySelectorAll('.btn-resolve, .btn-approve, .btn-view').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        handleAction(btn.dataset.id, btn.dataset.action, btn.dataset.module);
      });
    });
  }

  function renderNotifItem(a) {
    const time = Helpers.formatDateTime(a.created_at);
    const isUnread = !a.is_read;
    const moduleIcon = getModuleIcon(a.module);
    
    return `
      <div class="notif-item ${a.module} ${isUnread ? 'unread' : ''}" data-id="${a.id}" data-module="${a.module}">
        <div class="notif-icon">${moduleIcon}</div>
        <div class="notif-content">
          <span class="notif-title">${Helpers.escapeHtml(a.title)}</span>
          <span class="notif-msg">${Helpers.escapeHtml(a.message)}</span>
          <div class="notif-footer">
            <span class="notif-time">${time}</span>
            <div class="notif-actions">
              ${getActionButtons(a)}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function getModuleIcon(mod) {
    const map = {
      Attendance: '📅',
      Payroll:    '💰',
      Advances:   '💸',
      Leaves:     '🌴',
      Documents:  '📄',
      Projects:   '🏗️',
      Employees:  '👤'
    };
    return map[mod] || '🔔';
  }

  function getActionButtons(a) {
    if (a.module === 'Leaves') {
      return `<button class="btn-approve" data-id="${a.id}" data-action="leaves" data-module="Leaves">Approve</button>`;
    }
    if (a.module === 'Advances') {
      return `<button class="btn-resolve" data-id="${a.id}" data-action="advances" data-module="Advances">Review</button>`;
    }
    if (a.module === 'Attendance') {
      return `<button class="btn-view" data-id="${a.id}" data-action="attendance" data-module="Attendance">View</button>`;
    }
    return `<button class="btn-sm" data-id="${a.id}" data-action="markRead" data-module="${a.module}">Dismiss</button>`;
  }

  function triggerNewNotifAnimation() {
    const bell = $('notif-bell');
    if (!bell) return;
    
    bell.classList.remove('ringing');
    void bell.offsetWidth; // Trigger reflow
    bell.classList.add('ringing');

    if (_soundOn) {
      // Sound implementation if audio file exists
    }
  }

  function toggleDropdown() {
    if (_isOpen) closeDropdown();
    else openDropdown();
  }

  function openDropdown() {
    _isOpen = true;
    $('notif-dropdown')?.classList.add('show');
    refresh(); // Refresh on open
  }

  function closeDropdown() {
    _isOpen = false;
    $('notif-dropdown')?.classList.remove('show');
  }

  async function markAllRead() {
    const res = await API.markAlertRead('all', true);
    if (res.success) {
      _unreadCount = 0;
      _alerts = [];
      updateUI();
      Toast.success('All notifications marked as read.');
    }
  }

  async function clearAll() {
    Modal.confirm('Clear all notification history?', async () => {
      const res = await API.deleteAlert('all');
      if (res.success) {
        _unreadCount = 0;
        _alerts = [];
        updateUI();
        Toast.success('Notification center cleared.');
      }
    });
  }

  async function handleNotifClick(id, module) {
    await API.markAlertRead(id, true);
    refresh();
    // Navigate if needed
    if (module) {
      const pageMap = {
        'Attendance': 'attendance',
        'Advances':   'advances',
        'Leaves':     'leaves',
        'Payroll':    'payments',
        'Documents':  'staff-docs',
        'Projects':   'projects'
      };
      if (pageMap[module]) Router.navigate(pageMap[module]);
    }
    closeDropdown();
  }

  async function handleAction(id, action, module) {
    await API.markAlertRead(id, true);
    if (action === 'leaves') Router.navigate('leaves');
    else if (action === 'advances') Router.navigate('advances');
    else if (action === 'attendance') Router.navigate('attendance');
    
    refresh();
    closeDropdown();
  }

  return { init, refresh };
})();

window.NotificationCenter = NotificationCenter;
