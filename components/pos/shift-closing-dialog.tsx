"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Wallet, Loader2 } from "lucide-react"

interface ShiftClosingDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (total: number) => void
}

const DENOMINATIONS = [
  { label: "₱1,000", value: 1000 },
  { label: "₱500", value: 500 },
  { label: "₱200", value: 200 },
  { label: "₱100", value: 100 },
  { label: "₱50", value: 50 },
  { label: "₱20", value: 20 },
  { label: "₱10", value: 10 },
  { label: "₱5", value: 5 },
  { label: "₱1", value: 1 },
  { label: "Coins", value: 1, isMisc: true },
]

export function ShiftClosingDialog({ isOpen, onClose, onConfirm }: ShiftClosingDialogProps) {
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setCounts({})
      setIsSubmitting(false)
    }
  }, [isOpen])

  const calculateTotal = () => {
    return DENOMINATIONS.reduce((sum, d) => {
      const count = parseFloat(counts[d.label] || "0")
      return sum + (count * d.value)
    }, 0)
  }

  const handleConfirm = async () => {
    setIsSubmitting(true)
    try {
      await onConfirm(calculateTotal())
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            End Shift - Blind Cash Count
          </DialogTitle>
          <DialogDescription>
            Count all physical cash in the drawer. Do not include Credit Card or GCash receipts.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-4">
          {DENOMINATIONS.map((d) => (
            <div key={d.label} className="flex items-center gap-2">
              <Label className="w-16 text-right text-xs">{d.label}</Label>
              <Input
                type="number"
                min={0}
                placeholder="0"
                className="h-8"
                value={counts[d.label] || ""}
                onChange={(e) => setCounts({ ...counts, [d.label]: e.target.value })}
              />
            </div>
          ))}
        </div>

        <Separator />
        
        <div className="flex justify-between items-center py-4 px-2 bg-muted/50 rounded-lg">
          <span className="font-bold">Total Cash Counted:</span>
          <span className="text-xl font-mono font-bold text-primary">
            ₱ {calculateTotal().toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Finalize & Close Shift
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
