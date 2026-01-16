"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CartItem } from "@/lib/types"

interface QuantityDialogProps {
  isOpen: boolean
  onClose: () => void
  item: CartItem | null
  onConfirm: (quantity: number) => void
}

export function QuantityDialog({ isOpen, onClose, item, onConfirm }: QuantityDialogProps) {
  const [quantity, setQuantity] = useState("")

  useEffect(() => {
    if (isOpen) {
        setQuantity("")
    }
  }, [isOpen])

  const handleConfirm = () => {
    const val = parseFloat(quantity)
    if (!isNaN(val)) {
        onConfirm(val)
    }
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
        e.preventDefault()
        handleConfirm()
    }
  }

  if (!item) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[300px]">
        <DialogHeader>
          <DialogTitle>Update Quantity</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-1">
             <p className="text-sm font-medium leading-none">{item.product.name}</p>
             <p className="text-xs text-muted-foreground">
                Current: {item.quantity} {item.product.unit_type === "WEIGHT" ? "kg" : "pcs"}
             </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="qty-input">New Quantity</Label>
            <Input
              id="qty-input"
              type="number"
              placeholder="Enter quantity"
              className="text-lg font-bold"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              step={item.product.unit_type === "WEIGHT" ? "0.001" : "1"}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConfirm}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
