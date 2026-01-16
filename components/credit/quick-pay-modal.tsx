"use client"

import { useState } from "react"
import { CustomerCreditSummary } from "@/lib/credit-types"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

interface QuickPayModalProps {
  customer: CustomerCreditSummary | null
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function QuickPayModal({ customer, open, onClose, onSuccess }: QuickPayModalProps) {
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState("CASH")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handlePay = async () => {
      if (!customer || !amount) return
      setIsSubmitting(true)
      try {
          const res = await fetch("/api/customers/payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                  customerId: customer.id,
                  amount: parseFloat(amount),
                  paymentMethod: method,
                  notes: "Quick Pay from Dashboard"
              })
          })
          
          if (!res.ok) throw new Error("Payment failed")
          
          toast.success("Payment recorded")
          setAmount("")
          onSuccess() // Refresh parent
      } catch (error) {
          toast.error("Failed to record payment")
      } finally {
          setIsSubmitting(false)
      }
  }

  if (!customer) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Quick Payment</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
             <div className="text-sm font-medium text-muted-foreground">Paying for</div>
             <div className="text-lg font-bold">{customer.full_name}</div>
             <div className="text-sm text-red-600">Current Balance: ₱{customer.current_debt_balance.toLocaleString()}</div>
          </div>
          
          <div className="space-y-2">
            <Label>Amount</Label>
            <Input 
                type="number" 
                placeholder="0.00" 
                className="text-lg font-bold" 
                value={amount}
                onChange={e => setAmount(e.target.value)}
                autoFocus
            />
          </div>
          
          <div className="space-y-2">
            <Label>Method</Label>
            <ToggleGroup type="single" value={method} onValueChange={v => v && setMethod(v)} className="justify-start">
                <ToggleGroupItem value="CASH" className="flex-1">Cash</ToggleGroupItem>
                <ToggleGroupItem value="GCASH" className="flex-1">GCash</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        <DialogFooter>
           <Button variant="outline" onClick={onClose}>Cancel</Button>
           <Button onClick={handlePay} disabled={isSubmitting || !amount}>
               {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
               Confirm Payment
           </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
