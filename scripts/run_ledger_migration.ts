
import { query } from "../lib/db"
import fs from "fs"
import path from "path"

async function runMigration() {
  try {
    const sqlPath = path.join(process.cwd(), "scripts/006_init_ledger.sql")
    const sql = fs.readFileSync(sqlPath, "utf-8")
    
    console.log("Running migration: 006_init_ledger.sql")
    await query(sql)
    console.log("Migration completed successfully.")
    process.exit(0)
  } catch (error) {
    console.error("Migration failed:", error)
    process.exit(1)
  }
}

runMigration()
