import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
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

    if (!settings) {
      return NextResponse.json({ valid: false, error: "Manager PIN not configured" }, { status: 401 })
    }

    // Support both legacy plaintext and bcrypt hashed PINs
    const storedPin = settings.value
    const isHashed = storedPin.startsWith("$2a$") || storedPin.startsWith("$2b$")
    const valid = isHashed
      ? await bcrypt.compare(pin, storedPin)
      : storedPin === pin

    if (valid) {
      return NextResponse.json({ valid: true })
    } else {
      return NextResponse.json({ valid: false, error: "Invalid Manager PIN" }, { status: 401 })
    }
  } catch (error) {
    console.error("[v0] PIN verification error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
