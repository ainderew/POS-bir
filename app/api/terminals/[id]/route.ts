import { NextResponse } from "next/server"
import { queryOne } from "@/lib/db"

// GET: Fetch single terminal
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const terminal = await queryOne(
      "SELECT * FROM terminals WHERE id = $1",
      [id]
    )

    if (!terminal) {
      return NextResponse.json(
        { error: "Terminal not found" },
        { status: 404 }
      )
    }

    return NextResponse.json(terminal)
  } catch (error) {
    console.error("[terminals] Error fetching terminal:", error)
    return NextResponse.json(
      { error: "Failed to fetch terminal" },
      { status: 500 }
    )
  }
}

// PATCH: Update terminal
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { ptuNumber, serialNumber } = await request.json()

    const terminal = await queryOne(
      `UPDATE terminals
       SET ptu_number = COALESCE($1, ptu_number),
           serial_number = COALESCE($2, serial_number),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [ptuNumber, serialNumber, id]
    )

    if (!terminal) {
      return NextResponse.json(
        { error: "Terminal not found" },
        { status: 404 }
      )
    }

    return NextResponse.json(terminal)
  } catch (error: any) {
    console.error("[terminals] Error updating terminal:", error)

    if (error.code === '23505') {
      return NextResponse.json(
        { error: "PTU number or serial number already exists" },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: "Failed to update terminal" },
      { status: 500 }
    )
  }
}
