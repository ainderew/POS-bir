
"use client"

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell, LabelList } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface TopProduct {
  id: string
  name: string
  revenue: number
  quantity: number
}

interface TopProductsChartProps {
  data: TopProduct[]
}

export function TopProductsChart({ data }: TopProductsChartProps) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload
      return (
        <div className="bg-background border rounded-lg p-2 shadow-lg text-xs">
          <p className="font-bold mb-1 truncate max-w-[150px]">{d.name}</p>
          <p className="text-primary font-bold">₱{d.revenue.toLocaleString()}</p>
          <p className="text-muted-foreground">{d.quantity} sold</p>
        </div>
      )
    }
    return null
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Top Products</CardTitle>
        <CardDescription>
          Highest revenue items for selected period.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 min-h-[0px] p-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
            data={data} 
            layout="vertical" 
            margin={{ top: 5, right: 50, left: 10, bottom: 5 }} 
            barSize={32}
          >
            <XAxis type="number" hide domain={[0, 'dataMax * 1.2']} />
            <YAxis 
              dataKey="name" 
              type="category" 
              width={140}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(val) => val.length > 22 ? val.substring(0, 19) + '...' : val}
              interval={0} 
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
            <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}>
              <LabelList 
                dataKey="revenue" 
                position="right" 
                formatter={(val: number) => `₱${(val / 1000).toFixed(1)}k`}
                className="fill-foreground text-[11px] font-bold"
                offset={12}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
