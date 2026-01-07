import { NextResponse } from "next/server"
import { query, getPosId } from "@/lib/db"
import type { Product } from "@/lib/types"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")
    const lowStock = searchParams.get("lowStock")

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
    } = product

    if (!name || !selling_price || !cost_price || !unit_type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const newProduct = await query<Product>(
      `INSERT INTO products 
        (name, barcode, selling_price, cost_price, stock_level, unit_type, low_stock_threshold, notify_low_stock, category_id, tax_category, supplier_type, pos_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
       RETURNING *`,
      [
        name,
        barcode || null,
        selling_price,
        cost_price,
        stock_level || 0,
        unit_type,
        low_stock_threshold || 0,
        notify_low_stock || false,
        category_id || null,
        tax_category || 'VATABLE',
        supplier_type || 'WHOLESALER',
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
