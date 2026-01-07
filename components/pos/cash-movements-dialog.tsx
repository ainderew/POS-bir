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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Banknote, Loader2 } from "lucide-react"

export type CashMovementType = "CASH_IN" | "CASH_OUT" | "SAFE_DROP"

interface CashMovementDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (type: CashMovementType, amount: number, reason: string) => void
}

export function CashMovementDialog({ isOpen, onClose, onConfirm }: CashMovementDialogProps) {
  const [type, setType] = useState<CashMovementType>("CASH_OUT")
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setIsLoading(false)
      setAmount("")
      setReason("")
      setType("CASH_OUT")
    }
  }, [isOpen])

  const handleConfirm = async () => {
    setIsLoading(true)
    try {
      await onConfirm(type, parseFloat(amount) || 0, reason)
      setAmount("")
      setReason("")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            Cash Management
          </DialogTitle>
          <DialogDescription>
            Record non-sale cash movements in the drawer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="type">Movement Type</Label>
            <Select value={type} onValueChange={(v: CashMovementType) => setType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH_OUT">Cash Out (Expense)</SelectItem>
                <SelectItem value="CASH_IN">Cash In (Change Fund)</SelectItem>
                <SelectItem value="SAFE_DROP">Safe Drop (Remittance)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount (₱)</Label>
            <Input
              id="amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason / Description</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Bought ice, Delivery fee, etc."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!amount || !reason || isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Record Movement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
