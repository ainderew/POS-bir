import { NextResponse } from "next/server"
import crypto from "crypto"
import { query, getPosId } from "@/lib/db"
import type { Product } from "@/lib/types"

const isBlank = (value: unknown) => value === undefined || value === null || value === ""

// Returns the value as a finite, non-negative number, or NaN if it isn't one
function toNonNegativeNumber(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string") return NaN
  if (typeof value === "string" && value.trim() === "") return NaN
  const num = Number(value)
  return Number.isFinite(num) && num >= 0 ? num : NaN
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")
    const lowStock = searchParams.get("lowStock")
    const categoryId = searchParams.get("category_id")

    let sqlQuery = `
      SELECT p.*, c.name as category_name,
        CASE 
          WHEN p.notify_low_stock = TRUE AND p.stock_level < p.low_stock_threshold 
          THEN TRUE 
          ELSE FALSE 
        END as is_low_stock
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
    `

    const params: any[] = []
    const conditions: string[] = []

    if (search) {
      params.push(`%${search}%`)
      conditions.push(`(p.name ILIKE $${params.length} OR p.barcode ILIKE $${params.length})`)
    }

    if (categoryId) {
      params.push(categoryId)
      conditions.push(`p.category_id = $${params.length}`)
    }

    if (lowStock === "true") {
      conditions.push("p.notify_low_stock = TRUE AND p.stock_level < p.low_stock_threshold")
    }

    if (conditions.length > 0) {
      sqlQuery += " WHERE " + conditions.join(" AND ")
    }

    sqlQuery += " ORDER BY p.name ASC"

    const products = await query<Product>(sqlQuery, params)
    return NextResponse.json(products)
  } catch (error) {
    console.error("[v0] Error fetching products:", error)
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const product = await request.json()
    const posId = getPosId()

    const {
      name,
      barcode,
      selling_price,
      cost_price,
      stock_level,
      unit_type,
      low_stock_threshold,
      notify_low_stock,
      category_id,
      tax_category,
      supplier_type,
      wholesale_price,
      wholesale_threshold,
    } = product

    if (!name || isBlank(selling_price) || isBlank(cost_price) || !unit_type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const sellingPrice = toNonNegativeNumber(selling_price)
    const costPrice = toNonNegativeNumber(cost_price)
    const wholesalePrice = isBlank(wholesale_price) ? null : toNonNegativeNumber(wholesale_price)
    const wholesaleThreshold = isBlank(wholesale_threshold) ? 0 : toNonNegativeNumber(wholesale_threshold)

    if ([sellingPrice, costPrice, wholesalePrice, wholesaleThreshold].some(Number.isNaN)) {
      return NextResponse.json({ error: "Prices must be non-negative numbers" }, { status: 400 })
    }

    const newProduct = await query<Product>(
      `INSERT INTO products
        (id, name, barcode, selling_price, cost_price, stock_level, unit_type, low_stock_threshold, notify_low_stock, category_id, tax_category, supplier_type, wholesale_price, wholesale_threshold, pos_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        crypto.randomUUID(),
        name,
        barcode || null,
        sellingPrice,
        costPrice,
        stock_level || 0,
        unit_type,
        low_stock_threshold || 0,
        notify_low_stock || false,
        category_id || null,
        tax_category || 'VATABLE',
        supplier_type || 'WHOLESALER',
        wholesalePrice,
        wholesaleThreshold,
        posId
      ],
    )

    return NextResponse.json(newProduct[0], { status: 201 })
  } catch (error: any) {
    console.error("[v0] Error creating product:", error)
    if (error.code === "23505") {
      return NextResponse.json({ error: "Barcode already exists" }, { status: 409 })
    }
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 })
  }
}
