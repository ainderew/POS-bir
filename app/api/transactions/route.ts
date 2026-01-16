import { NextResponse } from "next/server"
import { query, transaction, getPosId } from "@/lib/db"
import { calculateTransactionTotals } from "@/lib/ph-tax"
import type { CartItem, Transaction } from "@/lib/types"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    let sqlQuery = `
      SELECT t.*, COUNT(ti.id) as item_count
      FROM transactions t
      LEFT JOIN transaction_items ti ON t.id = ti.transaction_id
    `

    const params: any[] = []
    const conditions: string[] = []

    if (startDate) {
      params.push(startDate)
      conditions.push(`t.created_at >= $${params.length}::timestamp`)
    }

    if (endDate) {
      params.push(endDate)
      conditions.push(`t.created_at <= $${params.length}::timestamp`)
    }

    if (conditions.length > 0) {
      sqlQuery += " WHERE " + conditions.join(" AND ")
    }

    sqlQuery += " GROUP BY t.id ORDER BY t.created_at DESC"

    const transactions = await query<Transaction>(sqlQuery, params)
    
    // Ensure numeric fields are numbers
    const formattedTransactions = transactions.map(t => ({
      ...t,
      net_sales: parseFloat(t.net_sales as any),
      total_revenue: parseFloat(t.gross_sales as any), // for compatibility
      total_profit: parseFloat(t.net_sales as any) - parseFloat(t.vat_amount as any) // rough estimate for legacy
    }))

    return NextResponse.json(formattedTransactions)
  } catch (error) {
    console.error("[v0] Error fetching transactions:", error)
    return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { 
      cart, 
      payment_method, 
      scPwdData,
      paxCount,
      seniorCount,
      amount_tendered,
      reference_number, // This will be customerId for STORE_CREDIT
      shiftId // Ensure shiftId is passed or inferred?
    } = await request.json()
    
    const posId = getPosId()

    if (!cart || cart.length === 0) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 })
    }

    // 1. Calculate PH-Compliant Totals
    const totals = calculateTransactionTotals(cart, paxCount || 1, seniorCount || 0)
    const changeAmount = amount_tendered ? parseFloat(amount_tendered) - totals.netSales : 0

    const result = await transaction(async (client) => {
      // 1.1 Store Credit Validation
      if (payment_method === "STORE_CREDIT") {
        if (!reference_number) {
           throw new Error("Customer ID is required for Store Credit")
        }
        
        const customerRes = await client.query(
          "SELECT * FROM customers WHERE id = $1", 
          [reference_number]
        )
        
        if (customerRes.rows.length === 0) {
           throw new Error("Customer not found")
        }
        
        const customer = customerRes.rows[0]
        const currentDebt = Number(customer.current_debt_balance)
        const limit = Number(customer.credit_limit)
        const newBalance = currentDebt + totals.netSales
        
        if (customer.credit_status === 'BLOCKED') {
           throw new Error("Customer account is BLOCKED")
        }
        
        if (newBalance > limit) {
           throw new Error(`Credit limit exceeded. Limit: ${limit}, New Balance: ${newBalance}`)
        }
      }

      // 2. Get and Increment Invoice Number
      const invoiceResult = await client.query(
        "UPDATE settings SET value = (value::int + 1)::text WHERE key = 'next_invoice_number' RETURNING value"
      )
      const invoiceSeq = invoiceResult.rows[0].value.padStart(6, '0')
      const invoiceNumber = `SI-${invoiceSeq}`

      // 3. Create transaction with BIR breakdown
      const transactionResult = await client.query(
        `INSERT INTO transactions (
          invoice_number, pos_id, 
          gross_sales, vatable_sales, vat_amount, vat_exempt_sales, zero_rated_sales, total_discount, net_sales,
          pax_count, senior_count, sc_pwd_id, sc_pwd_name,
          payment_method, amount_tendered, change_amount, reference_number
        ) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) 
         RETURNING *`,
        [
          invoiceNumber, posId,
          totals.grossSales, totals.vatableSales, totals.vatAmount, totals.vatExemptSales, totals.zeroRatedSales, totals.totalDiscount, totals.netSales,
          paxCount || 1, seniorCount || 0, scPwdData?.idNumber || null, scPwdData?.name || null,
          payment_method || "CASH",
          amount_tendered || null,
          changeAmount >= 0 ? changeAmount : 0,
          reference_number || null
        ],
      )

      const newTransaction = transactionResult.rows[0]

      // 4. Insert items and update stock
      for (const item of cart as CartItem[]) {
        await client.query(
          `INSERT INTO transaction_items 
           (transaction_id, product_id, quantity_sold, price_at_sale, cost_at_sale, tax_category, pos_id) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            newTransaction.id, 
            item.product.id, 
            item.quantity, 
            item.product.selling_price, 
            item.product.cost_price, 
            item.product.tax_category,
            posId
          ],
        )

        const updateResult = await client.query(
          `UPDATE products 
           SET stock_level = stock_level - $1, is_synced = FALSE, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND stock_level >= $1
           RETURNING stock_level`,
          [item.quantity, item.product.id],
        )

        if (updateResult.rows.length === 0) {
          throw new Error(`Insufficient stock for product: ${item.product.name}`)
        }
      }

      // 5. Handle Store Credit Updates
      if (payment_method === "STORE_CREDIT") {
         const customerId = reference_number
         
         // Update Customer Balance & Metrics
         const updateCustomer = await client.query(
            `UPDATE customers 
             SET current_debt_balance = current_debt_balance + $1, 
                 total_spend = total_spend + $1,
                 last_visit_at = NOW(),
                 updated_at = NOW()
             WHERE id = $2
             RETURNING current_debt_balance`,
             [totals.netSales, customerId]
         )
         
         const newBalance = Number(updateCustomer.rows[0].current_debt_balance)
         
         // Add Ledger Entry
         await client.query(
            `INSERT INTO credit_ledger (
                customer_id, transaction_id, entry_type, amount, running_balance, pos_id
            ) VALUES ($1, $2, 'CHARGE', $3, $4, $5)`,
            [customerId, newTransaction.id, totals.netSales, newBalance, posId]
         )
      }

      return newTransaction
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: any) {
    console.error("[v0] Transaction error:", error)
    return NextResponse.json({ error: error.message || "Failed to process transaction" }, { status: 500 })
  }
}
