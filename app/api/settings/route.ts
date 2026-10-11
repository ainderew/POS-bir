import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { query, transaction } from "@/lib/db"

export async function GET() {
  try {
    const result = await query("SELECT key, value FROM settings")
    const settings: Record<string, string | boolean> = {}
    result.forEach((row) => {
      settings[row.key] = row.value
    })
    // Never expose the manager PIN (hash or legacy plaintext) to clients.
    // Re-posting it would get it hashed again and lock out verify-pin.
    settings.has_manager_pin = Boolean(settings.manager_pin)
    delete settings.manager_pin
    return NextResponse.json(settings)
  } catch (error) {
    console.error("[v0] Error fetching settings:", error)
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { 
      business_name, 
      business_address, 
      business_tin, 
      manager_pin,
      vat_rate,
      auto_print
    } = body

    // Hash manager PIN before storing, only when a new PIN is supplied.
    // Blank/omitted keeps the current PIN.
    let hashedPin: string | undefined
    if (manager_pin !== undefined && manager_pin !== null && manager_pin !== "") {
      const newPin = String(manager_pin)
      if (!/^\d{4,6}$/.test(newPin)) {
        return NextResponse.json({ error: "Manager PIN must be 4-6 digits" }, { status: 400 })
      }
      hashedPin = await bcrypt.hash(newPin, 10)
    }

    await transaction(async (client) => {
      const updateSetting = async (key: string, value: string) => {
        if (value !== undefined) {
          await client.query(
            "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2",
            [key, value.toString()]
          )
        }
      }

      await updateSetting("business_name", business_name)
      await updateSetting("business_address", business_address)
      await updateSetting("business_tin", business_tin)
      if (hashedPin) await updateSetting("manager_pin", hashedPin)
      await updateSetting("vat_rate", vat_rate)
      await updateSetting("auto_print", auto_print)
    })

    return NextResponse.json({ message: "Settings updated successfully" })
  } catch (error) {
    console.error("[v0] Error updating settings:", error)
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 })
  }
}
