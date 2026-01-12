"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye, ExternalLink } from "lucide-react"
import { format } from "date-fns"
import type { Transaction } from "@/lib/types"
import { cn } from "@/lib/utils"

interface TransactionsTableProps {
  transactions: (Transaction & { item_count?: number })[]
  onViewDetails: (id: string) => void
  onViewRef?: (invoiceNumber: string) => void
}

export function TransactionsTable({ transactions, onViewDetails, onViewRef }: TransactionsTableProps) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice #</TableHead>
            <TableHead>Date & Time</TableHead>
            <TableHead className="text-center">Items</TableHead>
            <TableHead>Payment Method</TableHead>
            <TableHead className="text-right">Total (₱)</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                No transactions found
              </TableCell>
            </TableRow>
          ) : (
            transactions.map((transaction) => {
              const isReversal = transaction.net_sales < 0 || transaction.status === 'REFUND'
              const originalInvoice = isReversal ? transaction.reference_number : null
              
              return (
                <TableRow 
                  key={transaction.id}
                  className={cn(isReversal && "bg-destructive/10 hover:bg-destructive/20")}
                >
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-bold">{transaction.invoice_number}</span>
                      {originalInvoice && onViewRef && (
                         <button 
                            onClick={(e) => {
                                e.stopPropagation()
                                onViewRef(originalInvoice)
                            }}
                            className="text-[10px] text-muted-foreground hover:text-primary hover:underline flex items-center gap-1 w-fit"
                         >
                            Ref: {originalInvoice}
                            <ExternalLink className="h-3 w-3" />
                         </button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{format(new Date(transaction.created_at), "MMM d, yyyy h:mm a")}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{transaction.item_count || 0}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{transaction.payment_method}</Badge>
                  </TableCell>
                  <TableCell className={cn("text-right font-medium", isReversal && "text-destructive")}>
                    ₱{transaction.net_sales.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={
                      transaction.status === "VOIDED" ? "destructive" : 
                      transaction.status === "REFUND" ? "outline" : 
                      "default"
                    }>
                      {transaction.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => onViewDetails(transaction.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}
