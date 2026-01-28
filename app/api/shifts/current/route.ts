import { NextResponse } from "next/server"
import crypto from "crypto"
import { queryOne, transaction, getPosId } from "@/lib/db"

export async function GET() {
  try {
    const shift = await queryOne(
      "SELECT * FROM shifts WHERE status = 'OPEN' ORDER BY start_time DESC LIMIT 1"
    )
    return NextResponse.json(shift || null)
  } catch (error) {
    console.error("[shifts] Error fetching active shift:", error)
    return NextResponse.json({ error: "Failed to fetch shift" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const {
      userId,          // NEW - from authenticated user
      openingFund,
      terminalId,
      auditImage,      // Base64 data URL from camera
      auditMetadata    // Metadata from camera capture
    } = await request.json()

    const posId = getPosId()

    // Validate inputs
    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      )
    }

    if (!terminalId) {
      return NextResponse.json(
        { error: "Terminal ID is required" },
        { status: 400 }
      )
    }

    // Ensure no other shift is open
    const existing = await queryOne("SELECT id FROM shifts WHERE status = 'OPEN'")
    if (existing) {
      return NextResponse.json(
        { error: "A shift is already open" },
        { status: 400 }
      )
    }

    const result = await transaction(async (client) => {
      // 1. Verify user exists and is active
      const userResult = await client.query(
        `SELECT id, is_active FROM users WHERE id = $1`,
        [userId]
      )

      const user = userResult.rows[0]
      if (!user) {
        throw new Error("User not found")
      }

      if (!user.is_active) {
        throw new Error("User is not active")
      }

      // 2. Lock terminal row and verify state (prevents concurrent shift opening)
      const terminalResult = await client.query(
        `SELECT * FROM terminals
         WHERE id = $1`,
        [terminalId]
      )

      const terminal = terminalResult.rows[0]
      if (!terminal) {
        throw new Error("Terminal not found")
      }

      if (terminal.current_state === 'OPEN') {
        throw new Error("Terminal already has an open shift")
      }

      // 2. Snapshot terminal counters (BIR compliance)
      const snapshotZCounter = terminal.last_z_counter
      const snapshotAccumulatedTotal = terminal.accumulated_grand_total

      // 3. Create shift with terminal snapshots and user reference
      const shiftResult = await client.query(
        `INSERT INTO shifts (
          id, pos_id,
          user_id,
          opening_fund,
          status,
          terminal_id,
          snapshot_z_counter,
          snapshot_accumulated_total
        ) VALUES ($1, $2, $3, $4, 'OPEN', $5, $6, $7)
        RETURNING *`,
        [
          crypto.randomUUID(),
          posId,
          userId,
          openingFund || 0,
          terminalId,
          snapshotZCounter,
          snapshotAccumulatedTotal
        ]
      )
      const newShift = shiftResult.rows[0]

      // 4. Convert audit image to BYTEA-compatible format
      let imageBuffer = null
      if (auditImage) {
        try {
          // Extract base64 data from data URL (data:image/webp;base64,...)
          const base64Data = auditImage.split(',')[1]
          imageBuffer = Buffer.from(base64Data, 'base64')
        } catch (err) {
          console.warn("[shifts] Failed to process audit image:", err)
        }
      }

      // 5. Create audit log entry
      await client.query(
        `INSERT INTO audit_logs (
          id, shift_id,
          terminal_id,
          action_type,
          audit_image,
          audit_metadata
        ) VALUES ($1, $2, $3, 'SHIFT_OPEN', $4, $5)`,
        [
          crypto.randomUUID(),
          newShift.id,
          terminalId,
          imageBuffer,
          JSON.stringify(auditMetadata || {})
        ]
      )

      // 6. Update terminal state to OPEN
      await client.query(
        `UPDATE terminals
         SET current_state = 'OPEN',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [terminalId]
      )

      return newShift
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: any) {
    console.error("[shifts] Error opening shift:", error)
    return NextResponse.json(
      { error: error.message || "Failed to open shift" },
      { status: 500 }
    )
  }
}
