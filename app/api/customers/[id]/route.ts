import { NextResponse } from "next/server"
import { query } from "@/lib/db"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const customer = await query("SELECT * FROM customers WHERE id = $1", [id])
    
    if (customer.length === 0) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 })
    }
    
    return NextResponse.json({
        ...customer[0],
        credit_limit: Number(customer[0].credit_limit),
        current_debt_balance: Number(customer[0].current_debt_balance)
    })
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch customer" }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { full_name, phone_number, email, address, credit_limit, credit_status } = body
    
    // TODO: Add role check here for credit_limit update
    
    const result = await query(
      `UPDATE customers 
       SET full_name = COALESCE($1, full_name),
           phone_number = COALESCE($2, phone_number),
           email = COALESCE($3, email),
           address = COALESCE($4, address),
           credit_limit = COALESCE($5, credit_limit),
           credit_status = COALESCE($6, credit_status),
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [full_name, phone_number, email, address, credit_limit, credit_status, id]
    )
    
    if (result.length === 0) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 })
    }
    
    return NextResponse.json(result[0])
  } catch (error) {
    return NextResponse.json({ error: "Failed to update customer" }, { status: 500 })
  }
}
