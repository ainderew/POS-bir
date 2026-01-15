
import { UserRole } from "./types"

export interface DashboardMetrics {
  pulse: {
    net_sales_today: number
    net_sales_yesterday: number
    percent_change: number
    cash_exposure: number
    active_alerts: number
  }
  staff_risk: {
    cashier_id: string
    name: string
    risk_score: number
    void_count: number
    cash_variance: number
  }[]
  sales_velocity: {
    day_of_week: number // 0-6
    hour_of_day: number // 0-23
    volume: number
  }[]
  top_products: {
    id: string
    name: string
    revenue: number
    quantity: number
  }[]
  inventory_health: {
    low_stock_count: number
    total_products: number
    out_of_stock_count: number
  }
}
