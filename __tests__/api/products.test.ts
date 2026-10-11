/**
 * @jest-environment node
 */

/**
 * Products API regression tests: create/edit from the product form,
 * category filtering, and partial CSV imports.
 */
import crypto from "crypto"
import { query, queryOne, closeDb } from "@/lib/db"
import { ensureSchema } from "../db/_setup"
import { GET, POST } from "../../app/api/products/route"
import { PUT } from "../../app/api/products/[id]/route"
import { POST as IMPORT } from "../../app/api/products/import/route"

jest.setTimeout(15000)

const jsonRequest = (url: string, method: string, body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

const routeParams = (id: string) => ({ params: Promise.resolve({ id }) })

const uniqueBarcode = () => `T${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`

// Shape produced by the zod schema in components/inventory/product-form.tsx
const formPayload = (overrides: Record<string, unknown> = {}) => ({
  name: `Form Product ${crypto.randomUUID().slice(0, 8)}`,
  barcode: uniqueBarcode(),
  selling_price: 10,
  cost_price: 5,
  stock_level: 3,
  unit_type: "QUANTITY",
  low_stock_threshold: 0,
  notify_low_stock: false,
  tax_category: "VATABLE",
  supplier_type: "WHOLESALER",
  wholesale_price: 0,
  wholesale_threshold: 0,
  ...overrides,
})

async function insertProduct(fields: Record<string, unknown> = {}) {
  const id = crypto.randomUUID()
  const row = {
    name: `Seed ${id.slice(0, 8)}`,
    barcode: uniqueBarcode(),
    selling_price: 20,
    cost_price: 10,
    stock_level: 40,
    unit_type: "QUANTITY",
    pos_id: "test",
    ...fields,
  }
  const columns = Object.keys(row)
  await query(
    `INSERT INTO products (id, ${columns.join(", ")}) VALUES ($1, ${columns.map((_, i) => `$${i + 2}`).join(", ")})`,
    [id, ...Object.values(row)],
  )
  return id
}

const getProduct = (id: string) => queryOne<any>("SELECT * FROM products WHERE id = $1", [id])

describe("Products API", () => {
  const originalPosId = process.env.POS_ID

  beforeAll(() => {
    process.env.POS_ID = "test-pos"
    ensureSchema()
  })

  afterAll(() => {
    if (originalPosId === undefined) delete process.env.POS_ID
    else process.env.POS_ID = originalPosId
    closeDb()
  })

  describe("POST /api/products", () => {
    it("creates a product from a form-shaped payload (boolean notify_low_stock)", async () => {
      const res = await POST(jsonRequest("/api/products", "POST", formPayload({ notify_low_stock: true })))
      expect(res.status).toBe(201)
      const created = await res.json()
      expect(created.notify_low_stock).toBe(1)
      expect(created.stock_level).toBe(3)
    })

    it("accepts a zero selling or cost price", async () => {
      const res = await POST(jsonRequest("/api/products", "POST", formPayload({ selling_price: 0, cost_price: 0 })))
      expect(res.status).toBe(201)
      const created = await res.json()
      expect(created.selling_price).toBe(0)
      expect(created.cost_price).toBe(0)
    })

    it.each([
      ["missing", undefined],
      ["null", null],
      ["empty", ""],
      ["NaN", "abc"],
      ["negative", -1],
    ])("rejects a %s selling price with 400", async (_label, sellingPrice) => {
      const res = await POST(jsonRequest("/api/products", "POST", formPayload({ selling_price: sellingPrice })))
      expect(res.status).toBe(400)
    })

    it("rejects a negative cost price with 400", async () => {
      const res = await POST(jsonRequest("/api/products", "POST", formPayload({ cost_price: -5 })))
      expect(res.status).toBe(400)
    })

    it("persists wholesale_price and wholesale_threshold", async () => {
      const res = await POST(
        jsonRequest("/api/products", "POST", formPayload({ wholesale_price: 8, wholesale_threshold: 5 })),
      )
      expect(res.status).toBe(201)
      const created = await res.json()
      const row = await getProduct(created.id)
      expect(row.wholesale_price).toBe(8)
      expect(row.wholesale_threshold).toBe(5)
    })
  })

  describe("PUT /api/products/[id]", () => {
    it("updates a product from a form-shaped payload (boolean notify_low_stock)", async () => {
      const id = await insertProduct()
      const res = await PUT(
        jsonRequest(`/api/products/${id}`, "PUT", formPayload({ selling_price: 11, notify_low_stock: true })),
        routeParams(id),
      )
      expect(res.status).toBe(200)
      const updated = await res.json()
      expect(updated.selling_price).toBe(11)
      expect(updated.notify_low_stock).toBe(1)
    })

    it("accepts a zero price and rejects a negative or NaN one", async () => {
      const id = await insertProduct()
      const ok = await PUT(jsonRequest(`/api/products/${id}`, "PUT", formPayload({ selling_price: 0 })), routeParams(id))
      expect(ok.status).toBe(200)
      expect((await getProduct(id)).selling_price).toBe(0)

      const negative = await PUT(jsonRequest(`/api/products/${id}`, "PUT", formPayload({ cost_price: -1 })), routeParams(id))
      expect(negative.status).toBe(400)
      const nan = await PUT(jsonRequest(`/api/products/${id}`, "PUT", formPayload({ selling_price: "abc" })), routeParams(id))
      expect(nan.status).toBe(400)
      const missing = await PUT(
        jsonRequest(`/api/products/${id}`, "PUT", formPayload({ selling_price: undefined })),
        routeParams(id),
      )
      expect(missing.status).toBe(400)
    })

    it("persists wholesale_price and wholesale_threshold", async () => {
      const id = await insertProduct()
      const res = await PUT(
        jsonRequest(`/api/products/${id}`, "PUT", formPayload({ wholesale_price: 15, wholesale_threshold: 12 })),
        routeParams(id),
      )
      expect(res.status).toBe(200)
      const row = await getProduct(id)
      expect(row.wholesale_price).toBe(15)
      expect(row.wholesale_threshold).toBe(12)
    })

    it("does not revert stock sold while the edit form was open", async () => {
      const id = await insertProduct({ stock_level: 40 })
      // Form loaded with stock_level 40; a sale then decrements stock to 35
      await query("UPDATE products SET stock_level = stock_level - 5 WHERE id = $1", [id])

      const res = await PUT(
        jsonRequest(`/api/products/${id}`, "PUT", formPayload({ selling_price: 25, stock_level: 40 })),
        routeParams(id),
      )
      expect(res.status).toBe(200)
      const row = await getProduct(id)
      expect(row.selling_price).toBe(25)
      expect(row.stock_level).toBe(35)
    })

    it("returns 404 for an unknown product", async () => {
      const id = crypto.randomUUID()
      const res = await PUT(jsonRequest(`/api/products/${id}`, "PUT", formPayload()), routeParams(id))
      expect(res.status).toBe(404)
    })
  })

  describe("GET /api/products", () => {
    it("filters by category_id (as sent by the POS product grid)", async () => {
      const categoryA = crypto.randomUUID()
      const categoryB = crypto.randomUUID()
      await query("INSERT INTO categories (id, name, pos_id) VALUES ($1, $2, 'test'), ($3, $4, 'test')", [
        categoryA,
        `Cat A ${categoryA.slice(0, 8)}`,
        categoryB,
        `Cat B ${categoryB.slice(0, 8)}`,
      ])
      const inA = await insertProduct({ name: `Grid Apple ${categoryA.slice(0, 8)}`, category_id: categoryA })
      const inB = await insertProduct({ name: `Grid Banana ${categoryB.slice(0, 8)}`, category_id: categoryB })

      const res = await GET(new Request(`http://localhost/api/products?category_id=${categoryA}`))
      expect(res.status).toBe(200)
      const ids = (await res.json()).map((p: any) => p.id)
      expect(ids).toEqual([inA])
      expect(ids).not.toContain(inB)

      const combined = await GET(
        new Request(`http://localhost/api/products?category_id=${categoryB}&search=${encodeURIComponent("Grid Apple")}`),
      )
      expect(await combined.json()).toEqual([])
    })
  })

  describe("POST /api/products/import", () => {
    const importCsv = (csv: string) => {
      const formData = new FormData()
      formData.append("file", new File([csv], "products.csv", { type: "text/csv" }))
      return IMPORT(new Request("http://localhost/api/products/import", { method: "POST", body: formData }))
    }

    it("only updates columns present in the CSV header for existing products", async () => {
      const categoryId = crypto.randomUUID()
      await query("INSERT INTO categories (id, name, pos_id) VALUES ($1, $2, 'test')", [
        categoryId,
        `Soap Cat ${categoryId.slice(0, 8)}`,
      ])
      const name = `Soap ${categoryId.slice(0, 8)}`
      const barcode = uniqueBarcode()
      const id = await insertProduct({
        name,
        barcode,
        stock_level: 40,
        low_stock_threshold: 5,
        notify_low_stock: 1,
        category_id: categoryId,
        tax_category: "VAT_EXEMPT",
        supplier_type: "WET_MARKET",
        is_promo: 1,
        promo_price: 18,
        wholesale_price: 15,
        wholesale_threshold: 10,
      })

      const res = await importCsv(`name,selling_price,cost_price,unit_type\n${name},22,11,QUANTITY\n`)
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ created: 0, updated: 1, errors: [] })

      const row = await getProduct(id)
      expect(row).toMatchObject({
        selling_price: 22,
        cost_price: 11,
        barcode,
        stock_level: 40,
        low_stock_threshold: 5,
        notify_low_stock: 1,
        category_id: categoryId,
        tax_category: "VAT_EXEMPT",
        supplier_type: "WET_MARKET",
        is_promo: 1,
        promo_price: 18,
        wholesale_price: 15,
        wholesale_threshold: 10,
      })
    })

    it("updates optional columns that are present in the header", async () => {
      const barcode = uniqueBarcode()
      const id = await insertProduct({ barcode, stock_level: 40, wholesale_price: 15, wholesale_threshold: 10 })

      const res = await importCsv(
        `name,barcode,selling_price,cost_price,unit_type,stock_level\nRenamed ${barcode},${barcode},30,12,QUANTITY,7\n`,
      )
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ updated: 1 })

      const row = await getProduct(id)
      expect(row).toMatchObject({
        name: `Renamed ${barcode}`,
        selling_price: 30,
        stock_level: 7,
        wholesale_price: 15,
        wholesale_threshold: 10,
      })
    })

    it("inserts new products with defaults for absent columns", async () => {
      const name = `Brand New ${crypto.randomUUID().slice(0, 8)}`
      const res = await importCsv(`name,selling_price,cost_price,unit_type\n${name},9,4,WEIGHT\n`)
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ created: 1 })

      const row = await queryOne<any>("SELECT * FROM products WHERE name = $1", [name])
      expect(row).toMatchObject({
        selling_price: 9,
        cost_price: 4,
        unit_type: "WEIGHT",
        stock_level: 0,
        barcode: null,
        category_id: null,
        tax_category: "VATABLE",
        supplier_type: "WHOLESALER",
        is_promo: 0,
        wholesale_threshold: 0,
      })
    })
  })
})
