import { NextResponse } from "next/server"
import crypto from "crypto"
import { queryOne, transaction } from "@/lib/db"

export async function POST(request: Request) {
  try {
    const {
      shiftId,
      actualCash,
      actualGcash,
      actualMaya,
      actualCard,
      auditImage,      // Base64 data URL from camera
      auditMetadata    // Metadata from camera capture
    } = await request.json()

    if (!shiftId || actualCash === undefined) {
      return NextResponse.json({ error: "Missing shift details" }, { status: 400 })
    }

    const result = await transaction(async (client) => {
      // 1. Get shift info
      const shiftResult = await client.query("SELECT * FROM shifts WHERE id = $1", [shiftId])
      const shift = shiftResult.rows[0]

      if (!shift || shift.status !== 'OPEN') {
        throw new Error("Shift not found or already closed")
      }

      // 2. Calculate Sales by Payment Method for this shift
      const salesResult = await client.query(
        `SELECT
            payment_method,
            COALESCE(SUM(net_sales), 0) as total
          FROM transactions
          WHERE created_at >= $1 AND created_at <= CURRENT_TIMESTAMP
            AND status = 'PAID' AND pos_id = $2
          GROUP BY payment_method`,
        [shift.start_time, shift.pos_id || shift.terminal_id]
      )
      
      let theoreticalCashSales = 0
      let theoreticalGcash = 0
      let theoreticalMaya = 0
      let theoreticalCard = 0

      salesResult.rows.forEach((r: { payment_method: string; total: string }) => {
        const total = parseFloat(r.total)
        if (r.payment_method === 'CASH') theoreticalCashSales = total
        if (r.payment_method === 'GCASH') theoreticalGcash = total
        if (r.payment_method === 'MAYA') theoreticalMaya = total
        if (r.payment_method === 'CARD') theoreticalCard = total
      })

      // 3. Get Cash Movements
      const movementsResult = await client.query(
        "SELECT type, SUM(amount) as total FROM cash_movements WHERE shift_id = $1 GROUP BY type",
        [shiftId]
      )
      
      let cashIn = 0
      let cashOut = 0
      let safeDrops = 0

      movementsResult.rows.forEach((m: { type: string; total: string }) => {
        if (m.type === 'CASH_IN') cashIn = parseFloat(m.total)
        if (m.type === 'CASH_OUT') cashOut = parseFloat(m.total)
        if (m.type === 'SAFE_DROP') safeDrops = parseFloat(m.total)
      })

      // 4. Calculate Theoretical Totals
      const theoreticalCash = parseFloat(shift.opening_fund) + theoreticalCashSales + cashIn - cashOut - safeDrops
      
      // Calculate individual variances
      const cashVariance = actualCash - theoreticalCash
      const gcashVariance = actualGcash - theoreticalGcash
      const mayaVariance = actualMaya - theoreticalMaya
      const cardVariance = actualCard - theoreticalCard
      
      // Total variance across all accounts
      const totalVariance = cashVariance + gcashVariance + mayaVariance + cardVariance

      // 5. Calculate shift's net sales for terminal update
      const shiftTotalResult = await client.query(
        `SELECT COALESCE(SUM(net_sales), 0) as total
         FROM transactions
         WHERE created_at >= $1 AND created_at <= CURRENT_TIMESTAMP
           AND status = 'PAID' AND pos_id = $2`,
        [shift.start_time, shift.pos_id || shift.terminal_id]
      )
      const shiftNetSales = parseFloat(shiftTotalResult.rows[0].total)

      // 6. Close Shift with Audit Data
      const updatedShift = await client.query(
        `UPDATE shifts
         SET status = 'CLOSED',
             end_time = CURRENT_TIMESTAMP,
             theoretical_cash = $1,
             actual_cash = $2,
             variance = $3,
             theoretical_gcash = $4,
             actual_gcash = $5,
             theoretical_maya = $6,
             actual_maya = $7,
             theoretical_card = $8,
             actual_card = $9
         WHERE id = $10
         RETURNING *`,
        [
          theoreticalCash, actualCash, totalVariance,
          theoreticalGcash, actualGcash,
          theoreticalMaya, actualMaya,
          theoreticalCard, actualCard,
          shiftId
        ]
      )

      // 7. Update Terminal Counters (if terminal_id exists)
      if (shift.terminal_id) {
        await client.query(
          `UPDATE terminals
           SET accumulated_grand_total = accumulated_grand_total + $1,
               current_state = 'CLOSED',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [shiftNetSales, shift.terminal_id]
        )
      }

      // 8. Convert audit image to BYTEA
      let imageBuffer = null
      if (auditImage) {
        try {
          const base64Data = auditImage.split(',')[1]
          imageBuffer = Buffer.from(base64Data, 'base64')
        } catch (err) {
          console.warn("[shifts] Failed to process audit image:", err)
        }
      }

      // 9. Create closing audit log
      await client.query(
        `INSERT INTO audit_logs (
          id, shift_id,
          terminal_id,
          action_type,
          audit_image,
          audit_metadata
        ) VALUES ($1, $2, $3, 'SHIFT_CLOSE', $4, $5)`,
        [
          crypto.randomUUID(),
          shiftId,
          shift.terminal_id,
          imageBuffer,
          JSON.stringify({
            ...auditMetadata,
            variance: {
              cash: cashVariance,
              gcash: gcashVariance,
              maya: mayaVariance,
              card: cardVariance,
              total: totalVariance
            }
          })
        ]
      )

      return updatedShift.rows[0]
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[v0] Error closing shift:", error)
    return NextResponse.json({ error: error.message || "Failed to close shift" }, { status: 500 })
  }
}
