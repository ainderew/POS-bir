import { NextResponse } from "next/server"
import { queryOne, transaction, getPosId } from "@/lib/db"

export async function GET() {
  try {
    const shift = await queryOne(
      "SELECT * FROM shifts WHERE status = 'OPEN' ORDER BY start_time DESC LIMIT 1"
    )
    return NextResponse.json(shift || null)
  } catch (error) {
    console.error("[v0] Error fetching active shift:", error)
    return NextResponse.json({ error: "Failed to fetch shift" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { openingFund } = await request.json()
    const posId = getPosId()

    // Ensure no other shift is open
    const existing = await queryOne("SELECT id FROM shifts WHERE status = 'OPEN'")
    if (existing) {
      return NextResponse.json({ error: "A shift is already open" }, { status: 400 })
    }

    const newShift = await queryOne(
      `INSERT INTO shifts (pos_id, opening_fund, status) 
       VALUES ($1, $2, 'OPEN') 
       RETURNING *`,
      [posId, openingFund || 0]
    )

    return NextResponse.json(newShift, { status: 201 })
  } catch (error) {
    console.error("[v0] Error opening shift:", error)
    return NextResponse.json({ error: "Failed to open shift" }, { status: 500 })
  }
}
