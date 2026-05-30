/**
 * LocalPayroll - Main Process (Electron)
 * Manages the BrowserWindow, IPC registration, and app lifecycle.
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');

// ─── Keep a global reference to prevent GC ───────────────────────────────────
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    title: 'LocalPayroll',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,   // Security: isolate renderer context
      nodeIntegration: false,   // Security: no direct Node access in renderer
    },
    backgroundColor: '#0f1117',
    show: false, // Show after ready-to-show to avoid white flash
    frame: true,
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Graceful show: prevents white flash on startup
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Forward console messages from renderer to main process terminal for debugging
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] [${path.basename(sourceId)}:${line}] ${message}`);
  });

  // Open external links in the system browser (for WhatsApp deeplinks)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (e) => {
    // Prevent default close unless forcefully allowed
    if (!app.isForceClose) {
      e.preventDefault();
      mainWindow.webContents.send('trigger-sync-close');
    }
  });
}

// ─── Register all IPC handlers ────────────────────────────────────────────────
// NOTE: backup handler receives a getter fn (() => mainWindow) so it always
// has the live BrowserWindow reference even after createWindow() is called.
function registerIpcHandlers() {
  require('./src/ipc/auth')(ipcMain);
  require('./src/ipc/employees')(ipcMain);
  require('./src/ipc/attendance')(ipcMain);
  require('./src/ipc/advances')(ipcMain);
  require('./src/ipc/payments')(ipcMain);
  require('./src/ipc/reports')(ipcMain, () => mainWindow);
  require('./src/ipc/settings')(ipcMain);
  require('./src/ipc/backup')(ipcMain, () => mainWindow, dialog);
  require('./src/ipc/staff_docs')(ipcMain);
  require('./src/ipc/leaves')(ipcMain);
  require('./src/ipc/expenses')(ipcMain);
  require('./src/ipc/projects')(ipcMain);
  require('./src/ipc/audit')(ipcMain);
  require('./src/ipc/accommodation')(ipcMain);
  require('./src/ipc/alerts').registerAlertHandlers(ipcMain);
  require('./src/ipc/chats')(ipcMain);
  require('./src/ipc/sync')(ipcMain, app, () => mainWindow);
  require('./src/ipc/performance').registerPerformanceHandlers();
  require('./src/ipc/assets')();
}

const { acquireSessionLock, autoRestoreFromOneDrive, releaseSessionLock } = require('./src/utils/syncHelper');

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // 1. Check and acquire session lock from OneDrive
  acquireSessionLock(app, dialog);

  // 2. Perform auto-restoration if OneDrive has a newer database backup
  autoRestoreFromOneDrive();

  // Run DB migrations BEFORE creating the window
  require('./src/database/migrations').runMigrations();

  // createWindow first so mainWindow is set before IPC handlers that need it
  createWindow();
  registerIpcHandlers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', (e) => {
  if (!app.isForceClose) {
    e.preventDefault();
    if (mainWindow) mainWindow.webContents.send('trigger-sync-close');
  }
});

app.on('will-quit', () => {
  // Safe cleanup of OneDrive session lock on app exit
  releaseSessionLock();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
