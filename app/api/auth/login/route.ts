import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import { queryOne, transaction } from "@/lib/db"

export async function POST(request: Request) {
  try {
    const {
      userId,
      pin,
      auditImage,      // Base64 data URL (auto-captured from camera)
      auditMetadata,   // Metadata from camera capture
      skipAudit = false // OPTIONAL: Skip audit logging (e.g., if combined with shift open)
    } = await request.json()

    // Validate required fields
    if (!userId || !pin) {
      return NextResponse.json(
        { success: false, error: "User ID and PIN are required" },
        { status: 400 }
      )
    }

    // 1. Fetch user by ID (including pin_hash for verification)
    // Lookup + bcrypt run OUTSIDE transaction(): bcrypt is async (~100ms) and
    // would hold the shared SQLite connection in BEGIN, breaking concurrent writes.
    const user = await queryOne(
      `SELECT id, full_name, pin_hash, role, is_active, created_at, updated_at
       FROM users
       WHERE id = $1`,
      [userId]
    )

    // 2. Verify user exists and is active (generic error: don't reveal which)
    if (!user || !user.is_active) {
      throw new Error("INVALID_CREDENTIALS")
    }

    // 3. Verify PIN using bcrypt
    const isPinValid = await bcrypt.compare(pin, user.pin_hash)

    if (!isPinValid) {
      throw new Error("INVALID_CREDENTIALS")
    }

    // 4. Convert audit image to BYTEA format (if provided)
    let imageBuffer = null
    if (auditImage) {
      try {
        const base64Data = auditImage.split(',')[1]
        imageBuffer = Buffer.from(base64Data, 'base64')
      } catch (err) {
        console.warn("[auth/login] Failed to process audit image:", err)
      }
    }

    // 5. Create audit log for successful login (ONLY IF NOT SKIPPED)
    if (!skipAudit) {
      await transaction(async (client) => {
        await client.query(
          `INSERT INTO audit_logs (
            id, user_id,
            action_type,
            audit_image,
            audit_metadata
          ) VALUES ($1, $2, 'MANUAL_AUDIT', $3, $4)`,
          [
            crypto.randomUUID(),
            user.id,
            imageBuffer,
            JSON.stringify({
              ...auditMetadata,
              event: 'USER_LOGIN',
              login_time: new Date().toISOString(),
              role: user.role
            })
          ]
        )
      })
    }

    // 6. Return user data (WITHOUT pin_hash)
    const result = {
      id: user.id,
      full_name: user.full_name,
      role: user.role,
      is_active: user.is_active,
      created_at: user.created_at,
      updated_at: user.updated_at
    }

    return NextResponse.json({
      success: true,
      user: result
    })

  } catch (error: any) {
    console.error("[auth/login] Authentication error:", error)

    // Return generic error for security (don't reveal details)
    if (error.message === "INVALID_CREDENTIALS") {
      return NextResponse.json(
        { success: false, error: "Invalid PIN" },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { success: false, error: "Authentication failed" },
      { status: 500 }
    )
  }
}
