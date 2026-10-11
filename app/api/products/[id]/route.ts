import { NextResponse } from "next/server"
import { query, queryOne } from "@/lib/db"
import type { Product } from "@/lib/types"

const isBlank = (value: unknown) => value === undefined || value === null || value === ""

// Returns the value as a finite, non-negative number, or NaN if it isn't one
function toNonNegativeNumber(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string") return NaN
  if (typeof value === "string" && value.trim() === "") return NaN
  const num = Number(value)
  return Number.isFinite(num) && num >= 0 ? num : NaN
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const product = await queryOne<Product>(
      `SELECT p.*, c.name as category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1`,
      [id],
    )

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    return NextResponse.json(product)
  } catch (error) {
    console.error("[v0] Error fetching product:", error)
    return NextResponse.json({ error: "Failed to fetch product" }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const updates = await request.json()

    // stock_level is intentionally not updatable here: the form's value is stale once
    // sales happen, so stock changes go through /api/products/[id]/stock instead.
    const {
      name,
      barcode,
      selling_price,
      cost_price,
      unit_type,
      low_stock_threshold,
      notify_low_stock,
      category_id,
      tax_category,
      supplier_type,
      wholesale_price,
      wholesale_threshold,
    } = updates

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

    const updatedProduct = await query<Product>(
      `UPDATE products 
       SET name = $1, barcode = $2, selling_price = $3, cost_price = $4, 
           unit_type = $5, low_stock_threshold = $6, 
           notify_low_stock = $7, category_id = $8, tax_category = $9,
           supplier_type = $10, wholesale_price = $11, wholesale_threshold = $12,
           is_synced = FALSE,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $13
       RETURNING *`,
      [
        name,
        barcode || null,
        sellingPrice,
        costPrice,
        unit_type,
        low_stock_threshold || 0,
        notify_low_stock || false,
        category_id || null,
        tax_category || 'VATABLE',
        supplier_type || 'WHOLESALER',
        wholesalePrice,
        wholesaleThreshold,
        id,
      ],
    )

    if (updatedProduct.length === 0) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    return NextResponse.json(updatedProduct[0])
  } catch (error: any) {
    console.error("[v0] Error updating product:", error)
    if (error.code === "23505") {
      return NextResponse.json({ error: "Barcode already exists" }, { status: 409 })
    }
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const deleted = await query("DELETE FROM products WHERE id = $1 RETURNING id", [id])

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    return NextResponse.json({ message: "Product deleted successfully" })
  } catch (error) {
    console.error("[v0] Error deleting product:", error)
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 })
  }
}
