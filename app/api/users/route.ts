import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import { query, queryOne } from "@/lib/db"

// GET: List all active users (for identity selection grid)
export async function GET() {
  try {
    const users = await query(
      `SELECT id, full_name, role, is_active, created_at, updated_at
       FROM users
       WHERE is_active = true
       ORDER BY full_name ASC`
    )

    return NextResponse.json(users)
  } catch (error) {
    console.error("[users] Error fetching users:", error)
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    )
  }
}

// POST: Create new user (admin only - should add auth check later)
export async function POST(request: Request) {
  try {
    const { full_name, pin, role } = await request.json()

    // Validate required fields
    if (!full_name || !pin || !role) {
      return NextResponse.json(
        { error: "Full name, PIN, and role are required" },
        { status: 400 }
      )
    }

    // Validate role
    if (!['ADMIN', 'CASHIER', 'MANAGER'].includes(role)) {
      return NextResponse.json(
        { error: "Invalid role. Must be ADMIN, CASHIER, or MANAGER" },
        { status: 400 }
      )
    }

    // Validate PIN length (4-6 digits)
    if (!/^\d{4,6}$/.test(pin)) {
      return NextResponse.json(
        { error: "PIN must be 4-6 digits" },
        { status: 400 }
      )
    }

    // Hash PIN using bcrypt
    const pinHash = await bcrypt.hash(pin, 10)

    // Create user
    const user = await queryOne(
      `INSERT INTO users (id, full_name, pin_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, role, is_active, created_at, updated_at`,
      [crypto.randomUUID(), full_name, pinHash, role]
    )

    return NextResponse.json(user, { status: 201 })
  } catch (error: any) {
    console.error("[users] Error creating user:", error)

    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    )
  }
}
