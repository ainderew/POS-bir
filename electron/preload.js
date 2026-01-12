const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  printReceipt: (data) => ipcRenderer.invoke('print-receipt', data),
  getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),
  onSyncStatusUpdate: (callback) => ipcRenderer.on('sync-status-updated', (_event, value) => callback(value)),
  
  // Security & Kiosk
  setKiosk: (flag) => ipcRenderer.invoke('set-kiosk', flag),
  forceQuit: () => ipcRenderer.invoke('force-quit-app'),
  reloadApp: () => ipcRenderer.invoke('reload-app'),
  
  // Listeners
  onRequestQuit: (callback) => ipcRenderer.on('request-quit-auth', () => callback()),
  onRequestReload: (callback) => ipcRenderer.on('request-reload-auth', () => callback()),
  onEmergencyExit: (callback) => ipcRenderer.on('trigger-emergency-exit', () => callback()),

  // Terminal Configuration (Persistence)
  getTerminalId: () => ipcRenderer.invoke('get-terminal-id'),
  saveTerminalId: (id) => ipcRenderer.invoke('save-terminal-id', id),
});
