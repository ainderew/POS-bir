import { NextResponse } from "next/server"
import { query } from "@/lib/db"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const customerId = id
    const { searchParams } = new URL(request.url)
    
    // Default to last 30 days if not specified? Or all unpaid?
    // Let's grab all by default for now, or use date range if provided.
    const start = searchParams.get("startDate") 
    const end = searchParams.get("endDate")
    
    let sql = `
      SELECT cl.*, t.invoice_number 
      FROM credit_ledger cl
      LEFT JOIN transactions t ON cl.transaction_id = t.id
      WHERE cl.customer_id = $1
    `
    const sqlParams: any[] = [customerId]
    
    if (start) {
        sqlParams.push(start)
        sql += ` AND cl.occurred_at >= $${sqlParams.length}`
    }
    
    if (end) {
        sqlParams.push(end)
        sql += ` AND cl.occurred_at <= $${sqlParams.length}`
    }
    
    sql += ` ORDER BY cl.occurred_at DESC`
    
    const entries = await query(sql, sqlParams)
    
    const customer = await query("SELECT * FROM customers WHERE id = $1", [customerId])
    
    if (customer.length === 0) {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 })
    }
    
    return NextResponse.json({
        customer: customer[0],
        entries: entries.map(e => ({
            ...e,
            amount: Number(e.amount),
            running_balance: Number(e.running_balance)
        }))
    })
    
  } catch (error) {
     console.error("[v0] SOA error:", error)
     return NextResponse.json({ error: "Failed to fetch SOA" }, { status: 500 })
  }
}
