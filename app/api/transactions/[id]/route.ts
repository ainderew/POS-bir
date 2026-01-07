import { NextResponse } from "next/server"
import { query, queryOne } from "@/lib/db"
import type { Transaction, TransactionItem } from "@/lib/types"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const transactionData = await queryOne<Transaction>("SELECT * FROM transactions WHERE id = $1", [id])

    if (!transactionData) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
    }

    const items = await query<TransactionItem>(
      `SELECT ti.*, p.name as product_name
       FROM transaction_items ti
       LEFT JOIN products p ON ti.product_id = p.id
       WHERE ti.transaction_id = $1
       ORDER BY ti.created_at ASC`,
      [id],
    )

    // Ensure numeric fields are numbers (pg returns them as strings)
    const formattedTransaction = {
      ...transactionData,
      gross_sales: parseFloat(transactionData.gross_sales as any),
      vatable_sales: parseFloat(transactionData.vatable_sales as any),
      vat_amount: parseFloat(transactionData.vat_amount as any),
      vat_exempt_sales: parseFloat(transactionData.vat_exempt_sales as any),
      zero_rated_sales: parseFloat(transactionData.zero_rated_sales as any),
      total_discount: parseFloat(transactionData.total_discount as any),
      net_sales: parseFloat(transactionData.net_sales as any),
    }

    return NextResponse.json({ ...formattedTransaction, items })
  } catch (error) {
    console.error("[v0] Error fetching transaction:", error)
    return NextResponse.json({ error: "Failed to fetch transaction" }, { status: 500 })
  }
}
