import { NextResponse } from "next/server"
import { queryOne } from "@/lib/db"
import type { Product } from "@/lib/types"

export async function GET(request: Request, { params }: { params: Promise<{ barcode: string }> }) {
  try {
    const { barcode } = await params
    const product = await queryOne<Product>(
      `SELECT p.*, c.name as category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.barcode = $1`,
      [barcode],
    )

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    return NextResponse.json(product)
  } catch (error) {
    console.error("[v0] Error fetching product by barcode:", error)
    return NextResponse.json({ error: "Failed to fetch product" }, { status: 500 })
  }
}
