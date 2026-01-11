import { NextResponse } from "next/server"
import { query } from "@/lib/db"

export async function GET() {
  try {
    const history = await query(
      "SELECT * FROM daily_readings WHERE type = 'Z' ORDER BY reading_date DESC LIMIT 50"
    )
    return NextResponse.json(history)
  } catch (error) {
    console.error("[v0] Error fetching reading history:", error)
    return NextResponse.json({ error: "Failed to fetch reading history" }, { status: 500 })
  }
}
