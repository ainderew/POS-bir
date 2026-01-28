const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

let Store;
let store;

// Initialize Store dynamically (since it might be an ESM module)
(async () => {
  try {
    const module = await import('electron-store');
    Store = module.default;
    store = new Store();
  } catch (error) {
    console.error('Failed to load electron-store:', error);
  }
})();

let mainWindow;
let canQuit = false;

// Sync State
let syncStatus = {
  connected: false,
  lastSync: null,
  pendingTransactions: 0,
  error: null
};

// SQLite Database initialization
function initSqlite() {
  const Database = require('better-sqlite3');
  const dbPath = path.join(app.getPath('userData'), 'pos.db');
  process.env.SQLITE_PATH = dbPath;

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run schema if tables don't exist
  const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get();
  if (!tableCheck) {
    const schemaPath = path.join(__dirname, '../scripts/sqlite_schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
    console.log('[POS] Database initialized at:', dbPath);
  }

  db.close(); // Close; lib/db.ts will open its own connection
}

function getPendingCount() {
  try {
    const Database = require('better-sqlite3');
    const dbPath = process.env.SQLITE_PATH;
    if (!dbPath) return;

    const db = new Database(dbPath, { readonly: true });
    const result = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE is_synced = 0').get();
    syncStatus.pendingTransactions = parseInt(result.count);
    mainWindow?.webContents.send('sync-status-updated', syncStatus);
    db.close();
  } catch (e) {
    console.error('Error fetching pending count:', e);
  }
}

function createWindow() {
  const isDev = process.env.NODE_ENV === 'development';

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    fullscreen: !isDev,
    kiosk: !isDev,
    alwaysOnTop: !isDev,
    frame: isDev,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const url = isDev ? 'http://localhost:3000/pos' : 'http://localhost:3000/pos';
  mainWindow.loadURL(url);

  // Prevent closing without PIN
  mainWindow.on('close', (e) => {
    if (!canQuit && !isDev) {
      e.preventDefault();
      mainWindow.webContents.send('request-quit-auth');
    }
  });

  // Block sensitive keys
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (isDev) return;

    const isReload = input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r') || (input.meta && input.key.toLowerCase() === 'r');
    const isDevTools = (input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12';

    if (isReload) {
      event.preventDefault();
      mainWindow.webContents.send('request-reload-auth');
    }

    if (isDevTools) {
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('set-kiosk', (event, flag) => {
  if (mainWindow) {
    mainWindow.setKiosk(flag);
    mainWindow.setFullScreen(true); // Always maintain full screen even if kiosk is exited
    mainWindow.setAlwaysOnTop(flag);
  }
});

ipcMain.handle('force-quit-app', () => {
  canQuit = true;
  app.quit();
});

ipcMain.handle('reload-app', () => {
  if (mainWindow) mainWindow.reload();
});

ipcMain.handle('print-receipt', async (event, data) => {
  console.log('Direct printing placeholder...');
  return { success: true };
});

ipcMain.handle('get-sync-status', () => syncStatus);

ipcMain.handle('get-terminal-id', () => {
  return store ? store.get('terminalId', null) : null;
});

ipcMain.handle('save-terminal-id', (event, id) => {
  if (store) {
    store.set('terminalId', id);
    return true;
  }
  return false;
});

app.on('ready', () => {
  initSqlite();
  createWindow();
  getPendingCount();

  // Emergency Exit Shortcut: Shift + 0 + U
  globalShortcut.register('Shift+0+U', () => {
    if (mainWindow) {
      mainWindow.webContents.send('trigger-emergency-exit');
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
