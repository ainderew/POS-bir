const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// File-based logging for production debugging
const logFile = path.join(app.getPath('userData'), 'pos-debug.log');
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(msg);
  fs.appendFileSync(logFile, line);
}

let store;
let nextServerProcess = null;

// Initialize Store dynamically (since it might be an ESM module)
const storeReady = (async () => {
  try {
    const module = await import('electron-store');
    store = new module.default();
  } catch (error) {
    console.error('Failed to load electron-store:', error);
  }
})();

// Single instance lock — quit if another instance is already running
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

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
    const schemaPath = app.isPackaged
      ? path.join(process.resourcesPath, 'scripts/sqlite_schema.sql')
      : path.join(__dirname, '../scripts/sqlite_schema.sql');
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

// Start Next.js server using Electron's Node.js runtime
function startNextServer() {
  const isDev = !app.isPackaged;
  log(`startNextServer called, isDev=${isDev}, resourcesPath=${process.resourcesPath}`);

  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    let serverArgs;
    let cwd;

    if (isDev) {
      const nextBin = require.resolve('next/dist/bin/next');
      serverArgs = [nextBin, 'dev', '--port', '3000'];
      cwd = path.join(__dirname, '..');
    } else {
      const serverPath = path.join(process.resourcesPath, 'standalone/server.js');
      log(`Production server path: ${serverPath}`);
      log(`Server exists: ${fs.existsSync(serverPath)}`);
      env.PORT = '3000';
      env.HOSTNAME = '0.0.0.0';
      serverArgs = [serverPath];
      cwd = path.join(process.resourcesPath, 'standalone');
      log(`CWD: ${cwd}, exists: ${fs.existsSync(cwd)}`);
    }

    log(`Spawning: ${process.execPath} ${serverArgs.join(' ')}`);
    nextServerProcess = spawn(process.execPath, serverArgs, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    nextServerProcess.stdout.on('data', (data) => {
      const output = data.toString();
      log('[Next.js stdout] ' + output.trim());
      if (output.includes('Ready') || output.includes('Listening') || output.includes('started server')) {
        log('Server ready signal detected');
        resolve();
      }
    });

    nextServerProcess.stderr.on('data', (data) => {
      log('[Next.js stderr] ' + data.toString().trim());
    });

    nextServerProcess.on('error', (err) => {
      log('[Next.js] Failed to start: ' + err.message);
      reject(err);
    });

    nextServerProcess.on('exit', (code) => {
      log(`[Next.js] exited with code ${code}`);
      nextServerProcess = null;
    });

    // Timeout fallback: resolve after 30s even if no ready signal
    setTimeout(() => resolve(), 30000);
  });
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

  // Go to /pos if terminal is registered, otherwise go to home for setup
  const terminalId = store ? store.get('terminalId', null) : null;
  const startPath = terminalId ? '/pos' : '/';
  const url = `http://localhost:3000${startPath}`;
  log(`Loading URL: ${url}, terminalId=${terminalId}`);
  mainWindow.loadURL(url);

  // Temporarily open devTools for debugging white screen
  mainWindow.webContents.openDevTools();

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    log(`Page failed to load: ${errorCode} - ${errorDescription}`);
  });

  // Clear stale localStorage terminal ID if electron-store has none
  if (!terminalId) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.executeJavaScript('localStorage.removeItem("pos_terminal_id")');
    });
  }

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

ipcMain.handle('get-terminal-id', async () => {
  await storeReady;
  return store ? store.get('terminalId', null) : null;
});

ipcMain.handle('save-terminal-id', async (event, id) => {
  await storeReady;
  if (store) {
    store.set('terminalId', id);
    return true;
  }
  return false;
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('ready', async () => {
  log('App ready, isPackaged=' + app.isPackaged);
  log('userData path: ' + app.getPath('userData'));
  await storeReady;
  log('Store ready');
  initSqlite();
  log('SQLite initialized');

  try {
    log('Starting Next.js server...');
    await startNextServer();
    log('Next.js server started successfully');
  } catch (err) {
    log('Failed to start Next.js server: ' + err.message);
    dialog.showErrorBox('Startup Error', 'Failed to start the application server.');
    app.quit();
    return;
  }

  log('Creating window...');
  createWindow();
  log('Window created');
  getPendingCount();

  // Emergency Exit Shortcut: Shift + 0 + U
  globalShortcut.register('Shift+0+U', () => {
    if (mainWindow) {
      mainWindow.webContents.send('trigger-emergency-exit');
    }
  });
});

app.on('before-quit', () => {
  if (nextServerProcess) {
    nextServerProcess.kill();
    nextServerProcess = null;
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (nextServerProcess) {
    nextServerProcess.kill('SIGKILL');
    nextServerProcess = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
