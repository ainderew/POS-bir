export interface ElectronAPI {
  printReceipt: (data: any) => Promise<{ success: boolean; error?: string }>;
  getSyncStatus: () => Promise<{
    connected: boolean;
    lastSync: string | null;
    pendingTransactions: number;
    error: string | null;
  }>;
  onSyncStatusUpdate: (callback: (status: any) => void) => void;
  
  // Security & Kiosk
  setKiosk: (flag: boolean) => Promise<void>;
  forceQuit: () => Promise<void>;
  reloadApp: () => Promise<void>;
  
  // Listeners
  onRequestQuit: (callback: () => void) => void;
  onRequestReload: (callback: () => void) => void;
  onEmergencyExit: (callback: () => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
