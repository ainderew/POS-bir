import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import type { FinancialReport, ProductReport } from "@/lib/types"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    const params: any[] = []
    const conditions: string[] = []

    if (startDate) {
      params.push(startDate)
      conditions.push(`t.created_at >= $${params.length}::timestamp`)
    }

    if (endDate) {
      params.push(endDate)
      conditions.push(`t.created_at <= $${params.length}::timestamp`)
    }

    const whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : ""

    // Get summary statistics
    const summaryQuery = `
      SELECT 
        COALESCE(SUM(net_sales), 0) as total_revenue,
        COALESCE(SUM(gross_sales - net_sales), 0) as total_tax_discount, -- just to have it
        COUNT(*) as total_transactions
      FROM transactions t
      ${whereClause}
    `

    const summary = await query(summaryQuery, params)

    // Get total profit from transaction items
    const profitQuery = `
      SELECT COALESCE(SUM(ti.profit), 0) as total_profit
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.id
      ${whereClause}
    `
    const profitRes = await query(profitQuery, params)
    const totalProfit = profitRes[0].total_profit

    // Get per-product analysis
    const itemsQuery = `
      SELECT 
        p.id as product_id,
        p.name as product_name,
        SUM(ti.quantity_sold) as total_quantity_sold,
        SUM(ti.price_at_sale * ti.quantity_sold) as total_revenue,
        SUM(ti.profit) as total_profit
      FROM transaction_items ti
      JOIN products p ON ti.product_id = p.id
      JOIN transactions t ON ti.transaction_id = t.id
      ${whereClause}
      GROUP BY p.id, p.name
      ORDER BY total_profit DESC
    `

    const items = await query<ProductReport>(itemsQuery, params)

    const report: FinancialReport = {
      total_revenue: Number.parseFloat(summary[0].total_revenue) || 0,
      total_profit: Number.parseFloat(totalProfit) || 0,
      total_transactions: Number.parseInt(summary[0].total_transactions) || 0,
      items,
    }

    return NextResponse.json(report)
  } catch (error) {
    console.error("[v0] Error generating financial report:", error)
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 })
  }
}
