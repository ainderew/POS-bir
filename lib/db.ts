import { Pool, types } from "pg"

// Standard PostgreSQL OIDs for numeric/decimal types
const NUMERIC_OID = 1700
types.setTypeParser(NUMERIC_OID, (val) => {
  return val === null ? null : Number.parseFloat(val)
})

// Singleton pattern for PostgreSQL connection
let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.POSTGRES_HOST || "localhost",
      port: Number.parseInt(process.env.POSTGRES_PORT || "54320"),
      database: process.env.POSTGRES_DATABASE || "pos_db",
      user: process.env.POSTGRES_USER || "postgres",
      password: process.env.POSTGRES_PASSWORD || "postgres",
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })

    pool.on("error", (err) => {
      console.error("[v0] Unexpected error on idle client", err)
      process.exit(-1)
    })
  }

  return pool
}

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const pool = getPool()
  const result = await pool.query(text, params)
  return result.rows
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows.length > 0 ? rows[0] : null
}

// Transaction helper
export async function transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
  const pool = getPool()
  const client = await pool.connect()

  try {
    await client.query("BEGIN")
    const result = await callback(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

/**
 * Returns the unique ID for this POS machine.
 * This is used to track data origin in a multi-POS environment.
 */
export function getPosId(): string {
  const posId = process.env.POS_ID
  if (!posId) {
    // In a real production environment, we should throw an error or have a fallback
    console.warn("[v0] Warning: POS_ID is not defined in environment variables.")
    return "00000000-0000-0000-0000-000000000000"
  }
  return posId
}
