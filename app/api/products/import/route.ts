import { NextResponse } from "next/server"
import crypto from "crypto"
import { query, transaction, getPosId } from "@/lib/db"

const REQUIRED_FIELDS = ["name", "selling_price", "cost_price", "unit_type"]
const VALID_UNIT_TYPES = ["QUANTITY", "WEIGHT"]
const VALID_TAX_CATEGORIES = ["VATABLE", "VAT_EXEMPT", "ZERO_RATED"]
const VALID_SUPPLIER_TYPES = ["WHOLESALER", "WET_MARKET", "DIRECT_DELIVERY"]

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ",") {
        fields.push(current.trim())
        current = ""
      } else {
        current += char
      }
    }
  }
  fields.push(current.trim())
  return fields
}

function parseNumber(value: string): number | null {
  if (!value) return null
  const cleaned = value.replace(/[₱$,\s]/g, "")
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const text = await file.text()
    const lines = text.split(/\r?\n/).filter(l => l.trim())

    if (lines.length < 2) {
      return NextResponse.json({ error: "CSV file is empty or has no data rows" }, { status: 400 })
    }

    const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().trim())
    const posId = getPosId()

    // Validate required headers exist
    for (const field of REQUIRED_FIELDS) {
      if (!headers.includes(field)) {
        return NextResponse.json(
          { error: `Missing required column: ${field}` },
          { status: 400 }
        )
      }
    }

    const results = { created: 0, updated: 0, skipped: 0, errors: [] as string[] }

    // Cache categories by name for lookups
    const existingCategories = await query<{ id: string; name: string }>(
      "SELECT id, name FROM categories"
    )
    const categoryMap = new Map(existingCategories.map(c => [c.name.toLowerCase(), c.id]))

    await transaction(async (client) => {
      for (let i = 1; i < lines.length; i++) {
        const rowNum = i + 1
        const fields = parseCsvLine(lines[i])

        if (fields.length < headers.length) {
          results.errors.push(`Row ${rowNum}: not enough columns`)
          continue
        }

        const row: Record<string, string> = {}
        headers.forEach((h, idx) => { row[h] = fields[idx] || "" })

        // Validate required fields
        const missing = REQUIRED_FIELDS.filter(f => !row[f])
        if (missing.length > 0) {
          results.errors.push(`Row ${rowNum}: missing ${missing.join(", ")}`)
          continue
        }

        const sellingPrice = parseNumber(row.selling_price)
        const costPrice = parseNumber(row.cost_price)
        if (sellingPrice === null || costPrice === null) {
          results.errors.push(`Row ${rowNum}: invalid price`)
          continue
        }

        const unitType = row.unit_type.toUpperCase()
        if (!VALID_UNIT_TYPES.includes(unitType)) {
          results.errors.push(`Row ${rowNum}: invalid unit_type "${row.unit_type}"`)
          continue
        }

        // Resolve category
        let categoryId: string | null = null
        if (row.category) {
          const catKey = row.category.toLowerCase()
          if (categoryMap.has(catKey)) {
            categoryId = categoryMap.get(catKey)!
          } else {
            const newId = crypto.randomUUID()
            await client.query(
              "INSERT INTO categories (id, name, pos_id) VALUES ($1, $2, $3)",
              [newId, row.category, posId]
            )
            categoryMap.set(catKey, newId)
            categoryId = newId
          }
        }

        const taxCategory = VALID_TAX_CATEGORIES.includes(row.tax_category?.toUpperCase())
          ? row.tax_category.toUpperCase()
          : "VATABLE"
        const supplierType = VALID_SUPPLIER_TYPES.includes(row.supplier_type?.toUpperCase())
          ? row.supplier_type.toUpperCase()
          : "WHOLESALER"

        const barcode = row.barcode || null
        const stockLevel = parseNumber(row.stock_level) ?? 0
        const lowStockThreshold = parseNumber(row.low_stock_threshold) ?? 0
        const notifyLowStock = row.notify_low_stock === "1" || row.notify_low_stock?.toLowerCase() === "true" ? 1 : 0
        const isPromo = row.is_promo === "1" || row.is_promo?.toLowerCase() === "true" ? 1 : 0
        const promoPrice = parseNumber(row.promo_price)
        const wholesalePrice = parseNumber(row.wholesale_price)
        const wholesaleThreshold = parseNumber(row.wholesale_threshold) ?? 0
        const csvUpdatedAt = row.updated_at || null

        // Check for existing product by barcode or name
        let existing: any = null
        if (barcode) {
          const res = await client.query("SELECT id, updated_at FROM products WHERE barcode = $1", [barcode])
          existing = res.rows[0]
        }
        if (!existing) {
          const res = await client.query("SELECT id, updated_at FROM products WHERE name = $1", [row.name])
          existing = res.rows[0]
        }

        if (existing) {
          // Smart merge: only update if CSV is newer
          if (csvUpdatedAt && existing.updated_at && csvUpdatedAt <= existing.updated_at) {
            results.skipped++
            continue
          }

          await client.query(
            `UPDATE products SET
              name = $1, barcode = $2, selling_price = $3, cost_price = $4,
              stock_level = $5, unit_type = $6, low_stock_threshold = $7,
              notify_low_stock = $8, category_id = $9, tax_category = $10,
              supplier_type = $11, is_promo = $12, promo_price = $13,
              wholesale_price = $14, wholesale_threshold = $15
             WHERE id = $16`,
            [
              row.name, barcode, sellingPrice, costPrice, stockLevel,
              unitType, lowStockThreshold, notifyLowStock, categoryId,
              taxCategory, supplierType, isPromo, promoPrice,
              wholesalePrice, wholesaleThreshold, existing.id
            ]
          )
          results.updated++
        } else {
          await client.query(
            `INSERT INTO products
              (id, name, barcode, selling_price, cost_price, stock_level, unit_type,
               low_stock_threshold, notify_low_stock, category_id, tax_category,
               supplier_type, is_promo, promo_price, wholesale_price, wholesale_threshold, pos_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
            [
              crypto.randomUUID(), row.name, barcode, sellingPrice, costPrice,
              stockLevel, unitType, lowStockThreshold, notifyLowStock, categoryId,
              taxCategory, supplierType, isPromo, promoPrice, wholesalePrice,
              wholesaleThreshold, posId
            ]
          )
          results.created++
        }
      }
    })

    return NextResponse.json(results)
  } catch (error: any) {
    console.error("[import] Error importing products:", error)
    return NextResponse.json(
      { error: "Failed to import products", details: error.message },
      { status: 500 }
    )
  }
}
