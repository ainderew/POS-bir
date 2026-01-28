import { NextResponse } from "next/server"
import crypto from "crypto"
import { query } from "@/lib/db"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const logs = await query(`
      SELECT cl.*, u.full_name as user_name
      FROM collection_logs cl
      LEFT JOIN users u ON cl.user_id = u.id
      WHERE cl.customer_id = $1
      ORDER BY cl.created_at DESC
    `, [id])
    
    return NextResponse.json(logs)
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { note, userId } = await request.json()
    
    if (!note) return NextResponse.json({ error: "Note is required" }, { status: 400 })

    const result = await query(`
      INSERT INTO collection_logs (id, customer_id, note, user_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [crypto.randomUUID(), id, note, userId || null])
    
    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: "Failed to add log" }, { status: 500 })
  }
}
