import { NextResponse } from "next/server"
import { queryOne, transaction, getPosId } from "@/lib/db"

export async function GET() {
  try {
    // Get the last Z-reading date
    const lastZ = await queryOne(
      "SELECT reading_date FROM daily_readings WHERE type = 'Z' ORDER BY reading_date DESC LIMIT 1"
    )
    const startDate = lastZ ? lastZ.reading_date : '1970-01-01'

    // Get totals since last Z-reading
    const stats = await queryOne(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(net_sales), 0) as total_net,
        COALESCE(SUM(vat_amount), 0) as total_vat,
        MIN(invoice_number) as start_invoice,
        MAX(invoice_number) as end_invoice
      FROM transactions 
      WHERE created_at > $1 AND status = 'PAID'
    `, [startDate])

    return NextResponse.json(stats)
  } catch (error) {
    console.error("[v0] Error fetching Z-reading stats:", error)
    return NextResponse.json({ error: "Failed to fetch Z-reading stats" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { pin } = await request.json()
    const posId = getPosId()

    // 1. Verify PIN
    const settings = await queryOne("SELECT value FROM settings WHERE key = 'manager_pin'")
    if (!settings || settings.value !== pin) {
      return NextResponse.json({ error: "Invalid Manager PIN" }, { status: 401 })
    }

    const result = await transaction(async (client) => {
      // 2. Get last Z-reading date
      const lastZResult = await client.query(
        "SELECT reading_date FROM daily_readings WHERE type = 'Z' ORDER BY reading_date DESC LIMIT 1"
      )
      const startDate = lastZResult.rows[0]?.reading_date || '1970-01-01'

      // 3. Get current totals
      const statsResult = await client.query(`
        SELECT 
          COALESCE(SUM(net_sales), 0) as total_net,
          COALESCE(SUM(vat_amount), 0) as total_vat,
          COALESCE(SUM(CASE WHEN payment_method = 'CASH' THEN net_sales ELSE 0 END), 0) as total_cash_sales,
          MIN(invoice_number) as start_invoice,
          MAX(invoice_number) as end_invoice
        FROM transactions 
        WHERE created_at > $1 AND status = 'PAID'
      `, [startDate])
      
      const stats = statsResult.rows[0]

      // 3a. Get Cash Movements since last Z
      const movementsResult = await client.query(`
        SELECT type, COALESCE(SUM(amount), 0) as total 
        FROM cash_movements 
        WHERE created_at > $1 
        GROUP BY type
      `, [startDate])
      
      let cashIn = 0
      let cashOut = 0
      let safeDrops = 0
      movementsResult.rows.forEach((m: { type: string; total: string }) => {
        if (m.type === 'CASH_IN') cashIn = parseFloat(m.total)
        if (m.type === 'CASH_OUT') cashOut = parseFloat(m.total)
        if (m.type === 'SAFE_DROP') safeDrops = parseFloat(m.total)
      })

      // 3b. Get total opening funds since last Z
      const openingFundsResult = await client.query(`
        SELECT COALESCE(SUM(opening_fund), 0) as total 
        FROM shifts 
        WHERE start_time > $1
      `, [startDate])
      const totalOpeningFunds = parseFloat(openingFundsResult.rows[0].total)

      // 4. Update Accumulated Grand Total
      const grandTotalResult = await client.query(
        "SELECT value FROM settings WHERE key = 'accumulated_grand_total'"
      )
      const currentGrandTotal = parseFloat(grandTotalResult.rows[0].value)
      const newGrandTotal = currentGrandTotal + parseFloat(stats.total_net)

      await client.query(
        "UPDATE settings SET value = $1 WHERE key = 'accumulated_grand_total'",
        [newGrandTotal.toString()]
      )

      // 5. Record the Z-Reading
      const zReadingResult = await client.query(`
        INSERT INTO daily_readings (
          type, total_sales, total_vat, beginning_invoice, ending_invoice, accumulated_grand_total, pos_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        'Z', 
        stats.total_net, 
        stats.total_vat, 
        stats.start_invoice, 
        stats.end_invoice, 
        newGrandTotal,
        posId
      ])

      return {
        ...zReadingResult.rows[0],
        cash_breakdown: {
          beginning_funds: totalOpeningFunds,
          cash_sales: parseFloat(stats.total_cash_sales),
          cash_in: cashIn,
          cash_out: cashOut,
          safe_drops: safeDrops,
          theoretical_cash: totalOpeningFunds + parseFloat(stats.total_cash_sales) + cashIn - cashOut - safeDrops
        }
      }
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("[v0] Z-reading error:", error)
    return NextResponse.json({ error: "Failed to process Z-reading" }, { status: 500 })
  }
}
