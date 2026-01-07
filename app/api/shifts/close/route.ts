import { NextResponse } from "next/server"
import { queryOne, transaction } from "@/lib/db"

export async function POST(request: Request) {
  try {
    const { shiftId, actualCash } = await request.json()

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

      // 2. Calculate Cash Sales for this shift
      const salesResult = await client.query(
        `SELECT COALESCE(SUM(net_sales), 0) as cash_total 
         FROM transactions 
         WHERE created_at >= $1 AND status = 'PAID' AND payment_method = 'CASH'`,
        [shift.start_time]
      )
      const cashSales = parseFloat(salesResult.rows[0].cash_total)

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

      // 4. Calculate Theoretical Cash
      const theoreticalCash = parseFloat(shift.opening_fund) + cashSales + cashIn - cashOut - safeDrops
      const variance = actualCash - theoreticalCash

      // 5. Close Shift
      const updatedShift = await client.query(
        `UPDATE shifts 
         SET status = 'CLOSED', 
             end_time = CURRENT_TIMESTAMP,
             theoretical_cash = $1,
             actual_cash = $2,
             variance = $3
         WHERE id = $4
         RETURNING *`,
        [theoreticalCash, actualCash, variance, shiftId]
      )

      return updatedShift.rows[0]
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[v0] Error closing shift:", error)
    return NextResponse.json({ error: error.message || "Failed to close shift" }, { status: 500 })
  }
}
