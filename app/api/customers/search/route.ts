import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { Customer } from "@/lib/types"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get("q")
    
    if (!q || q.length < 2) {
      return NextResponse.json([])
    }
    
    // Search on full_name or phone_number using LIKE (case-insensitive in SQLite for ASCII)
    // Ordered by last_visit_at (recent customers first)
    const sql = `
      SELECT * FROM customers
      WHERE
        full_name LIKE $1
        OR phone_number LIKE $1
      ORDER BY
        last_visit_at DESC NULLS LAST,
        total_spend DESC,
        full_name ASC
      LIMIT 20
    `

    const params = [`%${q}%`]
    
    const customers = await query<Customer>(sql, params)
    
    const formatted = customers.map(c => ({
      ...c,
      credit_limit: Number(c.credit_limit),
      current_debt_balance: Number(c.current_debt_balance),
      total_spend: Number(c.total_spend)
    }))
    
    return NextResponse.json(formatted)
  } catch (error) {
    console.error("[v0] Search error:", error)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}
