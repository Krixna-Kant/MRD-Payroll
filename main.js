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

  // Open external links in the system browser (for WhatsApp deeplinks)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
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
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Run DB migrations BEFORE creating the window
  require('./src/database/migrations').runMigrations();

  // createWindow first so mainWindow is set before IPC handlers that need it
  createWindow();
  registerIpcHandlers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
