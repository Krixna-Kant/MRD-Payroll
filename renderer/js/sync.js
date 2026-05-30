/**
 * LocalPayroll — Safe Exit / Sync Flow
 * Intercepts the "Close ERP" button and triggers the safe sync and exit process.
 */

document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('close_app');
  if (!closeBtn) return;

  const overlay = document.getElementById('sync-modal-overlay');
  const btnRetry = document.getElementById('btn-retry-sync');
  const btnOneDrive = document.getElementById('btn-open-onedrive');
  const btnForceClose = document.getElementById('btn-force-close');
  
  let syncInterval;
  let isSyncing = false;

  closeBtn.addEventListener('click', async () => {
    overlay.hidden = false;
    startSyncFlow();
  });

  if (window.API && window.API.onTriggerSyncClose) {
    window.API.onTriggerSyncClose(() => {
      overlay.hidden = false;
      startSyncFlow();
    });
  }

  btnRetry.addEventListener('click', () => {
    resetSyncUI();
    startSyncFlow();
  });

  btnOneDrive.addEventListener('click', async () => {
    await window.API.openOneDrive();
  });

  btnForceClose.addEventListener('click', async () => {
    if (confirm("Are you sure you want to force close? This may cause data corruption!")) {
      await window.API.forceCloseApp();
    }
  });

  async function startSyncFlow() {
    if (isSyncing) return;
    isSyncing = true;
    
    resetSyncUI();
    document.getElementById('safe_exit').style.display = 'block';

    try {
      await window.API.startSync();
      
      // Poll status every 2 seconds
      syncInterval = setInterval(async () => {
        const res = await window.API.getSyncStatus();
        updateSteps(res.steps);
        
        if (res.status === 'completed') {
          clearInterval(syncInterval);
          showSuccess();
        } else if (res.status === 'error') {
          clearInterval(syncInterval);
          showError(res.message);
        }
      }, 2000);
      
    } catch (err) {
      showError(err.message || 'Failed to start sync');
    }
  }

  function updateSteps(steps) {
    if (!steps) return;
    const icons = { pending: '⏳', running: '🔄', done: '✅', error: '❌' };
    const classes = { pending: 'text-muted', running: 'text-primary', done: 'text-success', error: 'text-danger' };

    ['save', 'backup', 'status', 'wait', 'lock'].forEach(step => {
      const el = document.getElementById(`step-${step}`);
      if (el && steps[step]) {
        el.className = `sync-step ${classes[steps[step].state]}`;
        el.innerHTML = `${icons[steps[step].state]} ${steps[step].label}`;
      }
    });
  }

  function resetSyncUI() {
    document.getElementById('sync-spinner').style.display = 'block';
    document.getElementById('sync_message').style.display = 'block';
    document.getElementById('close_flow').style.display = 'block';
    document.getElementById('sync_complete').style.display = 'none';
    document.getElementById('sync_failed').style.display = 'none';
    document.getElementById('force_warning').style.display = 'none';
    document.getElementById('sync-actions').style.display = 'none';
    btnForceClose.style.display = 'none';
    
    // Reset steps
    const initialSteps = {
      save: { state: 'pending', label: 'Save Pending Data' },
      backup: { state: 'pending', label: 'Create Backup' },
      status: { state: 'pending', label: 'Check OneDrive Sync Status' },
      wait: { state: 'pending', label: 'Wait Until Sync Completes' },
      lock: { state: 'pending', label: 'Remove Session Lock' },
    };
    updateSteps(initialSteps);
  }

  function showSuccess() {
    document.getElementById('sync-spinner').style.display = 'none';
    document.getElementById('sync_message').style.display = 'none';
    document.getElementById('safe_exit').style.display = 'none';
    document.getElementById('sync_complete').style.display = 'block';
    
    // Wait 2 seconds before closing
    setTimeout(async () => {
      await window.API.forceCloseApp();
    }, 2000);
  }

  function showError(msg) {
    isSyncing = false;
    document.getElementById('sync-spinner').style.display = 'none';
    document.getElementById('sync_failed').style.display = 'block';
    document.getElementById('sync-actions').style.display = 'flex';
    
    // Only Admin can force close
    const user = window.AppState ? window.AppState.get('user') : null;
    if (user && user.role === 'admin') {
      btnForceClose.style.display = 'inline-block';
      document.getElementById('force_warning').style.display = 'block';
    }
  }
});
