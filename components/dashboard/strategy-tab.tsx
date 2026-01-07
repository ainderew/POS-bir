"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  ScatterChart, 
  Scatter, 
  XAxis, 
  YAxis, 
  ZAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  ReferenceLine
} from "recharts"
import { 
  TrendingUp, 
  Package, 
  ShoppingCart, 
  AlertTriangle, 
  BrainCircuit, 
  Zap,
  Target,
  Snowflake,
  Loader2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertCircle
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

export function StrategyTab() {
  const [activeTab, setActiveTab] = useState("market")
  const [isLoading, setIsLoading] = useState(true)
  
  // Data State
  const [menuData, setMenuData] = useState<any>(null)
  const [marketData, setMarketData] = useState<any>(null)
  
  // Slider State
  const [daysCover, setDaysCover] = useState(7)
  const [budget, setBudget] = useState(5000)
  const [supplierFilter, setSupplierFilter] = useState("ALL")

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [menuRes, marketRes] = await Promise.all([
        fetch("/api/reports/strategy/menu-doctor"),
        fetch("/api/reports/strategy/market-run")
      ])
      
      if (menuRes.ok && marketRes.ok) {
        setMenuData(await menuRes.json())
        setMarketData(await marketRes.json())
      }
    } catch (error) {
      toast.error("Failed to load strategy data")
    } finally {
      setIsLoading(false)
    }
  }

  // Simulation Logic for Market Run
  const simulatedList = useMemo(() => {
    if (!marketData) return []
    
    let currentBudget = budget
    
    return marketData.items
      .filter((item: any) => supplierFilter === "ALL" || item.supplier_type === supplierFilter)
      .map((item: any) => {
        const requiredQty = Math.max(0, Math.ceil((item.ads * daysCover) - parseFloat(item.stock_level)))
        const estCost = requiredQty * parseFloat(item.cost_price)
        
        // Never suggest more than 30 days stock
        const cap30d = Math.max(0, Math.ceil((item.ads * 30) - parseFloat(item.stock_level)))
        const finalQty = Math.min(requiredQty, cap30d)
        const finalCost = finalQty * parseFloat(item.cost_price)
        
        return {
          ...item,
          recommendedQty: finalQty,
          estimatedCost: finalCost,
          isStockoutRisk: parseFloat(item.stock_level) < item.ads
        }
      })
      .sort((a: any, b: any) => {
        // Survival Hierarchy: Tier 1 First, then by Margin
        if (a.priority_tier === 'TIER_1' && b.priority_tier !== 'TIER_1') return -1
        if (a.priority_tier !== 'TIER_1' && b.priority_tier === 'TIER_1') return 1
        return (parseFloat(b.selling_price) - parseFloat(b.cost_price)) - (parseFloat(a.selling_price) - parseFloat(a.cost_price))
      })
      .map((item: any) => {
        const canAfford = currentBudget >= item.estimatedCost
        if (canAfford && item.estimatedCost > 0) {
          currentBudget -= item.estimatedCost
          return { ...item, allocated: true }
        }
        return { ...item, allocated: false }
      })
  }, [marketData, daysCover, budget, supplierFilter])

  const totalAllocated = simulatedList.reduce((sum: number, item: any) => item.allocated ? sum + item.estimatedCost : sum, 0)

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground animate-pulse">Running strategy simulations...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Strategy & Growth</h2>
          <p className="text-muted-foreground">Actionable intelligence to optimize your profit and procurement.</p>
        </div>
        <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-lg flex items-center gap-4">
          <Snowflake className="h-8 w-8 text-destructive" />
          <div>
            <p className="text-[10px] uppercase font-bold text-destructive leading-tight">Frozen Cash</p>
            <p className="text-xl font-bold leading-tight">₱{menuData?.frozenCash?.toLocaleString() || "0"}</p>
            <p className="text-[9px] text-muted-foreground">Stuck in slow-moving "Dogs"</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="market" className="space-y-6" onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
          <TabsTrigger value="market" className="gap-2">
            <ShoppingCart className="h-4 w-4" />
            Market Run
          </TabsTrigger>
          <TabsTrigger value="doctor" className="gap-2">
            <BrainCircuit className="h-4 w-4" />
            Profit Doctor
          </TabsTrigger>
        </TabsList>

        <TabsContent value="market" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  Market Run Simulator
                </CardTitle>
                <CardDescription>Adjust sliders to see where to invest your capital.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8 pt-4">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-medium">Market Run Duration</label>
                    <Badge variant="secondary">{daysCover} Days</Badge>
                  </div>
                  <Slider 
                    value={[daysCover]} 
                    onValueChange={(v) => setDaysCover(v[0])} 
                    max={14} 
                    min={1} 
                    step={1} 
                  />
                  <p className="text-[10px] text-muted-foreground">How many days should this stock last?</p>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-medium">Available Budget</label>
                    <Badge className="bg-green-600">₱{budget.toLocaleString()}</Badge>
                  </div>
                  <Slider 
                    value={[budget]} 
                    onValueChange={(v) => setBudget(v[0])} 
                    max={50000} 
                    min={0} 
                    step={500} 
                  />
                  <p className="text-[10px] text-muted-foreground">Maximum cash to spend at the market today.</p>
                </div>

                <Separator />

                <div className="space-y-3">
                  <label className="text-sm font-medium">Trip Category</label>
                  <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Sources</SelectItem>
                      <SelectItem value="WET_MARKET">Wet Market</SelectItem>
                      <SelectItem value="WHOLESALER">Wholesaler</SelectItem>
                      <SelectItem value="DIRECT_DELIVERY">Direct Delivery</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="pt-4 p-4 bg-muted rounded-lg space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Est. Investment:</span>
                    <span className="font-bold">₱{totalAllocated.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Remaining Cash:</span>
                    <span className="font-bold text-green-600">₱{(budget - totalAllocated).toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Suggested Market List</CardTitle>
                <CardDescription>Prioritized by Survival Hierarchy (Velocity → Margin).</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto max-h-[600px]">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs uppercase bg-muted sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3">Item</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3 text-right">Burn Rate</th>
                        <th className="px-4 py-3 text-right">Buy Qty</th>
                        <th className="px-4 py-3 text-right">Est. Cost</th>
                        <th className="px-4 py-3 text-center">In Budget</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {simulatedList.map((item: any) => (
                        <tr key={item.id} className={!item.allocated ? "opacity-40 grayscale bg-muted/5" : ""}>
                          <td className="px-4 py-3">
                            <p className="font-bold">{item.name}</p>
                            <p className="text-[10px] text-muted-foreground uppercase">{item.supplier_type}</p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {item.isStockoutRisk ? (
                              <Badge variant="destructive" className="h-5 text-[9px] px-1">🚨 STOCKOUT</Badge>
                            ) : item.priority_tier === 'TIER_1' ? (
                              <Badge className="h-5 text-[9px] px-1 bg-yellow-600">ANCHOR</Badge>
                            ) : (
                              <Badge variant="outline" className="h-5 text-[9px] px-1">STABLE</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">{parseFloat(item.ads).toFixed(1)}/d</td>
                          <td className="px-4 py-3 text-right font-bold">{item.recommendedQty}</td>
                          <td className="px-4 py-3 text-right font-mono">₱{item.estimatedCost.toLocaleString()}</td>
                          <td className="px-4 py-3 text-center">
                            {item.allocated ? (
                              <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto" />
                            ) : (
                              <XCircle className="h-5 w-5 text-muted-foreground/30 mx-auto" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="doctor" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                Menu Engineering Matrix
              </CardTitle>
              <CardDescription>Visualizing popularity vs. unit profitability over the last 30 days.</CardDescription>
            </CardHeader>
            <CardContent className="h-[500px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    type="number" 
                    dataKey="total_qty" 
                    name="Volume" 
                    label={{ value: 'Sales Volume (Qty)', position: 'insideBottom', offset: -10 }} 
                  />
                  <YAxis 
                    type="number" 
                    dataKey="avg_unit_profit" 
                    name="Profit" 
                    label={{ value: 'Avg Unit Profit (₱)', angle: -90, position: 'insideLeft' }} 
                  />
                  <ZAxis type="number" dataKey="total_revenue" range={[60, 1000]} name="Impact" />
                  <Tooltip 
                    cursor={{ strokeDasharray: '3 3' }} 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload
                        return (
                          <div className="bg-background border p-3 rounded-lg shadow-lg">
                            <p className="font-bold border-bottom pb-1 mb-1">{data.name}</p>
                            <p className="text-xs">Class: <span className="font-bold text-primary">{data.classification}</span></p>
                            <p className="text-xs">Volume: {data.total_qty} units</p>
                            <p className="text-xs">Unit Profit: ₱{parseFloat(data.avg_unit_profit).toFixed(2)}</p>
                            <p className="text-xs">Total Revenue: ₱{parseFloat(data.total_revenue).toLocaleString()}</p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  {menuData && (
                    <>
                      <ReferenceLine x={menuData.benchmarks.popularity} stroke="#888" strokeDasharray="3 3" />
                      <ReferenceLine y={menuData.benchmarks.profit} stroke="#888" strokeDasharray="3 3" />
                    </>
                  )}
                  <Scatter name="Products" data={menuData?.items || []}>
                    {menuData?.items.map((entry: any, index: number) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={
                          entry.classification === 'STAR' ? '#22c55e' : 
                          entry.classification === 'PLOWHORSE' ? '#eab308' : 
                          entry.classification === 'PUZZLE' ? '#3b82f6' : 
                          '#ef4444'
                        } 
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-green-500">
              <CardHeader className="py-4">
                <CardTitle className="text-sm font-bold text-green-600">STARS</CardTitle>
                <CardDescription className="text-[10px]">High Volume | High Profit</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs font-medium italic">"Protect Quality & Visibility."</p>
                <ul className="text-[10px] text-muted-foreground list-disc pl-4">
                  <li>Do not change recipe/specs</li>
                  <li>Ensure 100% availability</li>
                  <li>Keep prominent on menu/shelves</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-yellow-500">
              <CardHeader className="py-4">
                <CardTitle className="text-sm font-bold text-yellow-600">PLOWHORSES</CardTitle>
                <CardDescription className="text-[10px]">High Volume | Low Profit</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs font-medium italic">"Increase Margin Safely."</p>
                <ul className="text-[10px] text-muted-foreground list-disc pl-4">
                  <li>Increase price slightly</li>
                  <li>Bundle with high-margin items</li>
                  <li>Reduce portion size by 5-10%</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-blue-500">
              <CardHeader className="py-4">
                <CardTitle className="text-sm font-bold text-blue-600">PUZZLES</CardTitle>
                <CardDescription className="text-[10px]">Low Volume | High Profit</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs font-medium italic">"Drive Awareness."</p>
                <ul className="text-[10px] text-muted-foreground list-disc pl-4">
                  <li>Rename to sound more appealing</li>
                  <li>Train staff to upsell/suggest</li>
                  <li>Run a "Try this" promo</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-red-500">
              <CardHeader className="py-4">
                <CardTitle className="text-sm font-bold text-red-600">DOGS</CardTitle>
                <CardDescription className="text-[10px]">Low Volume | Low Profit</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs font-medium italic">"Eliminate Dead Weight."</p>
                <ul className="text-[10px] text-muted-foreground list-disc pl-4">
                  <li>Remove from menu immediately</li>
                  <li>Clear stock with clearance sale</li>
                  <li>Do not restock once sold out</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
