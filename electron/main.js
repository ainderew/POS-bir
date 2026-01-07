const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { exec, execSync } = require('child_process');
const { Pool } = require('pg');

let mainWindow;
let pool;
let canQuit = false;

// Sync State
let syncStatus = {
  connected: false,
  lastSync: null,
  pendingTransactions: 0,
  error: null
};

// Database connection
function initDb() {
  pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '54320'),
    database: process.env.POSTGRES_DATABASE || 'pos_db',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
  });
}

async function getPendingCount() {
  if (!pool) return;
  try {
    const result = await pool.query('SELECT COUNT(*) FROM transactions WHERE is_synced = FALSE');
    syncStatus.pendingTransactions = parseInt(result.rows[0].count);
    mainWindow?.webContents.send('sync-status-updated', syncStatus);
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

function ensureDocker() {
  try {
    execSync('docker info');
    exec('docker-compose up -d', (error) => {
      if (!error) {
        initDb();
        getPendingCount();
      }
    });
  } catch (e) {
    if (process.env.NODE_ENV !== 'development') {
      dialog.showErrorBox('Docker Not Found', 'Please ensure Docker is running.');
      app.quit();
    }
  }
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

app.on('ready', () => {
  ensureDocker();
  createWindow();

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
