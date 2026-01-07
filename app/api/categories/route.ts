import { NextResponse } from "next/server"
import { query, getPosId } from "@/lib/db"
import type { Category } from "@/lib/types"

export async function GET() {
  try {
    const categories = await query<Category>("SELECT * FROM categories ORDER BY name ASC")
    return NextResponse.json(categories)
  } catch (error) {
    console.error("[v0] Error fetching categories:", error)
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { name } = await request.json()
    const posId = getPosId()

    if (!name) {
      return NextResponse.json({ error: "Category name is required" }, { status: 400 })
    }

    const newCategory = await query<Category>(
      "INSERT INTO categories (name, pos_id) VALUES ($1, $2) RETURNING *", 
      [name, posId]
    )

    return NextResponse.json(newCategory[0], { status: 201 })
  } catch (error: any) {
    console.error("[v0] Error creating category:", error)
    if (error.code === "23505") {
      return NextResponse.json({ error: "Category already exists" }, { status: 409 })
    }
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 })
  }
}
