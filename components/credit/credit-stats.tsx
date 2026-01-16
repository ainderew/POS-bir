import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CreditStats } from "@/lib/credit-types"
import { Wallet, AlertTriangle, Activity, Users } from "lucide-react"

export function CreditStatsCard({ stats }: { stats: CreditStats }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Receivables</CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">₱{stats.totalReceivables.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <p className="text-xs text-muted-foreground">
            From {stats.totalDebtors} active debtors
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Overdue ({'>'}30 Days)</CardTitle>
          <AlertTriangle className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">₱{stats.overdueAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <p className="text-xs text-muted-foreground">
            Needs immediate attention
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Collection Efficiency</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.collectionRate}%</div>
          <p className="text-xs text-muted-foreground">
            Debt collected in last 30 days
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Risk Status</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.blockedCount}</div>
          <p className="text-xs text-muted-foreground">
            Blocked Accounts
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
