import { NextResponse } from "next/server"
import { query } from "@/lib/db"

const CSV_HEADERS = [
  "name", "barcode", "selling_price", "cost_price", "stock_level",
  "unit_type", "low_stock_threshold", "notify_low_stock", "category",
  "tax_category", "supplier_type", "is_promo", "promo_price",
  "wholesale_price", "wholesale_threshold", "updated_at"
]

function escapeCsvField(value: any): string {
  if (value === null || value === undefined) return ""
  const str = String(value)
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET() {
  try {
    const products = await query(
      `SELECT p.*, c.name as category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       ORDER BY p.name ASC`
    )

    const rows = products.map((p: any) => [
      p.name,
      p.barcode,
      p.selling_price,
      p.cost_price,
      p.stock_level,
      p.unit_type,
      p.low_stock_threshold,
      p.notify_low_stock ? 1 : 0,
      p.category_name,
      p.tax_category,
      p.supplier_type,
      p.is_promo ? 1 : 0,
      p.promo_price,
      p.wholesale_price,
      p.wholesale_threshold,
      p.updated_at,
    ])

    const csv = [
      CSV_HEADERS.join(","),
      ...rows.map(row => row.map(escapeCsvField).join(","))
    ].join("\n")

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="products_${new Date().toISOString().split("T")[0]}.csv"`,
      },
    })
  } catch (error) {
    console.error("[export] Error exporting products:", error)
    return NextResponse.json({ error: "Failed to export products" }, { status: 500 })
  }
}
