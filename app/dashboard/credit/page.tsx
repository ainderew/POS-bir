"use client"

import { useEffect, useState } from "react"
import { CreditStats as CreditStatsType } from "@/lib/credit-types"
import { CreditStatsCard } from "@/components/credit/credit-stats"
import { CreditTable } from "@/components/credit/credit-table"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function CreditDashboardPage() {
  const [stats, setStats] = useState<CreditStatsType | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/dashboard/credit-stats")
      const data = await res.json()
      setStats(data)
    } catch (error) {
      console.error("Failed to fetch stats", error)
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
