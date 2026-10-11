"use client"

import { useEffect, useState } from "react"
import type { CreditStats as CreditStatsType } from "@/lib/credit-types"
import { CreditStatsCard } from "@/components/credit/credit-stats"
import { CreditTable } from "@/components/credit/credit-table"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { toast } from "sonner"

export default function CreditDashboardPage() {
  const [stats, setStats] = useState<CreditStatsType | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/dashboard/credit-stats")
      const data = await res.json().catch(() => null)
      // Only accept a well-formed payload; on error keep the last good stats
      if (!res.ok || typeof data?.totalReceivables !== "number" || typeof data?.overdueAmount !== "number") {
        throw new Error(data?.error || `Credit stats request failed (${res.status})`)
      }
      setStats(data)
    } catch (error) {
      console.error("Failed to fetch stats", error)
      toast.error("Failed to load credit stats")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  return (
    <div className="flex flex-col h-full gap-4 p-4 md:p-8 overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
             <Link href="/dashboard">
                <Button variant="ghost" size="icon">
                    <ArrowLeft className="h-5 w-5" />
                </Button>
             </Link>
             <div>
                <h1 className="text-3xl font-bold tracking-tight">Credit & Collections</h1>
                <div className="text-sm text-muted-foreground">
                   Manage receivables and risk
                </div>
             </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : stats ? (
        <CreditStatsCard stats={stats} />
      ) : null}

      <div className="flex-1 overflow-hidden rounded-lg border bg-card">
         <CreditTable onUpdate={fetchStats} />
      </div>
    </div>
  )
}
