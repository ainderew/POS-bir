
import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { startOfDay, subDays, differenceInMilliseconds, subMilliseconds } from "date-fns"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const startDateParam = searchParams.get("startDate")
    const endDateParam = searchParams.get("endDate")

    const today = new Date()
    // Defaults if no params
    let currentStart = startOfDay(today).toISOString()
    let currentEnd = new Date().toISOString() // Now
    let previousStart = startOfDay(subDays(today, 1)).toISOString()
    let previousEnd = startOfDay(today).toISOString()

    // Override if params exist
    if (startDateParam) {
      currentStart = startDateParam
      currentEnd = endDateParam || new Date().toISOString()
      
      const start = new Date(currentStart)
      const end = new Date(currentEnd)
      const duration = differenceInMilliseconds(end, start)
      
      previousEnd = currentStart
      previousStart = subMilliseconds(start, duration).toISOString()
    }

    // 1. Pulse Metrics
    const salesData = await query(
      `
      SELECT 
        SUM(CASE WHEN created_at >= $1 AND created_at <= $2 THEN net_sales ELSE 0 END) as current_sales,
        SUM(CASE WHEN created_at >= $3 AND created_at < $1 THEN net_sales ELSE 0 END) as previous_sales
      FROM transactions 
      WHERE status = 'PAID'
      `,
      [currentStart, currentEnd, previousStart]
    )

    const currentSales = parseFloat(salesData[0].current_sales || 0)
    const previousSales = parseFloat(salesData[0].previous_sales || 0)
    const percentChange = previousSales > 0 
      ? ((currentSales - previousSales) / previousSales) * 100 
      : 0

    // Cash Exposure (Open Shifts) - ALWAYS REALTIME
    // This metric represents physical cash currently in drawers, so it ignores date filters
    const exposureData = await query(
      `
      WITH shift_totals AS (
        SELECT 
          s.id,
          s.opening_fund,
          COALESCE((
            SELECT SUM(t.net_sales) 
            FROM transactions t 
            WHERE t.pos_id = s.pos_id
          ), 0) as sales
        FROM shifts s
        WHERE s.status = 'OPEN'
      )
      SELECT 
        COALESCE(SUM(s.opening_fund), 0) + 
        COALESCE((
          SELECT SUM(t.net_sales)
          FROM transactions t
          JOIN shifts s ON t.pos_id = s.pos_id AND t.created_at >= s.start_time
          WHERE s.status = 'OPEN' AND t.payment_method = 'CASH' AND t.status = 'PAID'
        ), 0) +
        COALESCE((
          SELECT SUM(cm.amount)
          FROM cash_movements cm
          JOIN shifts s ON cm.shift_id = s.id
          WHERE s.status = 'OPEN' AND cm.type = 'CASH_IN'
        ), 0) - 
        COALESCE((
          SELECT SUM(cm.amount)
          FROM cash_movements cm
          JOIN shifts s ON cm.shift_id = s.id
          WHERE s.status = 'OPEN' AND (cm.type = 'CASH_OUT' OR cm.type = 'SAFE_DROP')
        ), 0) as total_exposure
      FROM shifts s
      WHERE s.status = 'OPEN'
      `
    )
    const cashExposure = parseFloat(exposureData[0]?.total_exposure || 0)

    // Active Alerts - Respects Date Filter
    const alertsData = await query(
      `
      SELECT 
        (SELECT COUNT(*) FROM voids WHERE occurred_at >= $1 AND occurred_at <= $2) +
        (SELECT COUNT(*) FROM transactions WHERE status = 'VOIDED' AND created_at >= $1 AND created_at <= $2) +
        (SELECT COUNT(*) FROM shifts WHERE status = 'CLOSED' AND end_time >= $1 AND end_time <= $2 AND ABS(variance) > 100)
      as alert_count
      `,
      [currentStart, currentEnd]
    )
    const activeAlerts = parseInt(alertsData[0].alert_count || 0)

    // 2. Staff Risk Matrix
    // Uses Filtered Range (Default to last 30 days if no filter to provide context)
    const riskStart = startDateParam || subDays(today, 30).toISOString()
    const riskEnd = endDateParam || new Date().toISOString()

    const staffRiskData = await query(
      `
      SELECT 
        u.id as cashier_id,
        u.full_name as name,
        COALESCE(COUNT(DISTINCT v.id), 0) as void_count,
        COALESCE(SUM(ABS(s.variance)), 0) as cash_variance
      FROM users u
      LEFT JOIN voids v ON v.cashier_id = u.id AND v.occurred_at >= $1 AND v.occurred_at <= $2
      LEFT JOIN shifts s ON s.user_id = u.id AND s.status = 'CLOSED' AND s.end_time >= $1 AND s.end_time <= $2
      WHERE u.role IN ('CASHIER', 'MANAGER', 'ADMIN', 'OWNER')
      GROUP BY u.id, u.full_name
      ORDER BY (COALESCE(COUNT(DISTINCT v.id), 0) * 10 + COALESCE(SUM(ABS(s.variance)), 0)) DESC
      LIMIT 5
      `,
      [riskStart, riskEnd]
    )

    const staffRisk = staffRiskData.map((row: any) => ({
      cashier_id: row.cashier_id,
      name: row.name,
      void_count: parseInt(row.void_count),
      cash_variance: parseFloat(row.cash_variance),
      risk_score: (parseInt(row.void_count) * 10) + parseFloat(row.cash_variance)
    }))

    // 3. Sales Velocity (Heatmap)
    // ALWAYS fetch last 30 days to show trends, regardless of current filter
    const velocityData = await query(
      `
      SELECT 
        EXTRACT(DOW FROM created_at) as day_of_week,
        EXTRACT(HOUR FROM created_at) as hour_of_day,
        COUNT(*) as volume
      FROM transactions
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY day_of_week, hour_of_day
      ORDER BY day_of_week, hour_of_day
      `
    )

    const salesVelocity = velocityData.map((row: any) => ({
      day_of_week: parseInt(row.day_of_week),
      hour_of_day: parseInt(row.hour_of_day),
      volume: parseInt(row.volume)
    }))

    // 4. Top Products (By Revenue)
    const topProductsData = await query(
      `
      SELECT 
        p.id,
        p.name,
        SUM(ti.quantity_sold) as quantity,
        SUM(ti.price_at_sale * ti.quantity_sold) as revenue
      FROM transaction_items ti
      JOIN products p ON ti.product_id = p.id
      JOIN transactions t ON ti.transaction_id = t.id
      WHERE t.created_at >= $1 AND t.created_at <= $2 AND t.status = 'PAID'
      GROUP BY p.id, p.name
      ORDER BY revenue DESC
      LIMIT 5
      `,
      [riskStart, riskEnd]
    )

    const topProducts = topProductsData.map((row: any) => ({
      id: row.id,
      name: row.name,
      revenue: parseFloat(row.revenue),
      quantity: parseFloat(row.quantity)
    }))

    // 5. Inventory Health
    const inventoryData = await query(
      `
      SELECT 
        COUNT(*) as total_products,
        COUNT(CASE WHEN stock_level <= 0 THEN 1 END) as out_of_stock,
        COUNT(CASE WHEN stock_level > 0 AND stock_level <= low_stock_threshold THEN 1 END) as low_stock
      FROM products
      `
    )

    const inventoryHealth = {
      total_products: parseInt(inventoryData[0].total_products),
      out_of_stock_count: parseInt(inventoryData[0].out_of_stock),
      low_stock_count: parseInt(inventoryData[0].low_stock)
    }

    return NextResponse.json({
      pulse: {
        net_sales_today: currentSales, 
        net_sales_yesterday: previousSales,
        percent_change: percentChange,
        cash_exposure: cashExposure,
        active_alerts: activeAlerts
      },
      staff_risk: staffRisk,
      sales_velocity: salesVelocity,
      top_products: topProducts,
      inventory_health: inventoryHealth
    })

  } catch (error) {
    console.error("[dashboard-metrics] Error:", error)
    return NextResponse.json({ error: "Failed to generate metrics" }, { status: 500 })
  }
}
