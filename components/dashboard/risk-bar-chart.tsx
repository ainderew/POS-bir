
"use client"

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface RiskMetric {
  name: string
  risk_score: number
  void_count: number
  cash_variance: number
}

interface RiskBarChartProps {
  data: RiskMetric[]
}

export function RiskBarChart({ data }: RiskBarChartProps) {
  // Calculate average to determine high risk
  const avgScore = data.reduce((acc, curr) => acc + curr.risk_score, 0) / (data.length || 1)

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload
      return (
        <div className="bg-background border rounded-lg p-2 shadow-lg text-xs">
          <p className="font-bold mb-1">{label}</p>
          <p>Risk Score: {d.risk_score.toFixed(0)}</p>
          <p className="text-muted-foreground">Voids: {d.void_count}</p>
          <p className="text-muted-foreground">Variance: ₱{d.cash_variance.toFixed(2)}</p>
        </div>
      )
    }
    return null
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Staff Integrity Matrix</CardTitle>
        <CardDescription>
          Risk analysis based on voids and cash variance.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 min-h-[0px] p-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <XAxis 
              dataKey="name" 
              stroke="hsl(var(--muted-foreground))" 
              fontSize={11} 
              tickLine={false} 
              axisLine={false}
              tickFormatter={(value) => value.split(' ')[0]} // First name only
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))" 
              fontSize={11} 
              tickLine={false} 
              axisLine={false} 
              tickFormatter={(value) => `${value}`} 
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
            <Bar dataKey="risk_score" radius={[4, 4, 0, 0]} barSize={40}>
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.risk_score > avgScore * 1.5 ? "hsl(var(--destructive))" : "hsl(var(--primary))"} 
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
