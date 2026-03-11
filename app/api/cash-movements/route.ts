import { NextResponse } from "next/server"
import crypto from "crypto"
import { queryOne, getPosId } from "@/lib/db"

export async function POST(request: Request) {
  try {
    const { shiftId, type, amount, reason } = await request.json()

    if (!shiftId || !type || !amount || !reason) {
      return NextResponse.json({ error: "Missing movement details" }, { status: 400 })
    }

    const VALID_TYPES = ["CASH_IN", "CASH_OUT", "SAFE_DROP"]
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Invalid movement type" }, { status: 400 })
    }

    const movement = await queryOne(
      `INSERT INTO cash_movements (id, shift_id, type, amount, reason)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [crypto.randomUUID(), shiftId, type, amount, reason]
    )

    return NextResponse.json(movement, { status: 201 })
  } catch (error) {
    console.error("[v0] Error recording cash movement:", error)
    return NextResponse.json({ error: "Failed to record movement" }, { status: 500 })
  }
}
