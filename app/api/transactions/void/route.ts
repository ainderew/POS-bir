
import { NextResponse } from "next/server"
import crypto from "crypto"
import { queryOne, transaction, getPosId } from "@/lib/db"
import { dataUrlToBase64 } from "@/lib/audit-service"
import bcrypt from "bcryptjs"

// Errors the client caused (bad state / unknown id); anything else is a 500.
class VoidRequestError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { 
      originalTransactionId, 
      managerId, 
      reason, 
      auditImageBase64,
      pin // Re-validation required
    } = body

    if (!originalTransactionId || !managerId || !pin) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // 1. Re-validate Manager (Security Double-Check)
    const manager = await queryOne(
      "SELECT * FROM users WHERE id = $1", 
      [managerId]
    )

    if (!manager) {
      return NextResponse.json({ error: "Manager not found" }, { status: 401 })
    }

    const allowedRoles = ['OWNER', 'MANAGER', 'ADMIN']
    if (!allowedRoles.includes(manager.role) || !manager.is_active) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 403 })
    }

    const isPinValid = await bcrypt.compare(pin, manager.pin_hash)
    if (!isPinValid) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 })
    }

    // 2. Perform Void Transaction
    const result = await transaction(async (client) => {
      // Get Original Transaction
      const originalRes = await client.query(
        "SELECT * FROM transactions WHERE id = $1",
        [originalTransactionId]
      )

      if (originalRes.rows.length === 0) {
        throw new VoidRequestError("Transaction not found", 404)
      }

      const originalTx = originalRes.rows[0]

      // Only an original sale can be voided. Credit notes (status REFUND,
      // transaction_type VOID_REFUND) and already-voided sales cannot.
      if (originalTx.status === 'VOIDED') {
        throw new VoidRequestError("Transaction is already voided", 400)
      }
      if (originalTx.status !== 'PAID' || originalTx.transaction_type === 'VOID_REFUND') {
        throw new VoidRequestError("Only completed sales can be voided", 400)
      }

      const posId = getPosId()

      // Credit notes have their own series (CN-000001, CN-000002, ...) and never
      // consume the sales invoice (SI) sequence. The setting holds the next number
      // to issue. Installs created before the key existed continue after the
      // highest CN already issued (those were numbered from the SI sequence).
      const cnSetting = await client.query(
        "SELECT value FROM settings WHERE key = 'next_credit_note_number'"
      )
      if (cnSetting.rows.length === 0) {
        await client.query(
          `INSERT INTO settings (key, value)
           SELECT 'next_credit_note_number',
                  CAST(COALESCE(MAX(CAST(SUBSTR(invoice_number, 4) AS INTEGER)), 0) + 1 AS TEXT)
           FROM transactions WHERE invoice_number LIKE 'CN-%'`
        )
      }
      const cnResult = await client.query(
        "UPDATE settings SET value = (value::int + 1)::text WHERE key = 'next_credit_note_number' RETURNING value"
      )
      const cnSeq = String(Number(cnResult.rows[0].value) - 1).padStart(6, '0')
      const invoiceNumber = `CN-${cnSeq}`

      const reversalTx = await client.query(
        `INSERT INTO transactions (
          id, invoice_number, pos_id,
          gross_sales, vatable_sales, vat_amount, vat_exempt_sales, zero_rated_sales, total_discount, net_sales,
          pax_count, senior_count, sc_pwd_id, sc_pwd_name,
          payment_method, amount_tendered, change_amount, reference_number,
          status, void_reason, void_authorized_by, voided_at, transaction_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, CURRENT_TIMESTAMP, 'VOID_REFUND')
        RETURNING *`,
        [
          crypto.randomUUID(),
          invoiceNumber, posId,
          -originalTx.gross_sales,
          -originalTx.vatable_sales,
          -originalTx.vat_amount,
          -originalTx.vat_exempt_sales,
          -originalTx.zero_rated_sales,
          -originalTx.total_discount,
          -originalTx.net_sales,
          originalTx.pax_count,
          originalTx.senior_count,
          originalTx.sc_pwd_id,
          originalTx.sc_pwd_name,
          originalTx.payment_method,
          0, 0, // No tender/change for void
          originalTx.invoice_number, // Reference the original invoice
          'REFUND', // Status is REFUND
          reason,
          managerId
        ]
      )

      // Update Original Transaction
      await client.query(
        `UPDATE transactions 
         SET status = 'VOIDED', 
             void_reason = $1, 
             void_authorized_by = $2, 
             voided_at = CURRENT_TIMESTAMP 
         WHERE id = $3`,
        [reason, managerId, originalTransactionId]
      )

      // Restore stock for every item on the voided sale
      const itemsRes = await client.query(
        "SELECT product_id, quantity_sold FROM transaction_items WHERE transaction_id = $1",
        [originalTransactionId]
      )
      for (const item of itemsRes.rows) {
        await client.query(
          `UPDATE products
           SET stock_level = stock_level + $1, is_synced = FALSE, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [item.quantity_sold, item.product_id]
        )
      }

      // Reverse the store-credit charge (customer id is the sale's reference_number)
      if (originalTx.payment_method === "STORE_CREDIT" && originalTx.reference_number) {
        const customerId = originalTx.reference_number
        const amount = Number(originalTx.net_sales)

        const updateCustomer = await client.query(
          `UPDATE customers
           SET current_debt_balance = ROUND(current_debt_balance - $1, 2),
               total_spend = ROUND(total_spend - $1, 2),
               updated_at = NOW()
           WHERE id = $2
           RETURNING current_debt_balance`,
          [amount, customerId]
        )
        if (updateCustomer.rows.length === 0) {
          throw new Error("Customer for store credit sale not found")
        }
        const newBalance = Number(updateCustomer.rows[0].current_debt_balance)

        await client.query(
          `INSERT INTO credit_ledger (
              id, customer_id, transaction_id, entry_type, amount, running_balance, notes, pos_id
          ) VALUES ($1, $2, $3, 'ADJUSTMENT', $4, $5, $6, $7)`,
          [
            crypto.randomUUID(), customerId, reversalTx.rows[0].id, amount, newBalance,
            `Void of ${originalTx.invoice_number} (${invoiceNumber})${reason ? `: ${reason}` : ''}`,
            posId
          ]
        )
      }

      // Log Audit
      const imageBuffer = auditImageBase64 
        ? Buffer.from(dataUrlToBase64(auditImageBase64), 'base64') 
        : null

      await client.query(
        `INSERT INTO audit_logs (
           id, action_type,
           user_id,
           shift_id,
           audit_image,
           audit_metadata
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
            crypto.randomUUID(),
            'TRANSACTION_VOID',
            managerId,
            null,
            imageBuffer,
            JSON.stringify({
                original_invoice: originalTx.invoice_number,
                reversal_invoice: invoiceNumber,
                reason
            })
        ]
      )
      // Note: shift_id is nullable in audit_logs, but ideally we link it.
      // The prompt didn't pass shiftId in the payload. I'll leave it null or try to fetch active shift if possible.

      return reversalTx.rows[0]
    })

    return NextResponse.json({ success: true, transaction: result })

  } catch (error: any) {
    console.error("[v0] Void Transaction Error:", error)
    const status = error instanceof VoidRequestError ? error.status : 500
    return NextResponse.json({ error: error.message || "Failed to void transaction" }, { status })
  }
}
