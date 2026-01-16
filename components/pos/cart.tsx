"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Trash2, ShoppingCart, Loader2, UserCheck, X, Banknote, CreditCard, Wallet, CheckCircle2, Smartphone, Hand, FileText, UserPlus, Users } from "lucide-react"
import type { CartItem, Customer } from "@/lib/types"
import { calculateTransactionTotals } from "@/lib/ph-tax"
import { Badge } from "@/components/ui/badge"
import type { SCPWDData } from "./sc-pwd-dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { ManagerOverrideModal } from "./manager-override-modal"
import { CustomerSelectDialog } from "./customer-select-dialog"
import { QuantityDialog } from "./quantity-dialog"
import { toast } from "sonner"

interface CartProps {
  items: CartItem[]
  onRemoveItem: (productId: string) => void
  onUpdateQuantity: (productId: string, quantity: number) => void
  onCheckout: (paymentMethod: string, details?: { amountTendered?: number, referenceNumber?: string }) => void
  isProcessing: boolean
  onApplySCPWD: () => void
  scPwdData: SCPWDData | null
  onClearSCPWD: () => void
  shiftId?: string
  cashierId?: string
}

export function Cart({ 
    items, 
    onRemoveItem, 
    onUpdateQuantity,
    onCheckout, 
    isProcessing,
    onApplySCPWD,
    scPwdData,
    onClearSCPWD,
    shiftId,
    cashierId
}: CartProps) {
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH")
  const [amountTendered, setAmountTendered] = useState<string>("")
  const [referenceNumber, setReferenceNumber] = useState<string>("")
  
  // Customer Selection State
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false)
  
  // Quick Quantity Modal State
  const [isQtyModalOpen, setIsQtyModalOpen] = useState(false)
  const [qtyItem, setQtyItem] = useState<CartItem | null>(null)

  // Void / Manager Override State
  const [itemToVoid, setItemToVoid] = useState<CartItem | null>(null)
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false)
  const [isClearingCart, setIsClearingCart] = useState(false)

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
        : (paymentMethod === "STORE_CREDIT" ? referenceNumber.length < 1 : false)
  )

  useEffect(() => {
    setAmountTendered("")
    // If we have a selected customer and switch to Store Credit, auto-fill ID
    if (paymentMethod === "STORE_CREDIT" && selectedCustomer) {
        setReferenceNumber(selectedCustomer.id)
    } else {
        setReferenceNumber("")
    }
  }, [paymentMethod, selectedCustomer])

  // Clear customer when transaction is done (simplistic approach, ideally parent resets)
  useEffect(() => {
     if (items.length === 0) {
         setSelectedCustomer(null)
     }
  }, [items.length])

  // Listen for F2 shortcut and 'q' for quantity
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        // Ignore if typing in an input
        if (
            document.activeElement instanceof HTMLInputElement ||
            document.activeElement instanceof HTMLTextAreaElement
        ) {
            return
        }

        if (e.key === "F2") {
            e.preventDefault()
            setIsCustomerModalOpen(true)
        }

        if (e.key === "q" || e.key === "Q") {
            e.preventDefault()
            if (items.length > 0) {
                // Select the last item added
                const lastItem = items[items.length - 1]
                setQtyItem(lastItem)
                setIsQtyModalOpen(true)
            }
        }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [items]) // Re-bind when items change so we get the latest list

  // --- VOID LOGIC ---

  const initiateRemoveItem = (item: CartItem) => {
    setItemToVoid(item)
    setIsClearingCart(false)
    setIsVoidModalOpen(true)
  }

  const initiateClearCart = () => {
    if (items.length === 0) return
    setItemToVoid(null)
    setIsClearingCart(true)
    setIsVoidModalOpen(true)
  }

  const handleManagerAuthorized = async (authData: { managerId: string, pin: string, reason: string, auditImageBase64: string | null }) => {
    try {
      // 1. Log the Void to Backend
      const res = await fetch("/api/auth/validate-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...authData,
          actionType: "LINE_VOID",
          shiftId,
          cashierId,
          itemDetails: isClearingCart 
            ? { action: "CLEAR_CART", itemCount: items.length, total: totals.netSales } 
            : { action: "REMOVE_ITEM", ...itemToVoid?.product, quantityRemoved: itemToVoid?.quantity }
        })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Void authorization failed")
      }

      // 2. Perform UI Action
      if (isClearingCart) {
        // Clear all items - we need to remove them one by one or expose a clear function
        // For now, we iterate (simplest integration without changing parent interface too much)
        // Ideally parent should expose onClearCart
        items.forEach(item => onRemoveItem(item.product.id))
        toast.success("Cart cleared")
      } else if (itemToVoid) {
        onRemoveItem(itemToVoid.product.id)
        toast.success("Item voided successfully")
      }
      
    } catch (error: any) {
      console.error("Void Error", error)
      toast.error(error.message)
      throw error // Re-throw so modal stays open or handles it
    }
  }

  // Hold Transaction Stub (Workflow A Option 2)
  const handleHoldTransaction = () => {
    toast.info("Hold Transaction feature coming soon")
    // In a real implementation, we would save the cart state to a separate list/db
    // and clear the current cart for the next customer.
  }

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3 text-workspace-foreground">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Cart ({items.length})
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setIsCustomerModalOpen(true)} className="text-xs h-8 px-2" title="Select Customer (F2)">
                  <Users className="h-4 w-4 mr-1" />
                  {selectedCustomer ? (
                      <span className="font-bold truncate max-w-[100px]">{selectedCustomer.full_name}</span>
                  ) : (
                      <span className="text-muted-foreground">Walk-in</span>
                  )}
              </Button>
              {items.length > 0 && (
                 <Button size="sm" variant="outline" onClick={initiateClearCart} className="text-xs h-8 text-destructive border-destructive/30 hover:bg-destructive/10">
                   <Trash2 className="h-3.5 w-3.5 mr-1" />
                   Clear
                 </Button>
              )}
              {items.length > 0 && !scPwdData && (
                <Button size="sm" variant="outline" onClick={onApplySCPWD} className="text-xs h-8">
                  <UserCheck className="h-3.5 w-3.5 mr-1" />
                  SC/PWD
                </Button>
              )}
            </div>
          </CardTitle>
          
          {selectedCustomer && (
              <div className="flex items-center justify-between bg-muted/50 p-2 rounded-md mt-2 border border-dashed">
                  <div className="text-xs">
                      <p className="font-bold">{selectedCustomer.full_name}</p>
                      <p className={cn(
                          "font-mono font-bold",
                          selectedCustomer.current_debt_balance > 0 ? "text-red-600" : "text-green-600"
                      )}>
                          Balance: ₱{selectedCustomer.current_debt_balance.toFixed(2)}
                      </p>
                  </div>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" onClick={() => setSelectedCustomer(null)}>
                      <X className="h-3 w-3" />
                  </Button>
              </div>
          )}

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
                          onClick={() => initiateRemoveItem(item)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center border rounded-md overflow-hidden h-8 bg-background">
                        <button 
                          className="px-2.5 h-full bg-muted hover:bg-accent text-muted-foreground transition-colors"
                          onClick={() => {
                            const step = item.product.unit_type === "WEIGHT" ? 0.1 : 1
                            const newQuantity = item.quantity - step
                            if (newQuantity <= 0) {
                              initiateRemoveItem(item)
                            } else {
                              onUpdateQuantity(item.product.id, newQuantity)
                            }
                          }}
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
                            if (!isNaN(val)) {
                              if (val <= 0) {
                                initiateRemoveItem(item)
                              } else {
                                onUpdateQuantity(item.product.id, val)
                              }
                            }
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
                  <ToggleGroupItem value="STORE_CREDIT" className="flex-1 gap-2 h-10 px-3 data-[state=on]:bg-orange-600 data-[state=on]:text-white">
                    <FileText className="h-4 w-4" />
                    Credit
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
                ) : paymentMethod === "STORE_CREDIT" ? (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                       <Label htmlFor="cust-id" className="text-xs font-bold uppercase">
                         Customer ID
                       </Label>
                    </div>
                    <Input 
                      id="cust-id"
                      placeholder="Enter Customer UUID"
                      className="text-lg font-bold h-12"
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                    />
                    <p className="text-[10px] font-medium text-muted-foreground uppercase italic">
                      Enter the Customer ID to charge to their account.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                       <Label htmlFor="refno" className="text-xs font-bold uppercase">
                         {paymentMethod} Ref No.
                       </Label>
                       <Button size="sm" variant="outline" className="h-5 text-[10px]" onClick={handleHoldTransaction}>
                          <Hand className="h-3 w-3 mr-1" />
                          Hold Tx
                       </Button>
                    </div>
                    <Input 
                      id="refno"
                      placeholder="Enter last 4 digits"
                      className="text-lg font-bold h-12"
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      maxLength={16}
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
            
            <div className="flex w-full gap-2">
                {items.length > 0 && (
                    <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-16 w-16"
                        onClick={handleHoldTransaction}
                        title="Hold Transaction"
                    >
                        <Hand className="h-6 w-6" />
                    </Button>
                )}
                <Button 
                  className="flex-1 h-16 text-lg font-black" 
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
                          <span>FINISH {paymentMethod}</span>
                      </div>
                  )}
                </Button>
            </div>
          </CardFooter>
        )}
      </Card>

      <ManagerOverrideModal
        isOpen={isVoidModalOpen}
        onClose={() => setIsVoidModalOpen(false)}
        onAuthorized={handleManagerAuthorized}
        actionType="LINE_VOID"
        title={isClearingCart ? "Clear Cart Authorization" : "Line Void Authorization"}
        description={isClearingCart 
            ? "Manager authorization is required to clear the entire cart."
            : `Manager authorization is required to remove ${itemToVoid?.product.name || "item"}.`
        }
      />
      
      <CustomerSelectDialog 
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        onSelect={(c) => {
            setSelectedCustomer(c)
            // If they are paying by credit, update the ref number immediately
            if (paymentMethod === "STORE_CREDIT") {
                setReferenceNumber(c.id)
            }
        }}
      />
      
      <QuantityDialog
        isOpen={isQtyModalOpen}
        onClose={() => setIsQtyModalOpen(false)}
        item={qtyItem}
        onConfirm={(qty) => {
            if (qtyItem) {
                if (qty <= 0) {
                    initiateRemoveItem(qtyItem)
                } else {
                    onUpdateQuantity(qtyItem.product.id, qty)
                }
            }
        }}
      />
    </>
  )
}
