import { NextResponse } from "next/server"
import crypto from "crypto"
import { query, transaction, getPosId, toDbTimestamp } from "@/lib/db"
import { calculateTransactionTotals, getActivePrice, roundMoney, toCents } from "@/lib/ph-tax"
import type { CartItem, Product, Transaction } from "@/lib/types"

// A sale rejected for a reason the cashier can act on (returned with its own status)
class SaleError extends Error {
  constructor(message: string, public status: number, public details: Record<string, unknown> = {}) {
    super(message)
  }
}

const ALLOCATE_INVOICE_SQL =
  "UPDATE settings SET value = (value::int + 1)::text WHERE key = 'next_invoice_number' RETURNING (value::int - 1)::text AS issued"

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

    // created_at is stored as UTC "YYYY-MM-DD HH:MM:SS" text; compare in that format
    if (startDate) {
      params.push(toDbTimestamp(startDate))
      conditions.push(`t.created_at >= $${params.length}::timestamp`)
    }

    if (endDate) {
      params.push(toDbTimestamp(endDate))
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

    if (!Array.isArray(cart) || cart.length === 0) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 })
    }

    // Total the cashier was shown and tendered against (from the client's cart snapshot)
    const clientTotals = calculateTransactionTotals(cart, paxCount || 1, seniorCount || 0)

    const result = await transaction(async (client) => {
      // 1. Re-price every line from current product data (client prices, costs and
      //    tax categories are not trusted; a persisted cart can be stale)
      const currentProducts: Product[] = []
      for (const item of cart as CartItem[]) {
        const productRes = await client.query("SELECT * FROM products WHERE id = $1", [item.product?.id])
        if (productRes.rows[0]) currentProducts.push(productRes.rows[0])
      }

      const pricedCart: CartItem[] = (cart as CartItem[]).map((item) => {
        const product = currentProducts.find((p) => p.id === item.product?.id)
        if (!product) {
          throw new SaleError(
            `${item.product?.name || "A product"} is no longer available — remove it from the cart`,
            409,
            { products: currentProducts }
          )
        }
        const quantity = Number(item.quantity)
        if (!(quantity > 0) || (product.unit_type === "QUANTITY" && !Number.isInteger(quantity))) {
          throw new SaleError(`Invalid quantity for ${product.name}`, 400)
        }
        return { product, quantity, active_price: getActivePrice(product, quantity) }
      })

      // 1.1 Calculate PH-Compliant Totals from server prices. Both sides round to
      //     centavos with the same code, so any centavo difference is a real price change.
      const totals = calculateTransactionTotals(pricedCart, paxCount || 1, seniorCount || 0)
      if (toCents(totals.netSales) !== toCents(clientTotals.netSales)) {
        throw new SaleError("Prices changed — please refresh the cart", 409, {
          products: currentProducts,
          net_sales: totals.netSales,
          client_net_sales: clientTotals.netSales,
        })
      }

      const tendered = parseFloat(amount_tendered)
      const amountTendered = Number.isFinite(tendered) && tendered !== 0 ? roundMoney(tendered) : null
      const changeAmount = amountTendered !== null ? roundMoney(amountTendered - totals.netSales) : 0
      if ((payment_method || "CASH") === "CASH" && amountTendered !== null && toCents(amountTendered) < toCents(totals.netSales)) {
        throw new SaleError("Amount tendered is less than the total due", 400)
      }

      // 1.2 Store Credit Validation
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
        const newBalance = roundMoney(currentDebt + totals.netSales)
        
        if (customer.credit_status === 'BLOCKED') {
           throw new Error("Customer account is BLOCKED")
        }
        
        if (newBalance > limit) {
           throw new Error(`Credit limit exceeded. Limit: ${limit.toFixed(2)}, New Balance: ${newBalance.toFixed(2)}`)
        }
      }

      // 2. Allocate Invoice Number (next_invoice_number holds the next number to issue)
      const allocateInvoiceNumber = async () => {
        const invoiceResult = await client.query(ALLOCATE_INVOICE_SQL)
        return `SI-${String(invoiceResult.rows[0].issued).padStart(6, '0')}`
      }
      let invoiceNumber = await allocateInvoiceNumber()
      // Databases written before this fix stored the last-issued number; skip it instead of reusing it
      while ((await client.query("SELECT 1 FROM transactions WHERE invoice_number = $1", [invoiceNumber])).rows.length > 0) {
        invoiceNumber = await allocateInvoiceNumber()
      }

      // 3. Create transaction with BIR breakdown
      const transactionResult = await client.query(
        `INSERT INTO transactions (
          id, invoice_number, pos_id,
          gross_sales, vatable_sales, vat_amount, vat_exempt_sales, zero_rated_sales, total_discount, net_sales,
          pax_count, senior_count, sc_pwd_id, sc_pwd_name,
          payment_method, amount_tendered, change_amount, reference_number
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING *`,
        [
          crypto.randomUUID(),
          invoiceNumber, posId,
          totals.grossSales, totals.vatableSales, totals.vatAmount, totals.vatExemptSales, totals.zeroRatedSales, totals.totalDiscount, totals.netSales,
          paxCount || 1, seniorCount || 0, scPwdData?.idNumber || null, scPwdData?.name || null,
          payment_method || "CASH",
          amountTendered,
          changeAmount >= 0 ? changeAmount : 0,
          reference_number || null
        ],
      )

      const newTransaction = transactionResult.rows[0]

      // 4. Insert items (at the price actually charged) and update stock
      const soldItems: any[] = []
      for (const item of pricedCart) {
        const itemResult = await client.query(
          `INSERT INTO transaction_items
           (id, transaction_id, product_id, quantity_sold, price_at_sale, cost_at_sale, tax_category, pos_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            crypto.randomUUID(),
            newTransaction.id,
            item.product.id,
            item.quantity,
            item.active_price,
            item.product.cost_price,
            item.product.tax_category,
            posId
          ],
        )
        soldItems.push({ ...itemResult.rows[0], name: item.product.name })

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
             SET current_debt_balance = ROUND(current_debt_balance + $1, 2), 
                 total_spend = ROUND(total_spend + $1, 2),
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
                id, customer_id, transaction_id, entry_type, amount, running_balance, pos_id
            ) VALUES ($1, $2, $3, 'CHARGE', $4, $5, $6)`,
            [crypto.randomUUID(), customerId, newTransaction.id, totals.netSales, newBalance, posId]
         )
      }

      return { ...newTransaction, items: soldItems }
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: any) {
    if (error instanceof SaleError) {
      console.warn(`[v0] Sale rejected (${error.status}): ${error.message}`)
      return NextResponse.json({ error: error.message, ...error.details }, { status: error.status })
    }
    console.error("[v0] Transaction error:", error)
    return NextResponse.json({ error: error.message || "Failed to process transaction" }, { status: 500 })
  }
}
