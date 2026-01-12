
import { NextResponse } from "next/server"
import { queryOne, transaction } from "@/lib/db"
import { dataUrlToBase64 } from "@/lib/audit-service"
import * as bcrypt from "bcrypt"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { 
      managerId, 
      pin, 
      actionType, 
      auditImageBase64,
      // Additional fields for LINE_VOID
      shiftId,
      cashierId,
      itemDetails,
      reason
    } = body

    if (!managerId || !pin) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 })
    }

    // 1. Fetch User
    const user = await queryOne(
      "SELECT * FROM users WHERE id = $1", 
      [managerId]
    )

    if (!user) {
      return NextResponse.json({ error: "Manager not found" }, { status: 401 })
    }

    // 2. Verify Role & Status
    // Allowing ADMIN as well since they are superusers
    const allowedRoles = ['OWNER', 'MANAGER', 'ADMIN']
    if (!allowedRoles.includes(user.role) || !user.is_active) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 403 })
    }

    // 3. Verify PIN
    const isPinValid = await bcrypt.compare(pin, user.pin_hash)
    if (!isPinValid) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 })
    }

    // 4. Handle Audit / Action Specific Logic
    if (actionType === 'LINE_VOID') {
      // For Line Voids (Pre-payment), we record the void immediately
      if (!shiftId || !itemDetails || !reason) {
        return NextResponse.json({ error: "Missing void details" }, { status: 400 })
      }

      const imageBuffer = auditImageBase64 
        ? Buffer.from(dataUrlToBase64(auditImageBase64), 'base64') 
        : null

      await transaction(async (client) => {
        // Insert into voids table (Detailed tracking)
        await client.query(
          `INSERT INTO voids (
             shift_id, cashier_id, manager_id, 
             item_details, reason, audit_image, occurred_at
           ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
          [
            shiftId,
            cashierId || null, // Optional if not provided
            managerId,
            JSON.stringify(itemDetails),
            reason,
            imageBuffer
          ]
        )

        // Insert into audit_logs table (High-level audit trail)
        await client.query(
          `INSERT INTO audit_logs (
             action_type,
             user_id,
             shift_id,
             audit_image,
             audit_metadata
           ) VALUES ($1, $2, $3, $4, $5)`,
          [
            'LINE_VOID',
            managerId,
            shiftId,
            imageBuffer,
            JSON.stringify({
              reason,
              item_details: itemDetails,
              cashier_id: cashierId
            })
          ]
        )
      })
    }

    // For other actions (like TRANSACTION_VOID), this endpoint might just be used 
    // for validation, and the actual void logic happens in /api/transactions/void
    // But we still return success here.

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error("[v0] Validate Manager Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
