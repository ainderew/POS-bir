const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  printReceipt: (data) => ipcRenderer.invoke('print-receipt', data),
  getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),
  onSyncStatusUpdate: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('sync-status-updated', listener);
    return () => ipcRenderer.removeListener('sync-status-updated', listener);
  },

  // Security & Kiosk
  setKiosk: (flag) => ipcRenderer.invoke('set-kiosk', flag),
  forceQuit: () => ipcRenderer.invoke('force-quit-app'),
  reloadApp: () => ipcRenderer.invoke('reload-app'),

  // Listeners (return cleanup functions)
  onRequestQuit: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('request-quit-auth', listener);
    return () => ipcRenderer.removeListener('request-quit-auth', listener);
  },
  onRequestReload: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('request-reload-auth', listener);
    return () => ipcRenderer.removeListener('request-reload-auth', listener);
  },
  onEmergencyExit: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('trigger-emergency-exit', listener);
    return () => ipcRenderer.removeListener('trigger-emergency-exit', listener);
  },

  // Terminal Configuration (Persistence)
  getTerminalId: () => ipcRenderer.invoke('get-terminal-id'),
  saveTerminalId: (id) => ipcRenderer.invoke('save-terminal-id', id),
});
