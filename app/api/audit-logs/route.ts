import { NextResponse } from "next/server"
import { query } from "@/lib/db"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const limit = searchParams.get("limit") || "50"
    const offset = searchParams.get("offset") || "0"

    let sql = `
      SELECT 
        a.id,
        a.action_type,
        a.audit_metadata,
        a.created_at,
        a.audit_image,
        u.full_name as user_name,
        t.ptu_number as terminal_ptu,
        s.id as shift_id
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN terminals t ON a.terminal_id = t.id
      LEFT JOIN shifts s ON a.shift_id = s.id
      WHERE 1=1
    `
    const params: any[] = []
    let paramIndex = 1

    if (startDate) {
      sql += ` AND a.created_at >= $${paramIndex}`
      params.push(startDate)
      paramIndex++
    }

    if (endDate) {
      sql += ` AND a.created_at <= $${paramIndex}`
      params.push(endDate)
      paramIndex++
    }

    sql += ` ORDER BY a.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`
    params.push(parseInt(limit as string))
    params.push(parseInt(offset as string))

    const result = await query(sql, params)

    // Convert BYTEA (Buffer) to Base64 string for the frontend
    const logs = result.map((row: any) => ({
      ...row,
      audit_image: row.audit_image ? `data:image/webp;base64,${row.audit_image.toString('base64')}` : null
    }))

    return NextResponse.json(logs)
  } catch (error) {
    console.error("[audit-logs] Error fetching logs:", error)
    return NextResponse.json(
      { error: "Failed to fetch audit logs" },
      { status: 500 }
    )
  }
}
