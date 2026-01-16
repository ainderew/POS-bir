import { NextResponse } from "next/server"
import { query, getPosId } from "@/lib/db"
import { Customer } from "@/lib/types"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")
    
    let sql = `SELECT * FROM customers`
    const params: any[] = []
    
    if (search) {
      sql += ` WHERE full_name ILIKE $1 OR phone_number ILIKE $1`
      params.push(`%${search}%`)
    }
    
    sql += ` ORDER BY full_name ASC`
    
    const customers = await query<Customer>(sql, params)
    
    // Convert numeric fields
    const formatted = customers.map(c => ({
      ...c,
      credit_limit: Number(c.credit_limit),
      current_debt_balance: Number(c.current_debt_balance)
    }))
    
    return NextResponse.json(formatted)
  } catch (error) {
    console.error("[v0] Error fetching customers:", error)
    return NextResponse.json({ error: "Failed to fetch customers" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const posId = getPosId()
    
    const { full_name, phone_number, email, address, credit_limit } = body
    
    if (!full_name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }
    
    const result = await query(
      `INSERT INTO customers (
        full_name, phone_number, email, address, credit_limit, pos_id
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        full_name, 
        phone_number || null, 
        email || null, 
        address || null, 
        credit_limit || 0,
        posId
      ]
    )
    
    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("[v0] Error creating customer:", error)
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 })
  }
}
