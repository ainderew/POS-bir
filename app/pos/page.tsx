"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ProductSearch } from "@/components/pos/product-search"
import { CategoryFilter } from "@/components/pos/category-filter"
import { ProductGrid } from "@/components/pos/product-grid"
import { WeightDialog } from "@/components/pos/weight-dialog"
import { Cart } from "@/components/pos/cart"
import { SCPWDDialog, type SCPWDData } from "@/components/pos/sc-pwd-dialog"
import { SyncStatus } from "@/components/pos/sync-status"
import { ShiftOpeningDialog } from "@/components/pos/shift-opening-dialog"
import { ShiftClosingDialog } from "@/components/pos/shift-closing-dialog"
import { CashMovementDialog, type CashMovementType } from "@/components/pos/cash-movements-dialog"
import { ManagerAuthDialog } from "@/components/pos/manager-auth-dialog"
import { AuthFlow } from "@/components/auth/auth-flow"
import { Button } from "@/components/ui/button"
import type { Product, CartItem, Shift, User } from "@/lib/types"
import type { AuditCaptureResult } from "@/lib/audit-service"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CreditCard, Grid3x3, Wallet, Banknote, LogOut, Settings } from "lucide-react"
import { useTerminal } from "@/hooks/use-terminal"

import { useCartStore } from "@/stores/use-cart-store"
import { lessVatOf, roundMoney } from "@/lib/ph-tax"

export default function POSPage() {
  const router = useRouter()
  const { terminalId } = useTerminal()
  
  // Global Cart Store
  const { items: cart, addItem, removeItem, updateQuantity, clearCart, refreshProducts, setActiveShift: setStoreShift } = useCartStore()
  
  const [weightProduct, setWeightProduct] = useState<Product | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [refreshKey, setRefreshKey] = useState(0)
  
  // Authentication State
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(null)
  const [authAuditResult, setAuthAuditResult] = useState<AuditCaptureResult | null>(null)
  const [isAuthenticating, setIsAuthenticating] = useState(false)

  // Shift State
  const [activeShift, setActiveShift] = useState<Shift | null>(null)
  const [isOpeningShift, setIsOpeningShift] = useState(false)
  const [isClosingShift, setIsClosingShift] = useState(false)
  const [isCashMovementOpen, setIsCashMovementOpen] = useState(false)

  // Security State
  const [isManagerAuthOpen, setIsManagerAuthOpen] = useState(false)
  const [managerAuthMode, setManagerAuthMode] = useState<"RELOAD" | "QUIT" | "OVERRIDE">("QUIT")

  // SC/PWD State
  const [isSCPWDModalOpen, setIsSCPWDModalOpen] = useState(false)
  const [scPwdData, setScPwdData] = useState<SCPWDData | null>(null)

  useEffect(() => {
    checkActiveShift()

    // Lock in Kiosk Mode
    if (!window.electronAPI) return

    window.electronAPI.setKiosk(true)

    // Register Security Listeners (store cleanup functions)
    const offQuit = window.electronAPI.onRequestQuit(() => {
      setManagerAuthMode("QUIT")
      setIsManagerAuthOpen(true)
    })

    const offReload = window.electronAPI.onRequestReload(() => {
      setManagerAuthMode("RELOAD")
      setIsManagerAuthOpen(true)
    })

    const offEmergency = window.electronAPI.onEmergencyExit(() => {
      setManagerAuthMode("OVERRIDE")
      setIsManagerAuthOpen(true)
    })

    return () => {
      offQuit()
      offReload()
      offEmergency()
    }
  }, [])

  const handleManagerSuccess = async () => {
    if (managerAuthMode === "RELOAD") {
      if (window.electronAPI) await window.electronAPI.reloadApp()
    } else if (managerAuthMode === "QUIT") {
      if (window.electronAPI) await window.electronAPI.forceQuit()
    } else if (managerAuthMode === "OVERRIDE") {
      if (window.electronAPI) await window.electronAPI.setKiosk(false)
      router.push("/")
    }
    setIsManagerAuthOpen(false)
  }

  // Keep the store in sync both ways: the scan handler only accepts scans while a shift is
  // open, so a closed (or not yet verified) shift must clear the persisted one too
  useEffect(() => {
    setStoreShift(activeShift)
  }, [activeShift, setStoreShift])

  const checkActiveShift = async () => {
    // On any failure the gate stays closed: no shift is set and login is not skipped
    const showShiftError = (message?: string) =>
      toast.error(message || "Failed to verify shift status", {
        action: { label: "Retry", onClick: () => checkActiveShift() },
      })

    try {
      const res = await fetch("/api/shifts/current")
      const data = await res.json().catch(() => undefined)
      if (!res.ok || data === undefined) {
        showShiftError(data?.error)
      } else if (data === null) {
        // No active shift - trigger authentication flow
        setIsAuthenticating(true)
      } else if (typeof data === "object" && typeof data.id === "string") {
        setActiveShift(data)
      } else {
        showShiftError()
      }
    } catch (e) {
      showShiftError()
    }
  }

  const handleAuthenticated = (user: User, auditResult?: AuditCaptureResult) => {
    setAuthenticatedUser(user)
    if (auditResult) {
      setAuthAuditResult(auditResult)
    }
    setIsAuthenticating(false)
    setIsOpeningShift(true)
    toast.success(`Welcome, ${user.full_name}!`)
  }

  const handleOpenShift = async (openingFund: number) => {
    if (!authenticatedUser) {
      toast.error("User not authenticated")
      return
    }
    if (!terminalId) {
      toast.error("Terminal configuration missing. Please restart.")
      return
    }
    try {
      const res = await fetch("/api/shifts/current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: authenticatedUser.id,
          terminalId,
          openingFund,
          // Pass the audit result captured during authentication
          auditImage: authAuditResult?.image || null,
          auditMetadata: authAuditResult?.metadata || {}
        })
      })
      const data = await res.json()
      if (res.ok) {
        setActiveShift(data)
        setIsOpeningShift(false)
        toast.success("Shift opened successfully")
      } else {
        toast.error(data.error || "Failed to open shift")
      }
    } catch (e) {
      toast.error("Network error opening shift")
    }
  }

  const handleCloseShift = async (details: { actualCash: number, actualGcash: number, actualMaya: number, actualCard: number }) => {
    try {
      const res = await fetch("/api/shifts/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftId: activeShift?.id, ...details })
      })
      const data = await res.json()
      if (res.ok) {
        setActiveShift(null)
        setIsClosingShift(false)
        setIsOpeningShift(true)
        toast.success("Shift closed successfully. Variance: " + data.variance)
      } else {
        toast.error(data.error || "Failed to close shift")
      }
    } catch (e) {
      toast.error("Network error closing shift")
    }
  }

  const handleCashMovement = async (type: CashMovementType, amount: number, reason: string) => {
    try {
      const res = await fetch("/api/cash-movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftId: activeShift?.id, type, amount, reason })
      })
      if (res.ok) {
        setIsCashMovementOpen(false)
        toast.success("Cash movement recorded")
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to record movement")
      }
    } catch (e) {
      toast.error("Network error recording movement")
    }
  }

  const handleProductSelect = (product: Product) => {
    const stockLevel = Number(product.stock_level)
    if (stockLevel <= 0) {
      toast.error(`${product.name} is out of stock`)
      return
    }

    if (product.unit_type === "WEIGHT") {
      setWeightProduct(product)
    } else {
      addItem(product, 1)
    }
  }

  const handleWeightConfirm = (weight: number) => {
    if (weightProduct) {
      const stockLevel = Number(weightProduct.stock_level)
      if (weight > stockLevel) {
        toast.error(`Only ${stockLevel.toFixed(3)} kg available`)
        return
      }

      addItem(weightProduct, weight)
      setWeightProduct(null)
    }
  }

  // Helper Wrappers for Cart Component
  const handleRemoveItem = (productId: string) => {
    removeItem(productId)
    toast.info("Item removed from cart")
  }

  const handleUpdateQuantity = (productId: string, newQuantity: number) => {
    const item = cart.find((i) => i.product.id === productId)
    if (!item) return

    if (newQuantity <= 0) {
      handleRemoveItem(productId)
      return
    }

    const stockLevel = Number(item.product.stock_level)
    if (newQuantity > stockLevel) {
      toast.error(`Only ${item.product.unit_type === "WEIGHT" ? stockLevel.toFixed(3) + " kg" : stockLevel + " pcs"} available`)
      return
    }

    updateQuantity(productId, newQuantity)
  }

  const handleCheckout = async (paymentMethod: string = "CASH", details?: { amountTendered?: number, referenceNumber?: string }) => {
    if (!activeShift) {
      toast.error("No active shift. Please open a shift first.")
      return
    }

    setIsProcessing(true)
    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart,
          payment_method: paymentMethod,
          scPwdData,
          paxCount: scPwdData?.paxCount || 1,
          seniorCount: scPwdData?.seniorCount || 0,
          amount_tendered: details?.amountTendered,
          reference_number: details?.referenceNumber
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(`Transaction ${data.invoice_number} completed!`)
        
        // Direct Print Bridge. The sale is already recorded: a print problem must not
        // surface as a checkout failure (or keep the cart for a re-ring).
        if (window.electronAPI) {
          try {
            const settingsRes = await fetch("/api/settings")
            const settings = await settingsRes.json()

            if (settings.auto_print === "true") {
              // created_at is zone-less UTC text ("YYYY-MM-DD HH:MM:SS")
              const saleDate = typeof data.created_at === "string"
                ? new Date(data.created_at.replace(" ", "T") + "Z")
                : null

              const printResult = await window.electronAPI.printReceipt({
                type: "sale",
                businessName: settings.business_name,
                address: settings.business_address,
                tin: settings.business_tin,
                invoiceNumber: data.invoice_number,
                date: saleDate && !isNaN(saleDate.getTime()) ? saleDate.toISOString() : undefined,
                cashier: authenticatedUser?.full_name || activeShift?.cashier_name || undefined,
                customerName: data.sc_pwd_name || undefined,
                scPwdId: data.sc_pwd_id || undefined,
                // Lines as recorded by the server, at the price actually charged (e.g. wholesale)
                items: (data.items ?? []).map((i: { name: string, quantity_sold: number, price_at_sale: number }) => ({
                  name: i.name,
                  quantity: i.quantity_sold,
                  unitPrice: i.price_at_sale,
                  lineTotal: roundMoney(i.price_at_sale * i.quantity_sold)
                })),
                subtotal: parseFloat(data.gross_sales),
                lessVat: lessVatOf(data),
                discount: parseFloat(data.total_discount),
                vatableSales: parseFloat(data.vatable_sales),
                vatAmount: parseFloat(data.vat_amount),
                vatExemptSales: parseFloat(data.vat_exempt_sales),
                zeroRatedSales: parseFloat(data.zero_rated_sales),
                total: parseFloat(data.net_sales),
                paymentMethod: data.payment_method,
                referenceNumber: data.reference_number || undefined,
                amountTendered: data.amount_tendered ?? undefined,
                change: data.change_amount ?? undefined
              })
              if (!printResult.success) {
                toast.error("Receipt failed to print: " + (printResult.error || "Unknown error"))
              }
            }
          } catch (printError: any) {
            toast.error("Receipt failed to print: " + (printError?.message || "Unknown error"))
          }
        }

        clearCart()
        setScPwdData(null)
        setRefreshKey(prev => prev + 1)
      } else if (response.status === 409) {
        // Stale cart: nothing was charged. Reload current product data so the cashier can re-check the total.
        if (Array.isArray(data.products)) refreshProducts(data.products)
        toast.error(data.error || "Prices changed — please refresh the cart", {
          description: "Cart reloaded with current prices. Review the total before charging.",
        })
      } else {
        toast.error(data.error || "Transaction failed")
      }
    } catch (error) {
      toast.error("An error occurred during checkout")
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="h-screen bg-background overflow-hidden flex flex-col">
      <div className="container mx-auto py-4 px-4 flex-none">
        <div className="mb-4 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Point of Sale</h1>
            <p className="text-xs text-muted-foreground">BIR Compliant Philippine POS System</p>
          </div>
          <div className="flex items-center gap-3">
            {activeShift && (
              <div className="flex items-center gap-2 mr-4 bg-muted p-1 rounded-lg">
                <Button variant="ghost" size="sm" onClick={() => setIsCashMovementOpen(true)} className="text-xs h-8">
                  <Banknote className="h-4 w-4 mr-1 text-green-600" />
                  Cash In/Out
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setIsClosingShift(true)} className="text-xs h-8 text-destructive hover:text-destructive">
                  <LogOut className="h-4 w-4 mr-1" />
                  End Shift
                </Button>
              </div>
            )}
            <SyncStatus />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 pb-4 flex-1 min-h-0">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
          <div className="lg:col-span-2 space-y-4 overflow-y-auto pr-2 custom-scrollbar">
            <Card>
              <CardContent className="p-4">
                <ProductSearch
                  onProductSelect={handleProductSelect}
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 p-4">
                <CategoryFilter 
                    selectedCategoryId={selectedCategoryId} 
                    onCategorySelect={setSelectedCategoryId} 
                />
                <ProductGrid
                  key={refreshKey}
                  categoryId={selectedCategoryId}
                  searchTerm={searchTerm}
                  onProductSelect={handleProductSelect}
                />
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1 h-full min-h-0">
            <Cart
              items={cart}
              onRemoveItem={handleRemoveItem}
              onUpdateQuantity={handleUpdateQuantity}
              onCheckout={(method, details) => handleCheckout(method, details)}
              isProcessing={isProcessing}
              onApplySCPWD={() => setIsSCPWDModalOpen(true)}
              scPwdData={scPwdData}
              onClearSCPWD={() => setScPwdData(null)}
              shiftId={activeShift?.id}
              cashierId={authenticatedUser?.id}
            />
          </div>
        </div>
      </div>

      <WeightDialog
        product={weightProduct}
        isOpen={weightProduct !== null}
        onConfirm={handleWeightConfirm}
        onCancel={() => setWeightProduct(null)}
      />

      <SCPWDDialog
        isOpen={isSCPWDModalOpen}
        onClose={() => setIsSCPWDModalOpen(false)}
        onConfirm={(data) => {
            setScPwdData(data)
            toast.success(`SC/PWD Discount applied for ${data.name}`)
        }}
      />

      {isAuthenticating && (
        <AuthFlow 
          onAuthenticated={handleAuthenticated} 
          terminalId={terminalId}
        />
      )}

      <ShiftOpeningDialog
        isOpen={isOpeningShift}
        onConfirm={handleOpenShift}
      />

      <ShiftClosingDialog
        isOpen={isClosingShift}
        onClose={() => setIsClosingShift(false)}
        onConfirm={handleCloseShift}
      />

      <CashMovementDialog
        isOpen={isCashMovementOpen}
        onClose={() => setIsCashMovementOpen(false)}
        onConfirm={handleCashMovement}
      />

      <ManagerAuthDialog
        isOpen={isManagerAuthOpen}
        onClose={() => setIsManagerAuthOpen(false)}
        onAuthenticated={handleManagerSuccess}
        title={
          managerAuthMode === "RELOAD" ? "Reload POS Authorization" :
          managerAuthMode === "QUIT" ? "System Shutdown Authorization" :
          "Manager System Override"
        }
        description={
          managerAuthMode === "RELOAD" ? "Enter Manager PIN to refresh the application." :
          managerAuthMode === "QUIT" ? "Enter Manager PIN to safely close the POS system." :
          "Enter Manager PIN to unlock the system and access the main menu."
        }
      />
    </div>
  )
}
