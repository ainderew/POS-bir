import { NextResponse } from "next/server"
import { query } from "@/lib/db"

export async function GET() {
  try {
    // 1. Total Receivables & Total Debtors & Blocked
    const receivablesRes = await query(`
      SELECT 
        SUM(current_debt_balance) as total,
        COUNT(*) filter (where current_debt_balance > 0) as count_debtors,
        COUNT(*) filter (where credit_status = 'BLOCKED') as count_blocked
      FROM customers 
      WHERE current_debt_balance > 0 OR credit_status = 'BLOCKED'
    `)
    const totalReceivables = Number(receivablesRes[0].total || 0)
    const totalDebtors = Number(receivablesRes[0].count_debtors || 0)
    const blockedCount = Number(receivablesRes[0].count_blocked || 0)

    // 2. Overdue (>30 Days)
    // Definition: Customers with debt > 0 AND:
    // - Paid more than 30 days ago OR
    // - Never paid AND Last Purchase (last_visit_at) was > 30 days ago
    // If they never paid but bought yesterday (last_visit_at < 30 days), they are NOT overdue.
    // If last_visit_at is also null (legacy), we might assume overdue or safe. Assuming safe for now to avoid false alarm.
    const overdueRes = await query(`
      SELECT SUM(current_debt_balance) as overdue
      FROM customers
      WHERE current_debt_balance > 0
      AND (
        (last_payment_date IS NOT NULL AND last_payment_date < NOW() - INTERVAL '30 days')
        OR 
        (last_payment_date IS NULL AND last_visit_at IS NOT NULL AND last_visit_at < NOW() - INTERVAL '30 days')
      )
    `)
    const overdueAmount = Number(overdueRes[0].overdue || 0)

    // 3. Collection Rate (Amount Collected vs Total Exposure in last 30 days)
    // Formula: Collected / (Collected + Outstanding) * 100
    // This represents the percentage of debt that has been converted back to cash.
    const paidRes = await query(`
      SELECT COALESCE(SUM(amount), 0) as total_collected
      FROM credit_ledger
      WHERE entry_type = 'PAYMENT'
      AND occurred_at > NOW() - INTERVAL '30 days'
    `)
    const totalCollected = Number(paidRes[0].total_collected || 0)
    const totalExposure = totalReceivables + totalCollected
    
    // Avoid division by zero
    const collectionRate = totalExposure > 0 
      ? Math.round((totalCollected / totalExposure) * 100) 
      : 0

    return NextResponse.json({
      totalReceivables,
      overdueAmount,
      collectionRate,
      totalDebtors,
      blockedCount
    })
  } catch (error) {
    console.error("[v0] Credit Stats Error:", error)
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 })
  }
}
