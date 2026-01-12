import { NextResponse } from "next/server"
import bcrypt from "bcrypt"
import { queryOne } from "@/lib/db"

// GET: Fetch single user
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await queryOne(
      `SELECT id, full_name, role, is_active, created_at, updated_at
       FROM users
       WHERE id = $1`,
      [params.id]
    )

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    return NextResponse.json(user)
  } catch (error) {
    console.error("[users/:id] Error fetching user:", error)
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    )
  }
}

// PATCH: Update user (change PIN, deactivate, etc.)
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { full_name, pin, role, is_active } = await request.json()

    // Build dynamic update query
    const updates: string[] = []
    const values: any[] = []
    let paramCount = 1

    if (full_name !== undefined) {
      updates.push(`full_name = $${paramCount++}`)
      values.push(full_name)
    }

    if (pin !== undefined) {
      // Validate PIN format
      if (!/^\d{4,6}$/.test(pin)) {
        return NextResponse.json(
          { error: "PIN must be 4-6 digits" },
          { status: 400 }
        )
      }
      // Hash new PIN
      const pinHash = await bcrypt.hash(pin, 10)
      updates.push(`pin_hash = $${paramCount++}`)
      values.push(pinHash)
    }

    if (role !== undefined) {
      if (!['ADMIN', 'CASHIER', 'MANAGER'].includes(role)) {
        return NextResponse.json(
          { error: "Invalid role" },
          { status: 400 }
        )
      }
      updates.push(`role = $${paramCount++}`)
      values.push(role)
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`)
      values.push(is_active)
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      )
    }

    // Always update timestamp
    updates.push(`updated_at = CURRENT_TIMESTAMP`)

    // Add user ID to values array
    values.push(params.id)

    const user = await queryOne(
      `UPDATE users
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING id, full_name, role, is_active, created_at, updated_at`,
      values
    )

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    return NextResponse.json(user)
  } catch (error) {
    console.error("[users/:id] Error updating user:", error)
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    )
  }
}
