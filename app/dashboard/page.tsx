"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { StatCard } from "@/components/dashboard/stat-card"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { TransactionsTable } from "@/components/dashboard/transactions-table"
import { ProductPerformanceTable } from "@/components/dashboard/product-performance-table"
import { StrategyTab } from "@/components/dashboard/strategy-tab"
import { TransactionDetailsDialog } from "@/components/dashboard/transaction-details-dialog"
import { AuditLogsTable } from "@/components/dashboard/audit-logs-table"
import { DollarSign, TrendingUp, ShoppingBag, Calendar, Settings, ArrowLeft, Shield } from "lucide-react"
import Link from "next/link"
import { startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns"
import type { DateRange } from "react-day-picker"
import type { Transaction, FinancialReport } from "@/lib/types"
import { toast } from "sonner"

import { ExecutiveDashboard } from "@/components/dashboard/executive-dashboard"

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [transactions, setTransactions] = useState<(Transaction & { item_count?: number })[]>([])
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [financialReport, setFinancialReport] = useState<FinancialReport | null>(null)
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  
  useEffect(() => {
    fetchData()
  }, [dateRange])

  const fetchData = async () => {
    try {
      const params = new URLSearchParams()

      if (dateRange?.from) {
        params.append("startDate", startOfDay(dateRange.from).toISOString())
      }

      if (dateRange?.to) {
        params.append("endDate", endOfDay(dateRange.to).toISOString())
      }

      const [transactionsRes, reportRes, auditRes] = await Promise.all([
        fetch(`/api/transactions?${params.toString()}`),
        fetch(`/api/reports/financials?${params.toString()}`),
        fetch(`/api/audit-logs?${params.toString()}`),
      ])

      if (transactionsRes.ok && reportRes.ok && auditRes.ok) {
        const transactionsData = await transactionsRes.json()
        const reportData = await reportRes.json()
        const auditData = await auditRes.json()

        setTransactions(transactionsData)
        setFinancialReport(reportData)
        setAuditLogs(auditData)
      }
    } catch (error) {
      toast.error("Failed to fetch dashboard data")
    }
  }

  const handleQuickFilter = (filter: "today" | "month" | "year" | "all") => {
    const now = new Date()

    switch (filter) {
      case "today":
        setDateRange({ from: startOfDay(now), to: endOfDay(now) })
        break
      case "month":
        setDateRange({ from: startOfMonth(now), to: endOfMonth(now) })
        break
      case "year":
        setDateRange({ from: startOfYear(now), to: endOfYear(now) })
        break
      case "all":
        setDateRange(undefined)
        break
    }
  }

  const handleViewDetails = (id: string) => {
    setSelectedTransactionId(id)
    setIsDetailsOpen(true)
  }

  const profitMargin = financialReport
    ? financialReport.total_revenue > 0
      ? (financialReport.total_profit / financialReport.total_revenue) * 100
      : 0
    : 0

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <h1 className="text-4xl font-bold text-balance">
                Store Dashboard
              </h1>
            </div>
            <p className="text-muted-foreground mt-2">
              Business intelligence, transaction history, and security audits
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/dashboard/settings">
              <Button variant="outline">
                <Settings className="h-4 w-4 mr-2" />
                Settings & Compliance
              </Button>
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => handleQuickFilter("today")}>
            Today
          </Button>
          <Button variant="outline" onClick={() => handleQuickFilter("month")}>
            This Month
          </Button>
          <Button variant="outline" onClick={() => handleQuickFilter("year")}>
            This Year
          </Button>
          <Button variant="outline" onClick={() => handleQuickFilter("all")}>
            All Time
          </Button>
          <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="products">Product Performance</TabsTrigger>
            <TabsTrigger value="strategy">Strategy</TabsTrigger>
            <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard
                title="Total Revenue"
                value={`₱${financialReport?.total_revenue.toFixed(2) || "0.00"}`}
                icon={DollarSign}
                description="Total sales amount"
              />
              <StatCard
                title="Total Profit"
                value={`₱${financialReport?.total_profit.toFixed(2) || "0.00"}`}
                icon={TrendingUp}
                description={`${profitMargin.toFixed(1)}% profit margin`}
              />
              <StatCard
                title="Transactions"
                value={financialReport?.total_transactions.toString() || "0"}
                icon={ShoppingBag}
                description="Total completed sales"
              />
              <StatCard
                title="Avg. Transaction"
                value={`₱${
                  financialReport && financialReport.total_transactions > 0
                    ? (financialReport.total_revenue / financialReport.total_transactions).toFixed(2)
                    : "0.00"
                }`}
                icon={Calendar}
                description="Average sale value"
              />
            </div>

            <ExecutiveDashboard dateRange={dateRange} />
          </TabsContent>

          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <CardTitle>Transaction History</CardTitle>
                <CardDescription>Complete list of all sales transactions</CardDescription>
              </CardHeader>
              <CardContent>
                <TransactionsTable 
                  transactions={transactions} 
                  onViewDetails={handleViewDetails} 
                  onViewRef={async (invoice) => {
                    try {
                      const res = await fetch(`/api/transactions/lookup?invoiceNumber=${invoice}`)
                      const data = await res.json()
                      if (res.ok) {
                        handleViewDetails(data.id)
                      } else {
                        toast.error("Transaction not found")
                      }
                    } catch (err) {
                      toast.error("Failed to lookup transaction")
                    }
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products">
            <Card>
              <CardHeader>
                <CardTitle>Product Performance</CardTitle>
                <CardDescription>Analysis of product sales and profitability</CardDescription>
              </CardHeader>
              <CardContent>
                <ProductPerformanceTable products={financialReport?.items || []} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="strategy">
            <StrategyTab />
          </TabsContent>

          <TabsContent value="audit">
            <Card>
              <CardHeader>
                <CardTitle>Audit Logs</CardTitle>
                <CardDescription>System events, shift changes, and security audits</CardDescription>
              </CardHeader>
              <CardContent>
                <AuditLogsTable logs={auditLogs} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <TransactionDetailsDialog
        transactionId={selectedTransactionId}
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        onVoidSuccess={fetchData}
      />
    </div>
  )
}
