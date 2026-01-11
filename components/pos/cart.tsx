"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Trash2, ShoppingCart, Loader2, UserCheck, X, Banknote, CreditCard, Wallet, CheckCircle2, Smartphone } from "lucide-react"
import type { CartItem } from "@/lib/types"
import { calculateTransactionTotals } from "@/lib/ph-tax"
import { Badge } from "@/components/ui/badge"
import type { SCPWDData } from "./sc-pwd-dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface CartProps {
  items: CartItem[]
  onRemoveItem: (productId: string) => void
  onUpdateQuantity: (productId: string, quantity: number) => void
  onCheckout: (paymentMethod: string, details?: { amountTendered?: number, referenceNumber?: string }) => void
  isProcessing: boolean
  onApplySCPWD: () => void
  scPwdData: SCPWDData | null
  onClearSCPWD: () => void
}

export function Cart({ 
    items, 
    onRemoveItem, 
    onUpdateQuantity,
    onCheckout, 
    isProcessing,
    onApplySCPWD,
    scPwdData,
    onClearSCPWD
}: CartProps) {
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH")
  const [amountTendered, setAmountTendered] = useState<string>("")
  const [referenceNumber, setReferenceNumber] = useState<string>("")
  
  const totals = calculateTransactionTotals(
    items, 
    scPwdData?.paxCount || 1, 
    scPwdData?.seniorCount || 0
  )

  const changeAmount = paymentMethod === "CASH" && amountTendered 
    ? parseFloat(amountTendered) - totals.netSales 
    : 0

  const isCheckoutDisabled = isProcessing || items.length === 0 || (
    paymentMethod === "CASH" 
      ? (!amountTendered || parseFloat(amountTendered) < totals.netSales)
      : (paymentMethod === "GCASH" || paymentMethod === "MAYA" || paymentMethod === "CARD")
        ? (referenceNumber.length < 4)
        : false
  )

  useEffect(() => {
    setAmountTendered("")
    setReferenceNumber("")
  }, [paymentMethod])

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 text-workspace-foreground">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Cart ({items.length})
          </div>
          {items.length > 0 && !scPwdData && (
            <Button size="sm" variant="outline" onClick={onApplySCPWD} className="text-xs h-8">
              <UserCheck className="h-3.5 w-3.5 mr-1" />
              SC/PWD
            </Button>
          )}
        </CardTitle>
        {scPwdData && (
          <div className="flex items-center justify-between bg-primary/10 p-2 rounded-md mt-2">
            <div className="text-xs">
              <p className="font-bold text-primary">{scPwdData.type}: {scPwdData.name}</p>
              <p className="text-muted-foreground">{scPwdData.paxCount} Pax | {scPwdData.seniorCount} Senior</p>
            </div>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onClearSCPWD}>
                <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <ShoppingCart className="h-12 w-12 mb-4 opacity-50" />
            <p>Cart is empty</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.product.id} className="flex items-start gap-3 p-2 border rounded-lg group relative bg-workspace/30">
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <h3 className="font-medium text-sm truncate pr-10 uppercase">{item.product.name}</h3>
                    <Button 
                        size="icon" 
                        variant="ghost" 
                        className="absolute top-1 right-1 h-8 w-8 text-destructive hover:bg-destructive/10" 
                        onClick={() => onRemoveItem(item.product.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex items-center border rounded-md overflow-hidden h-8 bg-background">
                      <button 
                        className="px-2.5 h-full bg-muted hover:bg-accent text-muted-foreground transition-colors"
                        onClick={() => onUpdateQuantity(item.product.id, item.quantity - (item.product.unit_type === "WEIGHT" ? 0.1 : 1))}
                      >
                        -
                      </button>
                      <input
                        type="number"
                        className="w-14 text-center text-sm font-bold focus:outline-none bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={item.quantity}
                        step={item.product.unit_type === "WEIGHT" ? "0.001" : "1"}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value)
                          if (!isNaN(val)) onUpdateQuantity(item.product.id, val)
                        }}
                      />
                      <button 
                        className="px-2.5 h-full bg-muted hover:bg-accent text-muted-foreground transition-colors"
                        onClick={() => onUpdateQuantity(item.product.id, item.quantity + (item.product.unit_type === "WEIGHT" ? 0.1 : 1))}
                      >
                        +
                      </button>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                        {item.product.unit_type === "WEIGHT" ? "kg" : "pcs"} @ ₱{Number(item.product.selling_price).toFixed(2)}
                      </span>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-[9px] h-3.5 px-1 leading-none">{item.product.tax_category.replace('_', ' ')}</Badge>
                        {item.quantity > item.product.stock_level && (
                          <Badge variant="destructive" className="text-[9px] h-3.5 px-1 leading-none">OVERSTOCK</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-1 font-bold text-sm text-primary">₱{(Number(item.product.selling_price) * Number(item.quantity)).toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {items.length > 0 && (
        <CardFooter className="flex-col gap-3 pt-4 bg-muted/30 border-t">
          {/* Dual Screen Confirmation Visual */}
          <div className={cn(
            "w-full p-3 rounded-lg border-2 text-center animate-in fade-in zoom-in duration-300",
            paymentMethod === "CASH" ? "bg-green-500/10 border-green-500" :
            paymentMethod === "GCASH" ? "bg-blue-500/10 border-blue-500" :
            paymentMethod === "MAYA" ? "bg-emerald-500/10 border-emerald-500" :
            "bg-primary/10 border-primary"
          )}>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Customer Audit Screen</p>
            <p className="text-lg font-black tracking-tight">
              PAYING VIA {paymentMethod}: ₱{totals.netSales.toFixed(2)}
            </p>
          </div>

          <div className="w-full space-y-4">
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Payment Method</span>
              <ToggleGroup 
                type="single" 
                value={paymentMethod} 
                onValueChange={(v) => v && setPaymentMethod(v)}
                className="justify-start gap-2 flex-wrap"
              >
                <ToggleGroupItem value="CASH" className="flex-1 gap-2 h-10 px-3 data-[state=on]:bg-green-600 data-[state=on]:text-white">
                  <Banknote className="h-4 w-4" />
                  Cash
                </ToggleGroupItem>
                <ToggleGroupItem value="GCASH" className="flex-1 gap-2 h-10 px-3 data-[state=on]:bg-blue-600 data-[state=on]:text-white">
                  <Wallet className="h-4 w-4" />
                  GCash
                </ToggleGroupItem>
                <ToggleGroupItem value="MAYA" className="flex-1 gap-2 h-10 px-3 data-[state=on]:bg-emerald-600 data-[state=on]:text-white">
                  <Smartphone className="h-4 w-4" />
                  Maya
                </ToggleGroupItem>
                <ToggleGroupItem value="CARD" className="flex-1 gap-2 h-10 px-3 data-[state=on]:bg-slate-700 data-[state=on]:text-white">
                  <CreditCard className="h-4 w-4" />
                  Card
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* Validation Gates */}
            <div className="space-y-3 p-3 bg-background rounded-lg border shadow-inner">
              {paymentMethod === "CASH" ? (
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="tendered" className="text-xs font-bold uppercase">Amount Tendered</Label>
                      <Button 
                        type="button" 
                        variant="secondary" 
                        size="sm" 
                        className="h-5 px-1.5 text-[9px] uppercase font-bold bg-green-600 text-white hover:bg-green-700"
                        onClick={() => setAmountTendered(totals.netSales.toFixed(2))}
                      >
                        Exact Amount
                      </Button>
                    </div>
                    {changeAmount >= 0 && (
                      <span className="text-xs font-bold text-green-600">Change: ₱{changeAmount.toFixed(2)}</span>
                    )}
                  </div>
                  <Input 
                    id="tendered"
                    type="number"
                    placeholder="Enter amount given by customer"
                    className="text-lg font-bold h-12"
                    value={amountTendered}
                    onChange={(e) => setAmountTendered(e.target.value)}
                    autoFocus
                  />
                  <div className="grid grid-cols-4 gap-1.5">
                    {[20, 50, 100, 200, 500, 1000].map((num) => (
                      <Button
                        key={num}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px] font-bold"
                        onClick={() => setAmountTendered(num.toString())}
                      >
                        ₱{num}
                      </Button>
                    ))}
                  </div>
                  {amountTendered && parseFloat(amountTendered) < totals.netSales && (
                    <p className="text-[10px] font-bold text-destructive uppercase">Insufficient amount</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="refno" className="text-xs font-bold uppercase">
                    {paymentMethod} Reference Number / Approval Code
                  </Label>
                  <Input 
                    id="refno"
                    placeholder="Enter last 4 digits"
                    className="text-lg font-bold h-12"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    maxLength={16}
                    autoFocus
                  />
                  <p className="text-[10px] font-medium text-muted-foreground uppercase italic">
                    Verify this on the store phone or terminal before proceeding.
                  </p>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal (Net of VAT)</span>
                <span>₱{totals.vatableSales.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">VAT Amount (12%)</span>
                <span>₱{totals.vatAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">VAT-Exempt Sales</span>
                <span>₱{totals.vatExemptSales.toFixed(2)}</span>
              </div>
              {totals.totalDiscount > 0 && (
                <div className="flex justify-between text-destructive font-medium">
                  <span>SC/PWD Discount (20%)</span>
                  <span>-₱{totals.totalDiscount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-black pt-1">
                <span>TOTAL DUE</span>
                <span>₱{totals.netSales.toFixed(2)}</span>
              </div>
            </div>
          </div>
          <Button 
            className="w-full h-16 text-lg font-black" 
            variant={isCheckoutDisabled ? "outline" : "success"}
            size="lg" 
            onClick={() => onCheckout(paymentMethod, {
              amountTendered: amountTendered ? parseFloat(amountTendered) : undefined,
              referenceNumber: referenceNumber || undefined
            })} 
            disabled={isCheckoutDisabled}
          >
            {isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-6 w-6" />
                    <span>FINISH {paymentMethod} TRANSACTION</span>
                </div>
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
