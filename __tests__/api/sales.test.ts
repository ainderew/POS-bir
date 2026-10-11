/**
 * @jest-environment node
 */

/**
 * Sale route regression tests (POST/GET /api/transactions) plus ph-tax rounding.
 * Route handlers are invoked directly against a real SQLite database.
 */
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import crypto from "crypto"
import { query, queryOne, closeDb } from "@/lib/db"
import { calculateTransactionTotals, getActivePrice, lessVatOf, roundMoney, toCents } from "@/lib/ph-tax"
import type { CartItem, Product, TaxCategory } from "@/lib/types"
import { ensureSchema } from "../db/_setup"
import { GET, POST } from "../../app/api/transactions/route"

jest.setTimeout(30000)

// Own database file: invoice numbering must start from a pristine sequence
const ORIGINAL_SQLITE_PATH = process.env.SQLITE_PATH
const DB_PATH = `${ORIGINAL_SQLITE_PATH || path.join(os.tmpdir(), "pos-test.db")}.sales-test`
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(DB_PATH + suffix, { force: true })
process.env.SQLITE_PATH = DB_PATH
process.env.POS_ID = "00000000-0000-0000-0000-00000000aaaa"

beforeAll(() => {
  ensureSchema()
  jest.spyOn(console, "warn").mockImplementation(() => {})
})

afterAll(() => {
  closeDb()
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(DB_PATH + suffix, { force: true })
  process.env.SQLITE_PATH = ORIGINAL_SQLITE_PATH
})

// ---------- helpers ----------

async function createProduct(overrides: Partial<Product> = {}): Promise<Product> {
  const p = {
    id: crypto.randomUUID(),
    name: "Test Product",
    selling_price: 100,
    cost_price: 70,
    stock_level: 50,
    unit_type: "QUANTITY",
    tax_category: "VATABLE",
    wholesale_price: null,
    wholesale_threshold: 0,
    ...overrides,
  }
  await query(
    `INSERT INTO products (id, name, selling_price, cost_price, stock_level, unit_type, tax_category, wholesale_price, wholesale_threshold, pos_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'test')`,
    [p.id, p.name, p.selling_price, p.cost_price, p.stock_level, p.unit_type, p.tax_category, p.wholesale_price, p.wholesale_threshold]
  )
  return (await queryOne<Product>("SELECT * FROM products WHERE id = $1", [p.id]))!
}

// A cart line exactly as the cart store builds it
const line = (product: Product, quantity: number): CartItem => ({
  product,
  quantity,
  active_price: getActivePrice(product, quantity),
})

async function postSale(body: Record<string, unknown>) {
  const res = await POST(
    new Request("http://localhost/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  )
  return { status: res.status, body: await res.json() }
}

const invoiceCounter = async () =>
  (await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'next_invoice_number'"))!.value

// ---------- invoice numbering ----------

describe("invoice numbering", () => {
  it("issues SI-000001 first and advances the counter to the next number to issue", async () => {
    expect(await invoiceCounter()).toBe("1")
    const product = await createProduct()

    const first = await postSale({ cart: [line(product, 1)], payment_method: "CASH", amount_tendered: 100 })
    expect(first.status).toBe(201)
    expect(first.body.invoice_number).toBe("SI-000001")
    expect(await invoiceCounter()).toBe("2")

    const second = await postSale({ cart: [line(product, 1)], payment_method: "CASH", amount_tendered: 100 })
    expect(second.body.invoice_number).toBe("SI-000002")
    expect(await invoiceCounter()).toBe("3")
  })

  it("never reuses a number on databases where the counter holds the last issued number", async () => {
    // Pre-fix behaviour: counter == last issued invoice (SI-000002)
    await query("UPDATE settings SET value = '2' WHERE key = 'next_invoice_number'")
    const product = await createProduct()

    const sale = await postSale({ cart: [line(product, 1)], payment_method: "CASH", amount_tendered: 100 })
    expect(sale.status).toBe(201)
    expect(sale.body.invoice_number).toBe("SI-000003")
    expect(await invoiceCounter()).toBe("4")
  })
})

// ---------- pricing ----------

describe("server-side pricing", () => {
  it("records the wholesale price actually charged, server cost, and matching profit", async () => {
    const product = await createProduct({ selling_price: 100, cost_price: 70, wholesale_price: 80, wholesale_threshold: 10 })

    const { status, body } = await postSale({ cart: [line(product, 10)], payment_method: "CASH", amount_tendered: 1000 })
    expect(status).toBe(201)
    expect(body.gross_sales).toBe(800)
    expect(body.net_sales).toBe(800) // was 799.9999999999999
    expect(body.vatable_sales).toBe(714.29)
    expect(body.vat_amount).toBe(85.71)
    expect(body.change_amount).toBe(200)

    const items = await query(
      "SELECT price_at_sale, cost_at_sale, quantity_sold, profit, tax_category FROM transaction_items WHERE transaction_id = $1",
      [body.id]
    )
    expect(items).toEqual([{ price_at_sale: 80, cost_at_sale: 70, quantity_sold: 10, profit: 100, tax_category: "VATABLE" }])

    // Response lines (used for the printed receipt) carry the charged price
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({ name: product.name, price_at_sale: 80, quantity_sold: 10 })

    const stock = await queryOne<{ stock_level: number }>("SELECT stock_level FROM products WHERE id = $1", [product.id])
    expect(stock!.stock_level).toBe(40)
  })

  it("ignores client-sent cost and tax category", async () => {
    const product = await createProduct({ selling_price: 112, cost_price: 90, tax_category: "VATABLE" })
    const tampered = { ...product, cost_price: 0, tax_category: "VAT_EXEMPT" as TaxCategory }

    const { status, body } = await postSale({ cart: [line(tampered, 1)], payment_method: "CASH", amount_tendered: 112 })
    expect(status).toBe(201)
    expect(body.vatable_sales).toBe(100)
    expect(body.vat_amount).toBe(12)
    expect(body.vat_exempt_sales).toBe(0)
    expect(body.items[0]).toMatchObject({ cost_at_sale: 90, tax_category: "VATABLE", profit: 22 })
  })

  it("rejects a cash tender below the total with 400", async () => {
    const product = await createProduct({ selling_price: 100 })
    const short = await postSale({ cart: [line(product, 1)], payment_method: "CASH", amount_tendered: 99.99 })
    expect(short.status).toBe(400)
    expect(short.body.error).toMatch(/tendered/i)

    const exact = await postSale({ cart: [line(product, 1)], payment_method: "CASH", amount_tendered: 100 })
    expect(exact.status).toBe(201)
  })

  it("rejects a stale cart with 409 and writes nothing", async () => {
    const product = await createProduct({ selling_price: 100, stock_level: 20 })
    const staleCart = [line(product, 2)] // client snapshot at ₱100
    await query("UPDATE products SET selling_price = 120 WHERE id = $1", [product.id])

    const counterBefore = await invoiceCounter()
    const txBefore = await queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM transactions")

    const { status, body } = await postSale({ cart: staleCart, payment_method: "CASH", amount_tendered: 200 })
    expect(status).toBe(409)
    expect(body.error).toBe("Prices changed — please refresh the cart")
    expect(body.net_sales).toBe(240)
    expect(body.client_net_sales).toBe(200)
    // Current product rows so the client can refresh the cart in place
    expect(body.products).toEqual([expect.objectContaining({ id: product.id, selling_price: 120 })])

    expect(await invoiceCounter()).toBe(counterBefore)
    expect(await queryOne("SELECT COUNT(*) AS n FROM transactions")).toEqual(txBefore)
    const stock = await queryOne<{ stock_level: number }>("SELECT stock_level FROM products WHERE id = $1", [product.id])
    expect(stock!.stock_level).toBe(20)
  })

  it("rejects a stale wholesale price with 409", async () => {
    const product = await createProduct({ selling_price: 100, wholesale_price: 80, wholesale_threshold: 10 })
    const staleCart = [line(product, 10)]
    await query("UPDATE products SET wholesale_price = 85 WHERE id = $1", [product.id])

    const { status } = await postSale({ cart: staleCart, payment_method: "CASH", amount_tendered: 1000 })
    expect(status).toBe(409)
  })

  it("rejects a cart line whose product no longer exists with 409", async () => {
    const product = await createProduct()
    const ghost = { ...product, id: crypto.randomUUID(), name: "Ghost Item" }

    const { status, body } = await postSale({ cart: [line(product, 1), line(ghost, 1)], payment_method: "CASH", amount_tendered: 200 })
    expect(status).toBe(409)
    expect(body.error).toMatch(/Ghost Item is no longer available/)
  })
})

// ---------- SC/PWD rounding ----------

describe("SC/PWD rounding", () => {
  it("stores centavo-rounded totals and accepts the 'Exact' tender", async () => {
    const product = await createProduct({ selling_price: 50, tax_category: "VATABLE" })
    const cart = [line(product, 1)]

    // What the cart's "Exact Amount" button fills in
    const exact = calculateTransactionTotals(cart, 1, 1).netSales.toFixed(2)
    expect(exact).toBe("35.71")

    const { status, body } = await postSale({
      cart,
      payment_method: "CASH",
      scPwdData: { idNumber: "SC-1", name: "Lola" },
      paxCount: 1,
      seniorCount: 1,
      amount_tendered: parseFloat(exact),
    })
    expect(status).toBe(201)
    expect(body).toMatchObject({
      gross_sales: 50,
      vatable_sales: 0,
      vat_amount: 0,
      vat_exempt_sales: 44.64,
      total_discount: 8.93,
      net_sales: 35.71,
      amount_tendered: 35.71,
      change_amount: 0,
    })
  })

  it("charges store credit and the ledger in centavos", async () => {
    const product = await createProduct({ selling_price: 50, tax_category: "VATABLE" })
    const customerId = crypto.randomUUID()
    await query(
      "INSERT INTO customers (id, full_name, credit_limit, current_debt_balance, total_spend, pos_id) VALUES ($1, 'Suki', 1000, 0.1, 0.2, 'test')",
      [customerId]
    )

    const { status, body } = await postSale({
      cart: [line(product, 1)],
      payment_method: "STORE_CREDIT",
      reference_number: customerId,
      paxCount: 1,
      seniorCount: 1,
    })
    expect(status).toBe(201)
    expect(body.net_sales).toBe(35.71)

    const customer = await queryOne("SELECT current_debt_balance, total_spend FROM customers WHERE id = $1", [customerId])
    expect(customer).toEqual({ current_debt_balance: 35.81, total_spend: 35.91 })
    const ledger = await query("SELECT entry_type, amount, running_balance FROM credit_ledger WHERE customer_id = $1", [customerId])
    expect(ledger).toEqual([{ entry_type: "CHARGE", amount: 35.71, running_balance: 35.81 }])
  })
})

// ---------- date filter ----------

describe("GET date filter", () => {
  it("includes early-morning sales of a UTC+8 local day", async () => {
    const insertAt = async (createdAt: string) => {
      const id = crypto.randomUUID()
      await query(
        `INSERT INTO transactions (id, invoice_number, pos_id, gross_sales, net_sales, created_at)
         VALUES ($1, $2, 'test', 10, 10, $3)`,
        [id, `TEST-${id}`, createdAt]
      )
      return id
    }
    // Local day 2026-10-11 in Asia/Manila = 2026-10-10T16:00:00Z .. 2026-10-11T15:59:59.999Z
    const beforeDay = await insertAt("2026-10-10 15:59:59") // 23:59:59 on Oct 10 local
    const earlyMorning = await insertAt("2026-10-10 23:30:00") // 07:30 local
    const lastSecond = await insertAt("2026-10-11 15:59:59") // 23:59:59 local
    const nextDay = await insertAt("2026-10-11 16:00:00") // 00:00 on Oct 12 local

    const params = new URLSearchParams({
      startDate: "2026-10-10T16:00:00.000Z",
      endDate: "2026-10-11T15:59:59.999Z",
    })
    const res = await GET(new Request(`http://localhost/api/transactions?${params}`))
    expect(res.status).toBe(200)
    const ids = ((await res.json()) as { id: string }[]).map((t) => t.id)

    expect(ids).toEqual(expect.arrayContaining([earlyMorning, lastSecond]))
    expect(ids).not.toContain(beforeDay)
    expect(ids).not.toContain(nextDay)
  })
})

// ---------- ph-tax unit tests ----------

describe("ph-tax rounding", () => {
  const product = (overrides: Partial<Product> = {}): Product => ({
    id: crypto.randomUUID(),
    name: "P",
    barcode: null,
    selling_price: 100,
    cost_price: 50,
    stock_level: 1000,
    unit_type: "QUANTITY",
    low_stock_threshold: 0,
    notify_low_stock: false,
    category_id: null,
    tax_category: "VATABLE",
    supplier_type: "WHOLESALER",
    is_promo: false,
    promo_price: null,
    pos_id: "test",
    is_synced: false,
    ...overrides,
  } as Product)

  it("roundMoney rounds half away from zero despite binary error", () => {
    expect(roundMoney(1.005)).toBe(1.01)
    expect(roundMoney(-1.005)).toBe(-1.01)
    expect(roundMoney(35.714285714285715)).toBe(35.71)
    expect(roundMoney(0.1 + 0.2)).toBe(0.3)
    expect(roundMoney(799.9999999999999)).toBe(800)
    expect(toCents(35.71)).toBe(3571)
    expect(toCents(0.1 + 0.2)).toBe(30)
  })

  it("getActivePrice switches to wholesale at the threshold", () => {
    const p = product({ selling_price: 100, wholesale_price: 80, wholesale_threshold: 10 })
    expect(getActivePrice(p, 9)).toBe(100)
    expect(getActivePrice(p, 10)).toBe(80)
    expect(getActivePrice(product({ wholesale_price: 80, wholesale_threshold: 0 }), 50)).toBe(100)
    expect(getActivePrice(product({ wholesale_price: null, wholesale_threshold: 5 }), 50)).toBe(100)
  })

  it("lessVatOf makes stored SC/PWD totals add up on a receipt, and is absent otherwise", () => {
    const sc = { gross_sales: 100, vatable_sales: 0, vat_amount: 0, vat_exempt_sales: 89.29, zero_rated_sales: 0, total_discount: 17.86, net_sales: 71.43 }
    expect(lessVatOf(sc)).toBe(10.71)
    expect(roundMoney(sc.gross_sales - lessVatOf(sc)! - sc.total_discount)).toBe(sc.net_sales)
    expect(lessVatOf({ gross_sales: "-100", vatable_sales: "0", vat_amount: "0", vat_exempt_sales: "-89.29", zero_rated_sales: "0" })).toBe(-10.71)
    expect(lessVatOf({ gross_sales: 112, vatable_sales: 100, vat_amount: 12, vat_exempt_sales: 0, zero_rated_sales: null })).toBeUndefined()
  })

  it("SC/PWD ₱50 VATABLE item: rounded parts add up", () => {
    const totals = calculateTransactionTotals([{ product: product({ selling_price: 50 }), quantity: 1 }], 1, 1)
    expect(totals).toEqual({
      grossSales: 50,
      vatableSales: 0,
      vatAmount: 0,
      vatExemptSales: 44.64,
      zeroRatedSales: 0,
      totalDiscount: 8.93,
      netSales: 35.71,
    })
  })

  it("'Exact' tender always covers the SC/PWD total", () => {
    for (let cents = 100; cents <= 50000; cents += 25) {
      const p = product({ selling_price: cents / 100 })
      const { netSales } = calculateTransactionTotals([{ product: p, quantity: 1 }], 1, 1)
      const exact = parseFloat(netSales.toFixed(2))
      expect(toCents(exact) >= toCents(netSales)).toBe(true)
      expect(exact).toBe(netSales)
    }
  })

  it("keeps every field in centavos and the BIR breakdown consistent", () => {
    // Deterministic pseudo-random carts
    let seed = 42
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
    const categories: TaxCategory[] = ["VATABLE", "VAT_EXEMPT", "ZERO_RATED"]

    for (let n = 0; n < 500; n++) {
      const items: CartItem[] = Array.from({ length: 1 + Math.floor(rand() * 5) }, () => {
        const weight = rand() < 0.3
        const p = product({
          selling_price: Math.round(25 + rand() * 99975) / 100,
          tax_category: categories[Math.floor(rand() * 3)],
          unit_type: weight ? "WEIGHT" : "QUANTITY",
        })
        const quantity = weight ? Math.round(1 + rand() * 2999) / 1000 : 1 + Math.floor(rand() * 20)
        return { product: p, quantity, active_price: p.selling_price }
      })
      const pax = 1 + Math.floor(rand() * 5)
      const seniors = Math.floor(rand() * (pax + 1))
      const t = calculateTransactionTotals(items, pax, seniors)

      for (const value of Object.values(t)) expect(roundMoney(value)).toBe(value)

      const c = {
        gross: toCents(t.grossSales), vatable: toCents(t.vatableSales), vat: toCents(t.vatAmount),
        exempt: toCents(t.vatExemptSales), zero: toCents(t.zeroRatedSales), discount: toCents(t.totalDiscount),
        net: toCents(t.netSales),
      }
      expect(c.net).toBe(c.vatable + c.vat + c.exempt + c.zero - c.discount)
      expect(Math.abs(t.vatAmount - t.vatableSales * 0.12)).toBeLessThanOrEqual(0.01)
      // Gross equals the sum of the rounded line amounts
      expect(c.gross).toBe(items.reduce((sum, i) => sum + toCents(i.product.selling_price * i.quantity), 0))
      if (seniors === 0) {
        expect(c.vatable + c.vat + c.exempt + c.zero).toBe(c.gross)
        expect(c.discount).toBe(0)
      } else {
        // Seniors' share: VAT removed, then 20% off; never more than gross
        expect(c.net).toBeLessThanOrEqual(c.gross)
      }
    }
  })
})
