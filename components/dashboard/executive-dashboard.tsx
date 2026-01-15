
"use client"

import { useState, useEffect } from "react"
import { RiskBarChart } from "./risk-bar-chart"
import { SalesHeatmap } from "./sales-heatmap"
import { TopProductsChart } from "./top-products-chart"
import { InventoryHealthCard } from "./inventory-health-card"
import { DashboardSkeleton } from "./dashboard-skeleton"
import type { DashboardMetrics } from "@/lib/dashboard-types"
import { toast } from "sonner"
import { CashMovementDialog } from "@/components/pos/cash-movements-dialog"
import type { DateRange } from "react-day-picker"
import { startOfDay, endOfDay } from "date-fns"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, Activity } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface ExecutiveDashboardProps {
  dateRange?: DateRange
}

export function ExecutiveDashboard({ dateRange }: ExecutiveDashboardProps) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [isDropCashOpen, setIsDropCashOpen] = useState(false)

  // We need to fetch the active shift ID for the Cash Movement Dialog
  // In a real app, this might come from a context or a separate hook
  const [activeShiftId, setActiveShiftId] = useState<string | null>(null)

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const params = new URLSearchParams()
        if (dateRange?.from) {
          params.append("startDate", startOfDay(dateRange.from).toISOString())
        }
        if (dateRange?.to) {
          params.append("endDate", endOfDay(dateRange.to).toISOString())
        }

        const res = await fetch(`/api/dashboard/metrics?${params.toString()}`)
        if (res.ok) {
          const data = await res.json()
          setMetrics(data)
        }
        
        // Fetch active shift for Drop Cash function
        const shiftRes = await fetch("/api/shifts/current")
        if (shiftRes.ok) {
          const shift = await shiftRes.json()
          if (shift) setActiveShiftId(shift.id)
        }
      } catch (error) {
        console.error("Failed to load executive metrics", error)
        toast.error("Failed to load business intelligence data")
      } finally {
        setLoading(false)
      }
    }

    fetchMetrics()
    
    // Refresh every 30 seconds for "Real-time" feel
    const interval = setInterval(fetchMetrics, 30000)
    return () => clearInterval(interval)
  }, [dateRange])

  const handleCashMovementSuccess = () => {
    setIsDropCashOpen(false)
    toast.success("Cash dropped successfully")
    // Re-fetch metrics immediately
    setLoading(true) // Show subtle loading state? Or just silent refresh.
    fetch("/api/dashboard/metrics").then(r => r.json()).then(setMetrics).finally(() => setLoading(false))
  }

  const handleDropCashClick = () => {
    if (activeShiftId) {
      setIsDropCashOpen(true)
    } else {
      toast.error("No active shift found. Cannot drop cash.")
    }
  }

  if (loading && !metrics) {
    return <DashboardSkeleton />
  }

  if (!metrics) return null

  return (
    <div className="mb-8 space-y-4">
      {/* 3x2 Grid Layout */}
      <div className="grid gap-4 md:grid-cols-2">
        
        {/* Layer 1: Financial Risk & Security */}
        <Card className={cn(
          "border-l-4 transition-all duration-500 h-full",
          metrics.pulse.cash_exposure > 10000 ? "border-l-orange-500 animate-pulse-border" : "border-l-transparent"
        )}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cash in Drawer</CardTitle>
            {metrics.pulse.cash_exposure > 10000 && <AlertTriangle className="h-4 w-4 text-orange-500" />}
          </CardHeader>
          <CardContent>
            <div className={cn(
              "text-2xl font-bold",
              metrics.pulse.cash_exposure > 10000 ? "text-orange-600" : "text-foreground"
            )}>
              ₱{metrics.pulse.cash_exposure.toLocaleString()}
            </div>
            <div className="flex justify-between items-center mt-1">
              <p className="text-xs text-muted-foreground">
                {metrics.pulse.cash_exposure > 10000 ? "High Theft Risk" : "Within safe limits"}
              </p>
              <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={handleDropCashClick}>
                Drop Cash
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Risk Activity</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-3 h-3 rounded-full",
                metrics.pulse.active_alerts === 0 ? "bg-green-500" : 
                metrics.pulse.active_alerts < 5 ? "bg-yellow-500" : "bg-red-500 animate-pulse"
              )} />
              <div className="text-2xl font-bold">{metrics.pulse.active_alerts}</div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Voids & Anomalies (Selected Period)
            </p>
          </CardContent>
        </Card>

        {/* Layer 2: Product Performance */}
        <div className="h-[300px]">
          <TopProductsChart data={metrics.top_products || []} />
        </div>
        <div className="h-[300px]">
          <InventoryHealthCard data={metrics.inventory_health || { low_stock_count: 0, out_of_stock_count: 0, total_products: 0 }} />
        </div>

        {/* Layer 3: Operational Deep Dive */}
        <div className="h-[300px]">
          <RiskBarChart data={metrics.staff_risk} />
        </div>
        <div className="h-[300px]">
          <SalesHeatmap data={metrics.sales_velocity} />
        </div>
      </div>

      <CashMovementDialog 
        isOpen={isDropCashOpen}
        onClose={() => setIsDropCashOpen(false)}
        onConfirm={async (type, amount, reason) => {
           const res = await fetch("/api/cash-movements", {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ shiftId: activeShiftId, type: "SAFE_DROP", amount, reason })
           })
           if (!res.ok) throw new Error("Failed")
           handleCashMovementSuccess()
        }}
        defaultType="SAFE_DROP"
      />
    </div>
  )
}
