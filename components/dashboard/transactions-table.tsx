"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye } from "lucide-react"
import { format } from "date-fns"
import type { Transaction } from "@/lib/types"

interface TransactionsTableProps {
  transactions: (Transaction & { item_count?: number })[]
  onViewDetails: (id: string) => void
}

export function TransactionsTable({ transactions, onViewDetails }: TransactionsTableProps) {
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
            transactions.map((transaction) => (
              <TableRow key={transaction.id}>
                <TableCell className="font-bold">{transaction.invoice_number}</TableCell>
                <TableCell>{format(new Date(transaction.created_at), "MMM d, yyyy h:mm a")}</TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary">{transaction.item_count || 0}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{transaction.payment_method}</Badge>
                </TableCell>
                <TableCell className="text-right font-medium">₱{transaction.net_sales.toFixed(2)}</TableCell>
                <TableCell>
                  <Badge variant={transaction.status === "VOIDED" ? "destructive" : "default"}>
                    {transaction.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => onViewDetails(transaction.id)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
