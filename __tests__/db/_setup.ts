/**
 * Shared setup for database tests.
 * Ensures the SQLite schema is applied before tests run.
 */
import { getDb } from "@/lib/db"
import * as fs from "fs"
import * as path from "path"

let initialized = false

export function ensureSchema() {
  if (initialized) return

  const db = getDb()
  const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get()
  if (!tableCheck) {
    const schemaPath = path.join(process.cwd(), "scripts/sqlite_schema.sql")
    const schema = fs.readFileSync(schemaPath, "utf-8")
    db.exec(schema)
  }
  initialized = true
}
