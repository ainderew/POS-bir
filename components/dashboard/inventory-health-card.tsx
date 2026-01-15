
"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Package, AlertCircle, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface InventoryHealth {
  low_stock_count: number
  total_products: number
  out_of_stock_count: number
}

interface InventoryHealthCardProps {
  data: InventoryHealth
}

export function InventoryHealthCard({ data }: InventoryHealthCardProps) {
  const healthyCount = data.total_products - data.low_stock_count - data.out_of_stock_count
  const healthPercentage = data.total_products > 0 ? (healthyCount / data.total_products) * 100 : 0

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Inventory Health</CardTitle>
            <CardDescription>Stock status overview</CardDescription>
          </div>
          <div className={cn(
            "px-2.5 py-0.5 rounded-full text-xs font-bold border",
            healthPercentage > 80 ? "bg-green-500/10 text-green-600 border-green-200" :
            healthPercentage > 50 ? "bg-yellow-500/10 text-yellow-600 border-yellow-200" :
            "bg-red-500/10 text-red-600 border-red-200"
          )}>
            {healthPercentage.toFixed(0)}% Healthy
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-center space-y-4">
        
        {/* No Stock */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-full">
              <XCircle className="h-4 w-4 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-medium">No Stock</p>
              <p className="text-xs text-muted-foreground">Critical attention needed</p>
            </div>
          </div>
          <span className="text-xl font-bold text-red-600">{data.out_of_stock_count}</span>
        </div>

        {/* Low Stock */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900/20 rounded-full">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm font-medium">Low Stock</p>
              <p className="text-xs text-muted-foreground">Reorder soon</p>
            </div>
          </div>
          <span className="text-xl font-bold text-yellow-600">{data.low_stock_count}</span>
        </div>

        {/* Total Products */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground">Total SKU Count</p>
          </div>
          <span className="text-sm font-medium">{data.total_products}</span>
        </div>

      </CardContent>
    </Card>
  )
}
