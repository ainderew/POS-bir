"use client"

import { useEffect, useState, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useInventoryStore } from "@/stores/use-inventory-store"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

interface QuickRestockModalProps {
  onSuccess?: () => void
}

export function QuickRestockModal({ onSuccess }: QuickRestockModalProps) {
  const { isRestockModalOpen, activeProduct, closeModals } = useInventoryStore()
  const [addQty, setAddQty] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isRestockModalOpen) {
        setAddQty("")
        // Tiny delay to ensure modal is rendered before focus
        setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isRestockModalOpen])

  const handleRestock = async () => {
    if (!activeProduct || !addQty) return
    const qty = parseFloat(addQty)
    if (isNaN(qty) || qty <= 0) {
        toast.error("Invalid quantity")
        return
    }

    setIsSubmitting(true)
    try {
        const res = await fetch(`/api/products/${activeProduct.id}/stock`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ adjustment: qty, reason: "Quick Restock (Scan)" })
        })

        if (res.ok) {
            toast.success(`Stock updated for ${activeProduct.name}`)
            closeModals()
            if (onSuccess) onSuccess()
        } else {
            toast.error("Failed to update stock")
        }
    } catch (e) {
        toast.error("Network error")
    } finally {
        setIsSubmitting(false)
    }
  }

  const currentStock = Number(activeProduct?.stock_level || 0)
  const newTotal = currentStock + (parseFloat(addQty) || 0)

  return (
    <Dialog open={isRestockModalOpen} onOpenChange={(open) => !open && closeModals()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Quick Restock</DialogTitle>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
            <div>
                <h3 className="text-lg font-bold">{activeProduct?.name}</h3>
                <p className="text-sm text-muted-foreground">Current Stock: {currentStock} {activeProduct?.unit_type === 'WEIGHT' ? 'kg' : 'pcs'}</p>
            </div>

            <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">Add Quantity (+)</Label>
                <Input 
                    ref={inputRef}
                    className="text-3xl h-16 font-black text-center" 
                    placeholder="0"
                    value={addQty}
                    onChange={e => setAddQty(e.target.value)}
                    type="number"
                    onKeyDown={e => e.key === "Enter" && handleRestock()}
                />
            </div>

            <div className="bg-muted p-3 rounded-lg text-center">
                <span className="text-sm text-muted-foreground">New Total: </span>
                <span className="text-lg font-bold text-primary">{newTotal}</span>
            </div>
        </div>

        <DialogFooter>
            <Button variant="outline" onClick={closeModals}>Cancel</Button>
            <Button onClick={handleRestock} disabled={isSubmitting || !addQty}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Restock
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
