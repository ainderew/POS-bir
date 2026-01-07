"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Trash2, ShoppingCart, Loader2, UserCheck, X, Banknote, CreditCard, Wallet } from "lucide-react"
import type { CartItem } from "@/lib/types"
import { calculateTransactionTotals } from "@/lib/ph-tax"
import { Badge } from "@/components/ui/badge"
import type { SCPWDData } from "./sc-pwd-dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

interface CartProps {
  items: CartItem[]
  onRemoveItem: (productId: string) => void
  onCheckout: (paymentMethod: string) => void
  isProcessing: boolean
  onApplySCPWD: () => void
  scPwdData: SCPWDData | null
  onClearSCPWD: () => void
}

export function Cart({ 
    items, 
    onRemoveItem, 
    onCheckout, 
    isProcessing,
    onApplySCPWD,
    scPwdData,
    onClearSCPWD
}: CartProps) {
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH")
  
  const totals = calculateTransactionTotals(
    items, 
    scPwdData?.paxCount || 1, 
    scPwdData?.seniorCount || 0
  )

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
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
              <div key={item.product.id} className="flex items-start gap-3 p-2 border rounded-lg group relative">
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <h3 className="font-medium text-sm truncate pr-6">{item.product.name}</h3>
                    <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-6 w-6 absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity" 
                        onClick={() => onRemoveItem(item.product.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <span>{Number(item.quantity).toFixed(item.product.unit_type === "WEIGHT" ? 3 : 0)} {item.product.unit_type === "WEIGHT" ? "kg" : "pcs"}</span>
                    <span>@ ₱{Number(item.product.selling_price).toFixed(2)}</span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1">{item.product.tax_category.charAt(0)}</Badge>
                  </div>
                  <div className="mt-1 font-bold text-sm">₱{(Number(item.product.selling_price) * Number(item.quantity)).toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {items.length > 0 && (
        <CardFooter className="flex-col gap-3 pt-4 bg-muted/30">
          <div className="w-full space-y-3">
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Payment Method</span>
              <ToggleGroup 
                type="single" 
                value={paymentMethod} 
                onValueChange={(v) => v && setPaymentMethod(v)}
                className="justify-start gap-2"
              >
                <ToggleGroupItem value="CASH" className="flex-1 gap-2 h-9 px-3">
                  <Banknote className="h-4 w-4" />
                  Cash
                </ToggleGroupItem>
                <ToggleGroupItem value="GCASH" className="flex-1 gap-2 h-9 px-3">
                  <Wallet className="h-4 w-4" />
                  GCash
                </ToggleGroupItem>
                <ToggleGroupItem value="CARD" className="flex-1 gap-2 h-9 px-3">
                  <CreditCard className="h-4 w-4" />
                  Card
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <Separator />

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vatable Sales</span>
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
              {totals.zeroRatedSales > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Zero-Rated Sales</span>
                  <span>₱{totals.zeroRatedSales.toFixed(2)}</span>
                </div>
              )}
              {totals.totalDiscount > 0 && (
                <div className="flex justify-between text-destructive font-medium">
                  <span>SC/PWD Discount (20%)</span>
                  <span>-₱{totals.totalDiscount.toFixed(2)}</span>
                </div>
              )}
              <Separator className="my-1" />
              <div className="flex justify-between text-base font-bold">
                <span>Total Due</span>
                <span>₱{totals.netSales.toFixed(2)}</span>
              </div>
            </div>
          </div>
          <Button className="w-full" size="lg" onClick={() => onCheckout(paymentMethod)} disabled={isProcessing}>
            {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : `Complete ${paymentMethod} Sale`}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
