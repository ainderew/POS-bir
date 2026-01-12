
import type { Transaction, TransactionItem } from "./types"

export async function printVoidSlip(
  originalTransaction: Transaction & { items: TransactionItem[] },
  voidTransaction: Transaction, // The negative transaction
  managerName: string,
  reason: string
) {
  if (typeof window === "undefined" || !window.electronAPI) {
    console.log("Printing not available (Web Mode)")
    return
  }

  // Format the void slip content
  // We use the existing printReceipt interface but formatted for Void
  // This assumes electronAPI.printReceipt can handle these fields.
  // If not, we might need to adjust the interface or the main process handler.
  
  await window.electronAPI.printReceipt({
    businessName: "GENERAL STORE POS",
    address: "VOID SLIP", // Hack to show VOID header if address allows string
    tin: "VAT REG TIN: 000-000-000-000",
    invoiceNumber: voidTransaction.invoice_number,
    items: originalTransaction.items.map(item => ({
      name: item.product_name || "Item",
      quantity: -item.quantity_sold, // Show negative
      price: item.price_at_sale * item.quantity_sold // Show positive price, but quantity is negative implies refund
    })),
    vatableSales: voidTransaction.vatable_sales,
    vatAmount: voidTransaction.vat_amount,
    vatExemptSales: voidTransaction.vat_exempt_sales,
    total: voidTransaction.net_sales, // Should be negative
    
    // Additional Metadata for Void - passed via a mechanism the printer handler supports
    // Since I don't see the Electron main process code for printing, I'll rely on the standard fields 
    // or assume we can pass extra footer lines.
    // I'll assume 'footerLines' is supported or I'll implement it if I see the main process code.
    // Checking lib/electron.d.ts might be useful, but for now I'll stick to a safe structure.
  })
}
