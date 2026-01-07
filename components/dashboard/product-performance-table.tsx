import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import type { ProductReport } from "@/lib/types"

interface ProductPerformanceTableProps {
  products: ProductReport[]
}

export function ProductPerformanceTable({ products }: ProductPerformanceTableProps) {
  const maxRevenue = Math.max(...products.map((p) => p.total_revenue), 1)

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product Name</TableHead>
            <TableHead className="text-center">Quantity Sold</TableHead>
            <TableHead className="text-right">Revenue</TableHead>
            <TableHead className="text-right">Profit</TableHead>
            <TableHead className="text-right">Profit Margin</TableHead>
            <TableHead>Performance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                No sales data available
              </TableCell>
            </TableRow>
          ) : (
            products.map((product) => {
              const profitMargin = (product.total_profit / product.total_revenue) * 100
              const performanceWidth = (product.total_revenue / maxRevenue) * 100

              return (
                <TableRow key={product.product_id}>
                  <TableCell className="font-medium">{product.product_name}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{product.total_quantity_sold.toFixed(2)}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">₱{product.total_revenue.toFixed(2)}</TableCell>
                  <TableCell className="text-right text-green-600 font-mono">₱{product.total_profit.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{profitMargin.toFixed(1)}%</TableCell>
                  <TableCell>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary rounded-full h-2 transition-all"
                        style={{ width: `${performanceWidth}%` }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}
