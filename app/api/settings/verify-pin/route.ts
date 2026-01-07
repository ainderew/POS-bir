import { NextResponse } from "next/server"
import { queryOne } from "@/lib/db"

export async function POST(request: Request) {
  try {
    const { pin } = await request.json()

    if (!pin) {
      return NextResponse.json({ error: "PIN is required" }, { status: 400 })
    }

    const settings = await queryOne(
      "SELECT value FROM settings WHERE key = 'manager_pin'"
    )

    if (settings && settings.value === pin) {
      return NextResponse.json({ valid: true })
    } else {
      return NextResponse.json({ valid: false, error: "Invalid Manager PIN" }, { status: 401 })
    }
  } catch (error) {
    console.error("[v0] PIN verification error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
