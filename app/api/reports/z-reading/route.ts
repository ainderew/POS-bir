import { NextResponse } from "next/server"
import crypto from "crypto"
import bcrypt from "bcryptjs"
import { queryOne, transaction, getPosId } from "@/lib/db"
import { roundMoney } from "@/lib/ph-tax"

// Totals since the last Z: sales issued (PAID, or later VOIDED) plus credit
// notes (transaction_type VOID_REFUND, negative amounts). A sale and its void in
// the same period net to zero; a void of a sale already in an earlier Z shows up
// only as its credit note, so the net (and the grand total) goes down.
const Z_TOTALS_SQL = `
  SELECT
    COUNT(CASE WHEN transaction_type = 'VOID_REFUND' THEN NULL ELSE 1 END) as count,
    COUNT(CASE WHEN transaction_type = 'VOID_REFUND' THEN 1 END) as void_count,
    COALESCE(SUM(CASE WHEN transaction_type = 'VOID_REFUND' THEN 0 ELSE net_sales END), 0) as sales_total,
    COALESCE(SUM(CASE WHEN transaction_type = 'VOID_REFUND' THEN -net_sales ELSE 0 END), 0) as void_total,
    COALESCE(SUM(net_sales), 0) as total_net,
    COALESCE(SUM(vat_amount), 0) as total_vat,
    COALESCE(SUM(CASE WHEN payment_method = 'CASH' THEN net_sales ELSE 0 END), 0) as total_cash_sales,
    MIN(CASE WHEN transaction_type = 'VOID_REFUND' THEN NULL ELSE invoice_number END) as start_invoice,
    MAX(CASE WHEN transaction_type = 'VOID_REFUND' THEN NULL ELSE invoice_number END) as end_invoice,
    MIN(CASE WHEN transaction_type = 'VOID_REFUND' THEN invoice_number END) as start_credit_note,
    MAX(CASE WHEN transaction_type = 'VOID_REFUND' THEN invoice_number END) as end_credit_note
  FROM transactions
  WHERE created_at > $1 AND status IN ('PAID', 'VOIDED', 'REFUND')
`

class ZReadingError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function GET() {
  try {
    // Get the last Z-reading date
    const lastZ = await queryOne(
      "SELECT reading_date FROM daily_readings WHERE type = 'Z' ORDER BY reading_date DESC LIMIT 1"
    )
    const startDate = lastZ ? lastZ.reading_date : '1970-01-01'

    // Get totals since last Z-reading
    const stats = await queryOne(Z_TOTALS_SQL, [startDate])

    return NextResponse.json(stats)
  } catch (error) {
    console.error("[v0] Error fetching Z-reading stats:", error)
    return NextResponse.json({ error: "Failed to fetch Z-reading stats" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { pin, terminalId } = await request.json()
    const posId = getPosId()

    // 1. Verify PIN (supports both legacy plaintext and bcrypt hashed)
    const settings = await queryOne("SELECT value FROM settings WHERE key = 'manager_pin'")
    if (!settings) {
      return NextResponse.json({ error: "Manager PIN not configured" }, { status: 401 })
    }
    const storedPin = settings.value
    const isHashed = storedPin.startsWith("$2a$") || storedPin.startsWith("$2b$")
    const pinValid = isHashed
      ? await bcrypt.compare(pin, storedPin)
      : storedPin === pin
    if (!pinValid) {
      return NextResponse.json({ error: "Invalid Manager PIN" }, { status: 401 })
    }

    const result = await transaction(async (client) => {
      // 2. Resolve this machine's terminal: the id sent by the client, else the
      //    terminal for this POS that most recently opened a shift.
      const terminalResult = terminalId
        ? await client.query("SELECT * FROM terminals WHERE id = $1", [terminalId])
        : await client.query(
            `SELECT t.* FROM terminals t
             WHERE t.pos_id = $1
             ORDER BY (SELECT MAX(s.start_time) FROM shifts s WHERE s.terminal_id = t.id) DESC,
                      t.created_at ASC
             LIMIT 1`,
            [posId]
          )
      const terminal = terminalResult.rows[0]
      if (!terminal) {
        throw new ZReadingError("No registered terminal found for Z-reading", 400)
      }

      // 2a. Get last Z-reading
      const lastZResult = await client.query(
        "SELECT reading_date, accumulated_grand_total FROM daily_readings WHERE type = 'Z' ORDER BY reading_date DESC LIMIT 1"
      )
      const lastZ = lastZResult.rows[0]
      const startDate = lastZ?.reading_date || '1970-01-01'

      // 3. Get current totals (sales, voids/returns, net)
      const statsResult = await client.query(Z_TOTALS_SQL, [startDate])
      
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

      // 4. Advance the terminal's Accumulated Grand Total and Z counter.
      //    terminals.accumulated_grand_total is the single source of truth and
      //    this is the only place it is added to (shift close only snapshots it).
      let beginningGrandTotal = parseFloat(terminal.accumulated_grand_total)
      let zCounter = Number(terminal.last_z_counter)
      if (zCounter === 0) {
        // Never Z-read under this scheme (upgraded install): the old shift-close code
        // added sales into terminals.accumulated_grand_total, so don't start from it.
        // Continue the reported chain from the last Z, else from the settings GT.
        if (lastZ) {
          const zCountResult = await client.query(
            "SELECT COUNT(*) as count FROM daily_readings WHERE type = 'Z'"
          )
          beginningGrandTotal = parseFloat(lastZ.accumulated_grand_total)
          zCounter = Number(zCountResult.rows[0].count)
        } else {
          const gtSetting = await client.query(
            "SELECT value FROM settings WHERE key = 'accumulated_grand_total'"
          )
          beginningGrandTotal = parseFloat(gtSetting.rows[0]?.value) || 0
        }
      }
      const newGrandTotal = roundMoney(beginningGrandTotal + parseFloat(stats.total_net))
      const newZCounter = zCounter + 1

      await client.query(
        `UPDATE terminals
         SET accumulated_grand_total = $1,
             last_z_counter = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [newGrandTotal, newZCounter, terminal.id]
      )

      // Mirror for the settings page, which displays settings.accumulated_grand_total
      await client.query(
        "INSERT INTO settings (key, value) VALUES ('accumulated_grand_total', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
        [newGrandTotal.toString()]
      )

      // 5. Record the Z-Reading
      const zReadingResult = await client.query(`
        INSERT INTO daily_readings (
          id, type, total_sales, total_vat, beginning_invoice, ending_invoice, accumulated_grand_total, pos_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        crypto.randomUUID(),
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
        terminal_id: terminal.id,
        z_counter: newZCounter,
        beginning_grand_total: beginningGrandTotal,
        sales_total: parseFloat(stats.sales_total),
        void_total: parseFloat(stats.void_total),
        void_count: Number(stats.void_count),
        start_credit_note: stats.start_credit_note,
        end_credit_note: stats.end_credit_note,
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
    if (error instanceof ZReadingError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Failed to process Z-reading" }, { status: 500 })
  }
}
