"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Loader2, Banknote, CreditCard, Wallet, RotateCcw } from "lucide-react"
import { format } from "date-fns"
import type { Transaction, TransactionItem } from "@/lib/types"
import { toast } from "sonner"
import { ManagerOverrideModal } from "@/components/pos/manager-override-modal"
import { printVoidSlip } from "@/lib/printer"

interface TransactionDetailsDialogProps {
  transactionId: string | null
  isOpen: boolean
  onClose: () => void
  onVoidSuccess?: () => void
}

export function TransactionDetailsDialog({ transactionId, isOpen, onClose, onVoidSuccess }: TransactionDetailsDialogProps) {
  const [transaction, setTransaction] = useState<(Transaction & { items: TransactionItem[] }) | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false)

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

  const handleVoidClick = () => {
    setIsVoidModalOpen(true)
  }

  const handleVoidAuthorized = async (authData: { managerId: string, pin: string, reason: string, auditImageBase64: string | null }) => {
    if (!transaction) return

    try {
      const res = await fetch("/api/transactions/void", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalTransactionId: transaction.id,
          ...authData
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Void failed")
      }

      toast.success("Transaction voided successfully")
      
      // Auto-Print Void Slip
      try {
        await printVoidSlip(transaction, data.transaction, authData.managerId, authData.reason) // Ideally pass Manager Name if available, or fetch it
        toast.info("Printing void slip...")
      } catch (printErr) {
        console.error("Print Error", printErr)
        toast.error("Failed to print void slip")
      }

      // Refresh data
      fetchTransactionDetails()
      if (onVoidSuccess) onVoidSuccess()
      
    } catch (error: any) {
      console.error("Void Error", error)
      toast.error(error.message)
    }
  }

  return (
    <>
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
              
              {transaction.status === "PAID" && (
                <DialogFooter>
                    <Button variant="destructive" onClick={handleVoidClick} className="w-full sm:w-auto">
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Void Transaction
                    </Button>
                </DialogFooter>
              )}
              
              {transaction.status === "VOIDED" && (
                 <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
                    <p className="font-bold">Transaction Voided</p>
                    <p>Reason: {transaction.void_reason}</p>
                    <p className="text-xs mt-1 opacity-70">Voided at: {transaction.voided_at ? format(new Date(transaction.voided_at), "MMM d, h:mm a") : 'N/A'}</p>
                 </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      
      <ManagerOverrideModal
        isOpen={isVoidModalOpen}
        onClose={() => setIsVoidModalOpen(false)}
        onAuthorized={handleVoidAuthorized}
        actionType="TRANSACTION_VOID"
        title="Transaction Void Authorization"
        description="Manager authorization is required to void a completed transaction. This action will be audited."
      />
    </>
  )
}
