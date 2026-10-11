import type { PrintResult, VoidSlipPayload } from "./electron"
import type { Transaction, TransactionItem } from "./types"
import { lessVatOf } from "./ph-tax"

/**
 * Print the void slip for a reversal through the Electron print bridge.
 *
 * Resolves with the PrintResult when the slip was sent to the printer.
 * Throws an Error (message = printer error) when printing was attempted but
 * failed, so callers' try/catch can surface it. In web mode (no Electron) it
 * resolves with success:false without throwing, as printing is unavailable.
 */
export async function printVoidSlip(
  originalTransaction: Transaction & { items: TransactionItem[] },
  voidTransaction: Transaction, // The negative (reversal) transaction
  managerName: string,
  reason: string
): Promise<PrintResult> {
  if (typeof window === "undefined" || !window.electronAPI) {
    console.log("Printing not available (Web Mode)")
    return { success: false, error: "Printing not available (web mode)" }
  }

  // Real business header for the BIR slip; print without it rather than with placeholders.
  let settings: Record<string, string> = {}
  try {
    const res = await fetch("/api/settings")
    if (res.ok) settings = await res.json()
  } catch (error) {
    console.error("[v0] Void slip: failed to load business settings", error)
  }

  const payload: VoidSlipPayload = {
    type: "void",
    businessName: settings.business_name,
    address: settings.business_address,
    tin: settings.business_tin,
    invoiceNumber: voidTransaction.invoice_number,
    originalInvoiceNumber: originalTransaction.invoice_number,
    reason,
    authorizedBy: managerName,
    items: originalTransaction.items.map((item) => {
      const quantity = Number(item.quantity_sold)
      const unitPrice = Number(item.price_at_sale)
      return {
        name: item.product_name || "Item",
        quantity: -quantity,
        unitPrice,
        lineTotal: -(quantity * unitPrice),
      }
    }),
    // Reversal amounts are already negative.
    lessVat: lessVatOf(voidTransaction),
    discount: Number(voidTransaction.total_discount) || undefined,
    vatableSales: Number(voidTransaction.vatable_sales),
    vatAmount: Number(voidTransaction.vat_amount),
    vatExemptSales: Number(voidTransaction.vat_exempt_sales),
    zeroRatedSales: Number(voidTransaction.zero_rated_sales),
    total: Number(voidTransaction.net_sales),
    paymentMethod: originalTransaction.payment_method,
  }

  const result = await window.electronAPI.printReceipt(payload)
  if (!result?.success) {
    throw new Error(result?.error || "Failed to print void slip")
  }
  return result
}
