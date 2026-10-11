// Payloads for window.electronAPI.printReceipt, rendered by electron/receipt-template.js.
// Money fields are numbers (numeric strings are tolerated); missing/NaN optional
// fields are simply left off the printout.

export interface ReceiptItem {
  name: string;
  /** Negative on void slips. Weights may be fractional (printed up to 3 dp). */
  quantity: number;
  unitPrice?: number;
  lineTotal?: number;
  /** @deprecated Legacy name for the LINE TOTAL (not the unit price). Prefer lineTotal. */
  price?: number;
}

interface ReceiptCommon {
  // Header
  businessName?: string;
  address?: string;
  /** Bare numbers are printed as "VAT REG TIN: ..."; pre-labelled strings verbatim. */
  tin?: string;
  min?: string;
  serialNumber?: string;
  ptuNumber?: string;
  headerLines?: string[];
  // Meta
  /** ISO 8601 (with zone), epoch ms or Date. Defaults to print time. */
  date?: string | number | Date;
  cashier?: string;
  footerLines?: string[];
}

export interface SaleReceiptPayload extends ReceiptCommon {
  type?: "sale";
  invoiceNumber: string;
  items: ReceiptItem[];
  subtotal?: number;
  /** VAT removed from the SC/PWD share (gross minus the VAT breakdown parts). */
  lessVat?: number;
  discount?: number;
  vatableSales?: number;
  vatAmount?: number;
  vatExemptSales?: number;
  zeroRatedSales?: number;
  total: number;
  paymentMethod?: string;
  referenceNumber?: string;
  amountTendered?: number;
  change?: number;
  customerName?: string;
  scPwdId?: string;
}

export interface VoidSlipPayload extends ReceiptCommon {
  type: "void";
  /** The reversal's own number (e.g. CN-000123). */
  invoiceNumber: string;
  originalInvoiceNumber?: string;
  reason?: string;
  authorizedBy?: string;
  items: ReceiptItem[];
  lessVat?: number;
  discount?: number;
  vatableSales?: number;
  vatAmount?: number;
  vatExemptSales?: number;
  zeroRatedSales?: number;
  total: number;
  paymentMethod?: string;
}

export interface PaymentReceiptPayload extends ReceiptCommon {
  type: "payment";
  invoiceNumber?: string;
  customerName?: string;
  amountPaid: number;
  previousBalance?: number;
  newBalance?: number;
  paymentMethod?: string;
  referenceNumber?: string;
  amountTendered?: number;
  change?: number;
}

export interface StatementPayload extends ReceiptCommon {
  type: "statement";
  invoiceNumber?: string;
  customerName?: string;
  items?: ReceiptItem[];
  /** Balance due. */
  total: number;
}

export type ReceiptPayload =
  | SaleReceiptPayload
  | VoidSlipPayload
  | PaymentReceiptPayload
  | StatementPayload;

/** success:false means nothing was printed; `error` is user-presentable. */
export interface PrintResult {
  success: boolean;
  error?: string;
}

export interface ElectronAPI {
  printReceipt: (data: ReceiptPayload) => Promise<PrintResult>;
  getSyncStatus: () => Promise<{
    connected: boolean;
    lastSync: string | null;
    pendingTransactions: number;
    error: string | null;
  }>;
  onSyncStatusUpdate: (callback: (status: any) => void) => () => void;

  // Security & Kiosk
  setKiosk: (flag: boolean) => Promise<void>;
  forceQuit: () => Promise<void>;
  reloadApp: () => Promise<void>;

  // Listeners (return cleanup functions)
  onRequestQuit: (callback: () => void) => () => void;
  onRequestReload: (callback: () => void) => () => void;
  onEmergencyExit: (callback: () => void) => () => void;

  // Terminal Config
  getTerminalId: () => Promise<string | null>;
  saveTerminalId: (id: string) => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
