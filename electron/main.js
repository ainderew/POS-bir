const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// File-based logging for production debugging
const logFile = path.join(app.getPath('userData'), 'pos-debug.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB

// Rotate log on startup if too large
try {
  if (fs.existsSync(logFile) && fs.statSync(logFile).size > MAX_LOG_SIZE) {
    const backup = logFile + '.old';
    if (fs.existsSync(backup)) fs.unlinkSync(backup);
    fs.renameSync(logFile, backup);
  }
} catch {}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(msg);
  fs.appendFileSync(logFile, line);
}

// Capture runtime errors from Next.js server (API route failures, etc.)
process.on('uncaughtException', (err) => {
  log('UNCAUGHT EXCEPTION: ' + err.message + '\n' + err.stack);
});
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message + '\n' + reason.stack : String(reason);
  log('UNHANDLED REJECTION: ' + msg);
});

// Route console.error to log file so Next.js server errors are captured
const _origConsoleError = console.error;
console.error = (...args) => {
  const msg = args.map(a => (typeof a === 'string' ? a : (a instanceof Error ? a.message + '\n' + a.stack : JSON.stringify(a)))).join(' ');
  log('[stderr] ' + msg);
  _origConsoleError.apply(console, args);
};

let nextServerProcess = null;

// Simple JSON file store (replaces electron-store to avoid ESM/pnpm dep issues)
const storeFile = path.join(app.getPath('userData'), 'pos-config.json');

function storeGet(key, defaultValue = null) {
  try {
    const data = JSON.parse(fs.readFileSync(storeFile, 'utf-8'));
    return data[key] !== undefined ? data[key] : defaultValue;
  } catch {
    return defaultValue;
  }
}

function storeSet(key, value) {
  let data = {};
  try { data = JSON.parse(fs.readFileSync(storeFile, 'utf-8')); } catch {}
  data[key] = value;
  fs.writeFileSync(storeFile, JSON.stringify(data, null, 2));
}

// Single instance lock — quit if another instance is already running
// Consistent isDev check used throughout the app
const isDev = !app.isPackaged;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
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

// Helper to wait for a port to be available
function waitForPort(port, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function tryConnect() {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.on('connect', () => {
        socket.destroy();
        log(`Port ${port} is ready`);
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() - start > timeout) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(tryConnect, 100);
        }
      });
      socket.on('timeout', () => {
        socket.destroy();
        if (Date.now() - start > timeout) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(tryConnect, 100);
        }
      });
      socket.connect(port, 'localhost');
    }
    tryConnect();
  });
}

// Start Next.js server
function startNextServer() {
  log(`startNextServer called, isDev=${isDev}, resourcesPath=${process.resourcesPath}`);

  return new Promise((resolve, reject) => {
    if (isDev) {
      // Development: spawn next dev
      const nextBin = require.resolve('next/dist/bin/next');
      const cwd = path.join(__dirname, '..');
      log(`Dev mode: spawning next dev`);

      nextServerProcess = spawn(process.execPath, [nextBin, 'dev', '--port', '3000'], {
        cwd,
        env: process.env,
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

      // Timeout fallback for dev mode
      const devTimeout = setTimeout(() => {
        log('Dev server timeout fallback — resolving after 30s');
        resolve();
      }, 30000);

      nextServerProcess.on('exit', (code) => {
        log(`[Next.js] exited with code ${code}`);
        nextServerProcess = null;
        clearTimeout(devTimeout);
      });
    } else {
      // Production: require the server directly (Electron IS Node.js)
      const standaloneDir = path.join(process.resourcesPath, 'standalone');
      let serverPath = path.join(standaloneDir, 'server.js');

      if (!fs.existsSync(serverPath)) {
        // Next.js standalone nests files under the project's filesystem path
        const findFile = (dir, name, depth = 0) => {
          if (depth > 5) return null;
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const e of entries) {
            if (e.isFile() && e.name === name) return path.join(dir, e.name);
          }
          for (const e of entries) {
            if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.next') {
              const found = findFile(path.join(dir, e.name), name, depth + 1);
              if (found) return found;
            }
          }
          return null;
        };
        const found = findFile(standaloneDir, 'server.js');
        if (found) {
          log(`Found server.js at nested path: ${found}`);
          serverPath = found;
        }
      }

      const serverDir = path.dirname(serverPath);

      log(`Production mode: requiring server directly`);
      log(`Server path: ${serverPath}, exists: ${fs.existsSync(serverPath)}`);
      log(`Standalone dir: ${standaloneDir}, exists: ${fs.existsSync(standaloneDir)}`);

      // Diagnostic: log standalone directory contents (2 levels deep, skip node_modules)
      const logDirContents = (dir, prefix = '', depth = 0) => {
        if (depth > 2) return;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const e of entries) {
            if (e.name === 'node_modules') continue;
            const fullPath = path.join(dir, e.name);
            log(`  ${prefix}${e.isDirectory() ? '[D]' : '[F]'} ${e.name}`);
            if (e.isDirectory()) {
              logDirContents(fullPath, prefix + '  ', depth + 1);
            }
          }
        } catch (err) {
          log(`  ${prefix}(error reading dir: ${err.message})`);
        }
      };
      log('Standalone directory contents:');
      logDirContents(standaloneDir);

      // Check node_modules explicitly (skipped by logDirContents above)
      const nmDir = path.join(serverDir, 'node_modules');
      const nmExists = fs.existsSync(nmDir);
      log(`node_modules exists: ${nmExists}, path: ${nmDir}`);
      if (nmExists) {
        try {
          const nmEntries = fs.readdirSync(nmDir).slice(0, 10);
          log(`node_modules contents (first 10): ${nmEntries.join(', ')}`);
        } catch {}
      }

      // Set up environment
      process.env.PORT = '3000';
      process.env.HOSTNAME = '127.0.0.1';

      // Change to directory containing server.js so relative imports work
      process.chdir(serverDir);
      log(`Changed CWD to: ${process.cwd()}`);

      // Ensure NODE_PATH includes both the server dir and standalone root node_modules
      const nodePaths = [
        path.join(serverDir, 'node_modules'),
        path.join(standaloneDir, 'node_modules'),
      ].join(path.delimiter);
      process.env.NODE_PATH = nodePaths;
      require('module').Module._initPaths();
      log(`NODE_PATH set to: ${nodePaths}`);
      log(`SQLITE_PATH = ${process.env.SQLITE_PATH}`);

      // Next.js Turbopack mangles external package names with a build hash
      // (e.g. require('better-sqlite3-90e2652d1716b047')). Intercept these
      // and redirect to the real module name.
      const Module = require('module');
      const origResolveFilename = Module._resolveFilename;
      Module._resolveFilename = function (request, ...args) {
        if (request.startsWith('better-sqlite3-')) {
          return origResolveFilename.call(this, 'better-sqlite3', ...args);
        }
        return origResolveFilename.call(this, request, ...args);
      };

      // Test-load better-sqlite3 from standalone to verify native binding works
      try {
        const bsqlitePath = path.join(standaloneDir, 'node_modules', 'better-sqlite3');
        const TestDb = require(bsqlitePath);
        const testDb = new TestDb(':memory:');
        testDb.close();
        log('better-sqlite3 test-load: OK (native binding works)');
      } catch (err) {
        log('better-sqlite3 test-load FAILED: ' + err.message + '\n' + err.stack);
      }

      // Require the server - it will start listening
      try {
        require(serverPath);
        log('Server module loaded, waiting for port...');

        // Wait for the server to be ready
        const timeout = process.platform === 'win32' ? 45000 : 20000;
        waitForPort(3000, timeout).then(resolve).catch(reject);
      } catch (err) {
        log('Failed to require server: ' + err.message);
        reject(err);
      }
    }
  });
}

function createWindow() {
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
      sandbox: true,
      webSecurity: true,
    },
  });

  // Go to /pos if terminal is registered, otherwise go to home for setup
  const terminalId = storeGet('terminalId');
  const startPath = terminalId ? '/pos' : '/';
  const url = `http://localhost:3000${startPath}`;
  log(`Loading URL: ${url}, terminalId=${terminalId}`);
  mainWindow.loadURL(url);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

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
    mainWindow.setFullScreen(flag);
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
  return storeGet('terminalId');
});

ipcMain.handle('save-terminal-id', (event, id) => {
  if (typeof id !== 'string' || id.length > 256) return false;
  storeSet('terminalId', id);
  return true;
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
  log('Store file: ' + storeFile);
  initSqlite();
  log('SQLite initialized');

  try {
    log('Starting Next.js server...');
    await startNextServer();
    log('Next.js server started successfully');
  } catch (err) {
    log('Failed to start Next.js server: ' + err.message);
    dialog.showErrorBox(
      'Startup Error',
      `Failed to start the application server.\n\n${err.message}\n\nSee log file for details:\n${logFile}`
    );
    app.quit();
    return;
  }

  log('Creating window...');
  createWindow();
  log('Window created');
  getPendingCount();

  // Emergency Exit Shortcut
  const registered = globalShortcut.register('CommandOrControl+Shift+U', () => {
    if (mainWindow) {
      mainWindow.webContents.send('trigger-emergency-exit');
    }
  });
  if (!registered) {
    log('WARNING: Emergency exit shortcut failed to register');
  }
});

app.on('before-quit', (e) => {
  if (!canQuit && !isDev) {
    e.preventDefault();
    if (mainWindow) {
      mainWindow.webContents.send('request-quit-auth');
    }
    return;
  }
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
