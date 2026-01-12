
import { NextResponse } from "next/server"
import { queryOne } from "@/lib/db"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const invoiceNumber = searchParams.get("invoiceNumber")

  if (!invoiceNumber) {
    return NextResponse.json({ error: "Invoice number is required" }, { status: 400 })
  }

  try {
    const transaction = await queryOne(
      "SELECT id FROM transactions WHERE invoice_number = $1",
      [invoiceNumber]
    )

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
    }

    return NextResponse.json({ id: transaction.id })
  } catch (error) {
    console.error("Error looking up transaction:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
