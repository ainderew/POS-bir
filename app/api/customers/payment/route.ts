import { NextResponse } from "next/server"
import crypto from "crypto"
import { transaction, getPosId } from "@/lib/db"

export async function POST(request: Request) {
  try {
    const { customerId, amount, paymentMethod, reference, shiftId, notes } = await request.json()
    const posId = getPosId()
    
    if (!customerId || !amount || !paymentMethod) {
       return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    
    const result = await transaction(async (client) => {
        // 1. Get Customer
        const customerRes = await client.query("SELECT * FROM customers WHERE id = $1", [customerId])
        if (customerRes.rows.length === 0) throw new Error("Customer not found")
        const customer = customerRes.rows[0]
        
        // 2. Update Balance
        // We cast amount to numeric to ensure safety
        const payAmount = Number(amount)
        
        const updateRes = await client.query(
            `UPDATE customers 
             SET current_debt_balance = current_debt_balance - $1, 
                 last_payment_date = NOW(),
                 credit_status = CASE 
                    WHEN (current_debt_balance - $1) <= credit_limit AND credit_status = 'BLOCKED' THEN 'ACTIVE'
                    ELSE credit_status
                 END,
                 updated_at = NOW()
             WHERE id = $2
             RETURNING current_debt_balance, credit_status`,
             [payAmount, customerId]
        )
        const newBalance = Number(updateRes.rows[0].current_debt_balance)
        
        // 3. Create Ledger Entry
        await client.query(
            `INSERT INTO credit_ledger (
                id, customer_id, shift_id, entry_type, amount, running_balance, notes, pos_id
            ) VALUES ($1, $2, $3, 'PAYMENT', $4, $5, $6, $7)`,
            [crypto.randomUUID(), customerId, shiftId || null, payAmount, newBalance, `Payment via ${paymentMethod} ${reference ? '('+reference+')' : ''}. ${notes || ''}`, posId]
        )
        
        // 4. Record Cash Movement for physical cash
        if (shiftId && paymentMethod === 'CASH') {
            await client.query(
                `INSERT INTO cash_movements (
                    id, shift_id, type, amount, reason, is_synced
                ) VALUES ($1, $2, 'CASH_IN', $3, $4, FALSE)`,
                [crypto.randomUUID(), shiftId, payAmount, `Debt Payment - ${customer.full_name}`]
            )
        }
        
        return { success: true, newBalance, status: updateRes.rows[0].credit_status }
    })
    
    return NextResponse.json(result)
  } catch (error: any) {
     console.error("[v0] Payment error:", error)
     return NextResponse.json({ error: error.message || "Payment failed" }, { status: 500 })
  }
}
