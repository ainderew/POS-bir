import { NextResponse } from "next/server"
import crypto from "crypto"
import { query, queryOne, getPosId } from "@/lib/db"

// GET: Fetch all terminals
export async function GET() {
  try {
    const terminals = await query(
      "SELECT * FROM terminals ORDER BY created_at DESC"
    )
    return NextResponse.json(terminals)
  } catch (error) {
    console.error("[terminals] Error fetching terminals:", error)
    return NextResponse.json(
      { error: "Failed to fetch terminals" },
      { status: 500 }
    )
  }
}

// POST: Create new terminal
export async function POST(request: Request) {
  try {
    const { ptuNumber, serialNumber } = await request.json()
    const posId = getPosId()

    if (!ptuNumber || !serialNumber) {
      return NextResponse.json(
        { error: "PTU number and serial number are required" },
        { status: 400 }
      )
    }

    const terminal = await queryOne(
      `INSERT INTO terminals (id, pos_id, ptu_number, serial_number)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [crypto.randomUUID(), posId, ptuNumber, serialNumber]
    )

    return NextResponse.json(terminal, { status: 201 })
  } catch (error: any) {
    console.error("[terminals] Error creating terminal:", error)

    if (error.code === '23505') {  // Unique violation
      return NextResponse.json(
        { error: "PTU number or serial number already exists" },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: "Failed to create terminal" },
      { status: 500 }
    )
  }
}
