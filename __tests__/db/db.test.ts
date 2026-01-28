/**
 * @jest-environment node
 */

/**
 * db.ts Unit Tests
 * Tests the database abstraction layer (query, queryOne, transaction)
 * against a real SQLite database.
 */
import { query, queryOne, transaction, closeDb } from "@/lib/db"
import { ensureSchema } from "./_setup"

// Increase timeout for DB operations
jest.setTimeout(15000)

describe("Database Abstraction Layer", () => {
  beforeAll(() => {
    ensureSchema()
  })

  afterAll(() => {
    closeDb()
  })

  describe("query()", () => {
    it("returns an array of rows for SELECT", async () => {
      const rows = await query("SELECT 1 as value")
      expect(Array.isArray(rows)).toBe(true)
      expect(rows).toHaveLength(1)
      expect(rows[0].value).toBe(1)
    })

    it("returns empty array for no matches", async () => {
      const rows = await query(
        "SELECT * FROM settings WHERE key = $1",
        ["nonexistent_key_xyz"]
      )
      expect(rows).toEqual([])
    })

    it("supports parameterized queries with $N syntax", async () => {
      const rows = await query(
        "SELECT $1 as a, $2 as b",
        ["hello", 42]
      )
      expect(rows[0].a).toBe("hello")
      expect(rows[0].b).toBe(42)
    })

    it("handles multiple rows", async () => {
      const rows = await query("SELECT key, value FROM settings ORDER BY key LIMIT 3")
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0]).toHaveProperty("key")
      expect(rows[0]).toHaveProperty("value")
    })

    it("returns REAL as JavaScript numbers", async () => {
      const rows = await query("SELECT 123.45 as price")
      expect(typeof rows[0].price).toBe("number")
      expect(rows[0].price).toBe(123.45)
    })
  })

  describe("queryOne()", () => {
    it("returns a single row object", async () => {
      const row = await queryOne(
        "SELECT value FROM settings WHERE key = $1",
        ["business_name"]
      )
      expect(row).not.toBeNull()
      expect(row).toHaveProperty("value")
    })

    it("returns null when no rows match", async () => {
      const row = await queryOne(
        "SELECT * FROM settings WHERE key = $1",
        ["nonexistent_key_xyz"]
      )
      expect(row).toBeNull()
    })

    it("returns only the first row when multiple match", async () => {
      const row = await queryOne("SELECT key FROM settings ORDER BY key LIMIT 1")
      expect(row).not.toBeNull()
      expect(typeof row!.key).toBe("string")
    })
  })

  describe("transaction()", () => {
    it("commits on success", async () => {
      const testKey = `__test_txn_commit_${Date.now()}`

      await transaction(async (client) => {
        await client.query(
          "INSERT INTO settings (key, value) VALUES ($1, $2)",
          [testKey, "test_value"]
        )
      })

      // Verify the insert persisted
      const row = await queryOne(
        "SELECT value FROM settings WHERE key = $1",
        [testKey]
      )
      expect(row).not.toBeNull()
      expect(row!.value).toBe("test_value")

      // Cleanup
      await query("DELETE FROM settings WHERE key = $1", [testKey])
    })

    it("rolls back on error", async () => {
      const testKey = `__test_txn_rollback_${Date.now()}`

      try {
        await transaction(async (client) => {
          await client.query(
            "INSERT INTO settings (key, value) VALUES ($1, $2)",
            [testKey, "should_not_persist"]
          )
          throw new Error("Intentional rollback")
        })
      } catch (e: any) {
        expect(e.message).toBe("Intentional rollback")
      }

      // Verify the insert was rolled back
      const row = await queryOne(
        "SELECT value FROM settings WHERE key = $1",
        [testKey]
      )
      expect(row).toBeNull()
    })

    it("provides client.query that returns { rows }", async () => {
      const result = await transaction(async (client) => {
        const res = await client.query(
          "SELECT value FROM settings WHERE key = $1",
          ["business_name"]
        )
        expect(res).toHaveProperty("rows")
        expect(Array.isArray(res.rows)).toBe(true)
        return res.rows[0]
      })
      expect(result).toHaveProperty("value")
    })

    it("returns the callback result on success", async () => {
      const result = await transaction(async (client) => {
        const res = await client.query("SELECT 42 as answer")
        return res.rows[0].answer
      })
      expect(result).toBe(42)
    })
  })
})
