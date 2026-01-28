
import { NextResponse } from "next/server"
import crypto from "crypto"
import { queryOne, transaction, getPosId } from "@/lib/db"
import { dataUrlToBase64 } from "@/lib/audit-service"
import * as bcrypt from "bcrypt"

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
        throw new Error("Transaction not found")
      }

      const originalTx = originalRes.rows[0]

      if (originalTx.status === 'VOIDED') {
        throw new Error("Transaction is already voided")
      }

      const posId = getPosId()
      
      // Get next Invoice Number for the reversal (it's a new transaction)
      // Note: Reversals usually get a new sequence or share the old one with a suffix?
      // BIR usually requires a "Voided" status on the original and a "New" transaction if it's a correction, 
      // OR just marking the original as void.
      // The prompt says: "Create Reversal Transaction: Insert a new row ... total_amount: Negative ... type: 'VOID_REFUND'"
      // The `transactions` table doesn't have a `type` column in 004 schema, only `status` ('PAID', 'VOIDED').
      // But prompt says "Add column status (ENUM): 'COMPLETED', 'VOIDED'". 
      // And "Create Reversal Transaction... type: 'VOID_REFUND'".
      // This implies I might need a `type` column or reuse `status`.
      // If `status` is the only enum, maybe `payment_method` is abused? Or I missed adding `type`.
      // The prompt "Part 2" only mentions adding `status`, `void_reason` etc. 
      // But Part 4B says "type: 'VOID_REFUND'".
      // I will assume `status` 'VOIDED' is for the original, and the new one might have a status of 'PAID' (completed reversal) 
      // but with negative amounts?
      // Or maybe I should add a `type` column.
      // Given strictly "Add column status...", I'll stick to that. 
      // I'll create the reversal transaction with negative values and status 'PAID' (it is a valid negative transaction).
      // Or maybe status 'VOID_REFUND' if I add it to the enum.
      // I'll check the prompt "type: 'VOID_REFUND'". It looks like I missed adding a `type` column in Part 2 instructions?
      // "Update transactions table: Add column status... Add column void_reason...". 
      // It DOES NOT explicitely say "Add column type".
      // However, Part 4B explicitly says "type: 'VOID_REFUND'".
      // I will assume this is a new column or I should infer it.
      // I'll add `transaction_type` column to be safe in `scripts/005_init_voids.sql`.
      
      // ... Wait, I can't modify the script easily while inside this thought.
      // I'll assume I should just use `payment_method` or `status` if `type` isn't there, 
      // BUT for correctness, I'll add `transaction_type` to the script in a subsequent edit if needed.
      // For now, I'll assume "type" meant "Logic type" and I'll represent it by negative values and maybe a specific status or metadata.
      // But prompt says "Insert a new row ... type: 'VOID_REFUND'". This looks like a column assignment.
      
      // Let's create the Reversal Transaction with negative amounts.
      // Generate new invoice number
      const invoiceResult = await client.query(
        "UPDATE settings SET value = (value::int + 1)::text WHERE key = 'next_invoice_number' RETURNING value"
      )
      const invoiceSeq = invoiceResult.rows[0].value.padStart(6, '0')
      const invoiceNumber = `CN-${invoiceSeq}` // Credit Note? Or just SI? BIR usually wants sequential.
      // Prompt doesn't specify invoice format for void. I'll use standard sequence.

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
    return NextResponse.json({ error: error.message || "Failed to void transaction" }, { status: 500 })
  }
}
