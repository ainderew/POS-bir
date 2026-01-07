import { NextResponse } from "next/server"
import { query, queryOne } from "@/lib/db"
import type { Product } from "@/lib/types"

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
    } = updates

    const updatedProduct = await query<Product>(
      `UPDATE products 
       SET name = $1, barcode = $2, selling_price = $3, cost_price = $4, 
           stock_level = $5, unit_type = $6, low_stock_threshold = $7, 
           notify_low_stock = $8, category_id = $9, tax_category = $10,
           supplier_type = $11,
           is_synced = FALSE,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $12
       RETURNING *`,
      [
        name,
        barcode || null,
        selling_price,
        cost_price,
        stock_level,
        unit_type,
        low_stock_threshold,
        notify_low_stock,
        category_id || null,
        tax_category || 'VATABLE',
        supplier_type || 'WHOLESALER',
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
