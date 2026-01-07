"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Loader2, Banknote, CreditCard, Wallet } from "lucide-react"
import { format } from "date-fns"
import type { Transaction, TransactionItem } from "@/lib/types"
import { toast } from "sonner"

interface TransactionDetailsDialogProps {
  transactionId: string | null
  isOpen: boolean
  onClose: () => void
}

export function TransactionDetailsDialog({ transactionId, isOpen, onClose }: TransactionDetailsDialogProps) {
  const [transaction, setTransaction] = useState<(Transaction & { items: TransactionItem[] }) | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (transactionId && isOpen) {
      fetchTransactionDetails()
    }
  }, [transactionId, isOpen])

  const fetchTransactionDetails = async () => {
    if (!transactionId) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/transactions/${transactionId}`)
      const data = await response.json()

      if (response.ok) {
        setTransaction(data)
      } else {
        toast.error("Failed to load transaction details")
      }
    } catch (error) {
      toast.error("An error occurred while loading transaction")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-6">
            <span>Transaction Details</span>
            {transaction && (
              <Badge variant={transaction.status === "VOIDED" ? "destructive" : "default"}>
                {transaction.status}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>View complete transaction information for BIR compliance</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : transaction ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Invoice Number</p>
                <p className="font-bold text-lg">{transaction.invoice_number}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Date & Time</p>
                <p className="font-medium">{format(new Date(transaction.created_at), "MMM d, yyyy h:mm a")}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Payment Method</p>
                <Badge variant="outline" className="mt-1">
                  {transaction.payment_method === "CASH" && <Banknote className="h-3 w-3 mr-1" />}
                  {transaction.payment_method === "GCASH" && <Wallet className="h-3 w-3 mr-1" />}
                  {transaction.payment_method === "CARD" && <CreditCard className="h-3 w-3 mr-1" />}
                  {transaction.payment_method}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground">POS Terminal ID</p>
                <p className="font-mono text-xs">{transaction.pos_id}</p>
              </div>
            </div>

            {transaction.sc_pwd_id && (
              <div className="bg-primary/5 p-3 rounded-lg border border-primary/10">
                <p className="text-xs font-bold text-primary uppercase mb-1">SC/PWD Information</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <p><span className="text-muted-foreground">Name:</span> {transaction.sc_pwd_name}</p>
                  <p><span className="text-muted-foreground">ID Number:</span> {transaction.sc_pwd_id}</p>
                  <p><span className="text-muted-foreground">Pax Count:</span> {transaction.pax_count}</p>
                  <p><span className="text-muted-foreground">Senior Count:</span> {transaction.senior_count}</p>
                </div>
              </div>
            )}

            <Separator />

            <div>
              <h3 className="font-semibold mb-3">Items</h3>
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                {transaction.items.map((item) => (
                  <div key={item.id} className="flex justify-between items-start p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity_sold.toFixed(3)} × ₱{item.price_at_sale.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">₱{(item.price_at_sale * item.quantity_sold).toFixed(2)}</p>
                      <Badge variant="outline" className="text-[10px] h-4">{item.tax_category}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gross Sales</span>
                <span>₱{parseFloat(transaction.gross_sales as any).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vatable Sales</span>
                <span>₱{parseFloat(transaction.vatable_sales as any).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">VAT Amount (12%)</span>
                <span>₱{parseFloat(transaction.vat_amount as any).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">VAT-Exempt Sales</span>
                <span>₱{parseFloat(transaction.vat_exempt_sales as any).toFixed(2)}</span>
              </div>
              {parseFloat(transaction.total_discount as any) > 0 && (
                <div className="flex justify-between text-destructive">
                  <span className="font-medium">Total Discount</span>
                  <span>-₱{parseFloat(transaction.total_discount as any).toFixed(2)}</span>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between text-xl font-bold text-primary">
                <span>Net Amount Due</span>
                <span>₱{parseFloat(transaction.net_sales as any).toFixed(2)}</span>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
