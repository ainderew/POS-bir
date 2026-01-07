import { NextResponse } from "next/server"
import { query } from "@/lib/db"

export async function POST() {
  try {
    // Generate a unique barcode using timestamp and random numbers
    const timestamp = Date.now().toString().slice(-8)
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0")
    const barcode = `${timestamp}${random}`

    // Check if barcode already exists
    const existing = await query("SELECT id FROM products WHERE barcode = $1", [barcode])

    if (existing.length > 0) {
      // Recursively try again if collision (very unlikely)
      return POST()
    }

    return NextResponse.json({ barcode })
  } catch (error) {
    console.error("[v0] Error generating barcode:", error)
    return NextResponse.json({ error: "Failed to generate barcode" }, { status: 500 })
  }
}
