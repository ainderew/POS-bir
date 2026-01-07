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
import { Button } from "@/components/ui/button"
import type { Product, CartItem, Shift } from "@/lib/types"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CreditCard, Grid3x3, Wallet, Banknote, LogOut, Settings } from "lucide-react"

export default function POSPage() {
  const router = useRouter()
  const [cart, setCart] = useState<CartItem[]>([])
  const [weightProduct, setWeightProduct] = useState<Product | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  
  // Shift State
  const [activeShift, setActiveShift] = useState<Shift | null>(null)
  const [isOpeningShift, setIsOpeningShift] = useState(false)
  const [isClosingShift, setIsClosingShift] = useState(false)
  const [isCashMovementOpen, setIsCashMovementOpen] = useState(false)

  // Security State
  const [isManagerAuthOpen, setIsManagerAuthOpen] = useState(false)
  const [managerAuthMode, setManagerAuthMode] = useState<"EXIT" | "RELOAD" | "QUIT" | "OVERRIDE">("EXIT")

  // SC/PWD State
  const [isSCPWDModalOpen, setIsSCPWDModalOpen] = useState(false)
  const [scPwdData, setScPwdData] = useState<SCPWDData | null>(null)

  useEffect(() => {
    checkActiveShift()
    
    // Lock in Kiosk Mode
    if (window.electronAPI) {
      window.electronAPI.setKiosk(true)

      // Register Security Listeners
      window.electronAPI.onRequestQuit(() => {
        setManagerAuthMode("QUIT")
        setIsManagerAuthOpen(true)
      })

      window.electronAPI.onRequestReload(() => {
        setManagerAuthMode("RELOAD")
        setIsManagerAuthOpen(true)
      })

      window.electronAPI.onEmergencyExit(() => {
        setManagerAuthMode("OVERRIDE")
        setIsManagerAuthOpen(true)
      })
    }
  }, [])

  const handleManagerSuccess = async () => {
    if (managerAuthMode === "EXIT") {
      if (window.electronAPI) await window.electronAPI.setKiosk(false)
      router.push("/")
    } else if (managerAuthMode === "RELOAD") {
      if (window.electronAPI) await window.electronAPI.reloadApp()
    } else if (managerAuthMode === "QUIT") {
      if (window.electronAPI) await window.electronAPI.forceQuit()
    } else if (managerAuthMode === "OVERRIDE") {
      if (window.electronAPI) await window.electronAPI.setKiosk(false)
      router.push("/")
    }
    setIsManagerAuthOpen(false)
  }

  const checkActiveShift = async () => {
    try {
      const res = await fetch("/api/shifts/current")
      const data = await res.json()
      if (data) {
        setActiveShift(data)
      } else {
        setIsOpeningShift(true)
      }
    } catch (e) {
      toast.error("Failed to verify shift status")
    }
  }

  const handleOpenShift = async (openingFund: number) => {
    try {
      const res = await fetch("/api/shifts/current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openingFund })
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

  const handleCloseShift = async (actualCash: number) => {
    try {
      const res = await fetch("/api/shifts/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftId: activeShift?.id, actualCash })
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
      addToCart(product, 1)
    }
  }

  const handleWeightConfirm = (weight: number) => {
    if (weightProduct) {
      const stockLevel = Number(weightProduct.stock_level)
      if (weight > stockLevel) {
        toast.error(`Only ${stockLevel.toFixed(3)} kg available`)
        return
      }

      addToCart(weightProduct, weight)
      setWeightProduct(null)
    }
  }

  const addToCart = (product: Product, quantity: number) => {
    const existingItem = cart.find((item) => item.product.id === product.id)
    const stockLevel = Number(product.stock_level)

    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity
      if (newQuantity > stockLevel) {
        toast.error(`Only ${stockLevel} available`)
        return
      }
      setCart(cart.map((item) => (item.product.id === product.id ? { ...item, quantity: newQuantity } : item)))
    } else {
      setCart([...cart, { product, quantity }])
    }
    toast.success(`Added ${product.name} to cart`)
  }

  const handleRemoveItem = (productId: string) => {
    setCart(cart.filter((item) => item.product.id !== productId))
    toast.info("Item removed from cart")
  }

  const handleCheckout = async (paymentMethod: string = "CASH") => {
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
          seniorCount: scPwdData?.seniorCount || 0
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(`Transaction ${data.invoice_number} completed!`)
        
        // Direct Print Bridge
        if (window.electronAPI) {
          const settingsRes = await fetch("/api/settings")
          const settings = await settingsRes.json()
          
          if (settings.auto_print === "true") {
            await window.electronAPI.printReceipt({
              businessName: settings.business_name,
              address: settings.business_address,
              tin: settings.business_tin,
              invoiceNumber: data.invoice_number,
              items: cart.map(i => ({
                name: i.product.name,
                quantity: i.quantity,
                price: i.product.selling_price * i.quantity
              })),
              vatableSales: parseFloat(data.vatable_sales),
              vatAmount: parseFloat(data.vat_amount),
              vatExemptSales: parseFloat(data.vat_exempt_sales),
              total: parseFloat(data.net_sales)
            })
          }
        }

        setCart([])
        setScPwdData(null)
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
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-balance">Point of Sale</h1>
            <p className="text-muted-foreground mt-2">BIR Compliant Philippine POS System</p>
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Product Search
                </CardTitle>
                <CardDescription>Scan barcode or type product name</CardDescription>
              </CardHeader>
              <CardContent>
                <ProductSearch
                  onProductSelect={handleProductSelect}
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Grid3x3 className="h-5 w-5" />
                  Browse Products
                </CardTitle>
                <CardDescription>Filter by category and select products</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <CategoryFilter 
                    selectedCategoryId={selectedCategoryId} 
                    onCategorySelect={setSelectedCategoryId} 
                />
                <ProductGrid
                  categoryId={selectedCategoryId}
                  searchTerm={searchTerm}
                  onProductSelect={handleProductSelect}
                />
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Cart
              items={cart}
              onRemoveItem={handleRemoveItem}
              onCheckout={(method) => handleCheckout(method)}
              isProcessing={isProcessing}
              onApplySCPWD={() => setIsSCPWDModalOpen(true)}
              scPwdData={scPwdData}
              onClearSCPWD={() => setScPwdData(null)}
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
          managerAuthMode === "EXIT" ? "Exit POS Authorization" :
          managerAuthMode === "RELOAD" ? "Reload POS Authorization" :
          managerAuthMode === "QUIT" ? "System Shutdown Authorization" :
          "Manager System Override"
        }
        description={
          managerAuthMode === "EXIT" ? "Enter Manager PIN to access Dashboard and Inventory." :
          managerAuthMode === "RELOAD" ? "Enter Manager PIN to refresh the application." :
          managerAuthMode === "QUIT" ? "Enter Manager PIN to safely close the POS system." :
          "Enter Manager PIN to unlock the system and access the main menu."
        }
      />
    </div>
  )
}
