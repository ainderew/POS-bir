import Database from "better-sqlite3"
import * as crypto from "crypto"
import * as path from "path"

// Singleton pattern for SQLite connection
let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = process.env.SQLITE_PATH || path.join(process.cwd(), "pos.db")
    db = new Database(dbPath)

    // Performance & safety pragmas
    db.pragma("journal_mode = WAL")
    db.pragma("foreign_keys = ON")
    db.pragma("busy_timeout = 5000")

    // Register custom function for UUID generation (used in triggers/defaults)
    db.function("gen_random_uuid", () => crypto.randomUUID())
  }

  return db
}

/**
 * Converts PostgreSQL-style SQL to SQLite-compatible SQL and expands params.
 * Handles: $N params (with reuse), type casts, NOW(), EXTRACT, INTERVAL, ILIKE, trigram
 *
 * PG allows reusing $1 multiple times with one bind value.
 * SQLite uses positional ? where each ? needs its own value.
 * This function expands the params array to match.
 */
export function convertParams(sql: string, params?: any[]): { sql: string; params: any[] } {
  let converted = sql

  // 1. Replace $N params with ? and expand params array
  // PG: $1 can appear multiple times, bound to params[0]
  // SQLite: each ? is positional, so we must duplicate values
  const expandedParams: any[] = []
  const paramRegex = /\$(\d+)/g
  const hasParams = paramRegex.test(converted)
  paramRegex.lastIndex = 0 // Reset after test

  if (hasParams && params) {
    // Build ordered list of param indices as they appear in SQL
    const paramIndices: number[] = []
    let match
    while ((match = paramRegex.exec(converted)) !== null) {
      paramIndices.push(parseInt(match[1]) - 1) // $1 -> index 0
    }

    // Expand params in order of appearance
    for (const idx of paramIndices) {
      expandedParams.push(params[idx])
    }

    // Replace all $N with ? (descending order to handle $10+ correctly)
    const uniqueParams = [...new Set(converted.match(/\$\d+/g) || [])]
      .sort((a, b) => parseInt(b.slice(1)) - parseInt(a.slice(1)))
    for (const param of uniqueParams) {
      converted = converted.split(param).join("?")
    }
  }

  // 2. Strip PostgreSQL type casts (::type)
  converted = converted.replace(/::(timestamp|timestamptz|int|integer|text|numeric|decimal|varchar|boolean|uuid|jsonb|bytea)(\([^)]*\))?/gi, "")

  // 3. Replace NOW() with datetime('now')
  converted = converted.replace(/\bNOW\(\)/gi, "datetime('now')")

  // 5. Replace EXTRACT(DOW FROM col) -> CAST(strftime('%w', col) AS INTEGER)
  converted = converted.replace(
    /EXTRACT\s*\(\s*DOW\s+FROM\s+([^)]+)\)/gi,
    "CAST(strftime('%w', $1) AS INTEGER)"
  )

  // 6. Replace EXTRACT(HOUR FROM col) -> CAST(strftime('%H', col) AS INTEGER)
  converted = converted.replace(
    /EXTRACT\s*\(\s*HOUR\s+FROM\s+([^)]+)\)/gi,
    "CAST(strftime('%H', $1) AS INTEGER)"
  )

  // 7. Replace INTERVAL 'N days/hours/etc' patterns
  converted = converted.replace(
    /datetime\('now'\)\s*-\s*INTERVAL\s+'(\d+)\s+(days?|hours?|minutes?|months?|years?)'/gi,
    "datetime('now', '-$1 $2')"
  )
  converted = converted.replace(
    /NOW\(\)\s*-\s*INTERVAL\s+'(\d+)\s+(days?|hours?|minutes?|months?|years?)'/gi,
    "datetime('now', '-$1 $2')"
  )

  // 8. Replace ILIKE with LIKE
  converted = converted.replace(/\bILIKE\b/gi, "LIKE")

  // 9. Replace trigram operator: col % ? -> col LIKE '%' || ? || '%'
  converted = converted.replace(
    /(\w+)\s+%\s+\?/g,
    "$1 LIKE '%' || ? || '%'"
  )

  // 10. Replace TRUE/FALSE with 1/0
  converted = converted.replace(/\bTRUE\b/g, "1")
  converted = converted.replace(/\bFALSE\b/g, "0")

  return { sql: converted, params: hasParams ? expandedParams : (params || []) }
}

/**
 * Determines if a SQL statement returns rows (SELECT, RETURNING, etc.)
 */
function isReturningQuery(sql: string): boolean {
  const trimmed = sql.trim()
  return /^\s*(SELECT|WITH)/i.test(trimmed) || /RETURNING/i.test(trimmed)
}

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const db = getDb()
  const { sql: converted, params: boundParams } = convertParams(text, params)

  try {
    if (isReturningQuery(converted)) {
      const stmt = db.prepare(converted)
      return stmt.all(...boundParams) as T[]
    } else {
      const stmt = db.prepare(converted)
      const info = stmt.run(...boundParams)
      return [{ changes: info.changes, lastInsertRowid: info.lastInsertRowid } as any]
    }
  } catch (error: any) {
    if (error.message?.includes("UNIQUE constraint failed")) {
      error.code = "23505"
    }
    throw error
  }
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows.length > 0 ? rows[0] : null
}

// Transaction helper
export async function transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
  const database = getDb()

  // Create a client object that mimics pg's client.query interface
  const client = {
    query: async (text: string, params?: any[]) => {
      const { sql: converted, params: boundParams } = convertParams(text, params)

      try {
        if (isReturningQuery(converted)) {
          const stmt = database.prepare(converted)
          const rows = stmt.all(...boundParams)
          return { rows }
        } else {
          const stmt = database.prepare(converted)
          const info = stmt.run(...boundParams)
          return { rows: [], changes: info.changes, lastInsertRowid: info.lastInsertRowid }
        }
      } catch (error: any) {
        if (error.message?.includes("UNIQUE constraint failed")) {
          error.code = "23505"
        }
        throw error
      }
    }
  }

  database.exec("BEGIN")
  try {
    const result = await callback(client)
    database.exec("COMMIT")
    return result
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}

/**
 * Returns the unique ID for this POS machine.
 * This is used to track data origin in a multi-POS environment.
 */
export function getPosId(): string {
  const posId = process.env.POS_ID
  if (!posId) {
    console.warn("[v0] Warning: POS_ID is not defined in environment variables.")
    return "00000000-0000-0000-0000-000000000000"
  }
  return posId
}

/**
 * Close the database connection (for cleanup/testing)
 */
export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
