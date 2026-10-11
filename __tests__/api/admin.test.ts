/**
 * @jest-environment node
 */

/**
 * Admin/reporting API regression tests:
 * - Manager PIN survives settings round-trips (GET never returns it)
 * - Login does not hold a DB transaction across bcrypt
 * - Date filters bind timestamps in SQLite's "YYYY-MM-DD HH:MM:SS" UTC format
 * - Staff-risk variance is not multiplied by void count
 * - Menu Doctor only counts PAID sales from the last 30 days
 */
import crypto from "crypto"
import bcrypt from "bcryptjs"
import { getDb, query, queryOne, transaction, closeDb, toDbTimestamp } from "@/lib/db"
import { ensureSchema } from "../db/_setup"
import * as settingsRoute from "../../app/api/settings/route"
import * as verifyPinRoute from "../../app/api/settings/verify-pin/route"
import * as loginRoute from "../../app/api/auth/login/route"
import * as financialsRoute from "../../app/api/reports/financials/route"
import * as metricsRoute from "../../app/api/dashboard/metrics/route"
import * as auditLogsRoute from "../../app/api/audit-logs/route"
import * as menuDoctorRoute from "../../app/api/reports/strategy/menu-doctor/route"

jest.setTimeout(30000)

const POS = "admin-test-pos"

function req(url: string, method = "GET", body?: unknown) {
  return new Request("http://localhost" + url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function withRange(path: string, startDate: string, endDate: string) {
  const params = new URLSearchParams({ startDate, endDate })
  return req(`${path}?${params.toString()}`)
}

async function verifyPin(pin: string) {
  const res = await verifyPinRoute.POST(req("/api/settings/verify-pin", "POST", { pin }))
  return res.status
}

async function insertProduct(name: string, price = 10, cost = 6) {
  const id = crypto.randomUUID()
  await query(
    `INSERT INTO products (id, name, selling_price, cost_price, stock_level, unit_type, pos_id)
     VALUES ($1, $2, $3, $4, 10, 'QUANTITY', $5)`,
    [id, name, price, cost, POS]
  )
  return id
}

async function insertSale(opts: {
  createdAt: string
  net: number
  status?: "PAID" | "VOIDED" | "REFUND"
  productId?: string
  qty?: number
  price?: number
  cost?: number
}) {
  const id = crypto.randomUUID()
  await query(
    `INSERT INTO transactions (id, invoice_number, status, pos_id, created_at, gross_sales, net_sales, payment_method)
     VALUES ($1, $2, $3, $4, $5, $6, $6, 'CASH')`,
    [id, `ADM-${id}`, opts.status ?? "PAID", POS, opts.createdAt, opts.net]
  )
  if (opts.productId) {
    await query(
      `INSERT INTO transaction_items (id, transaction_id, product_id, quantity_sold, price_at_sale, cost_at_sale, tax_category, pos_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'VATABLE', $7)`,
      [crypto.randomUUID(), id, opts.productId, opts.qty ?? 1, opts.price ?? opts.net, opts.cost ?? 0, POS]
    )
  }
  return id
}

async function insertUser(name: string, pin: string, role = "CASHIER") {
  const id = crypto.randomUUID()
  await query(
    `INSERT INTO users (id, full_name, pin_hash, role) VALUES ($1, $2, $3, $4)`,
    [id, name, await bcrypt.hash(pin, 4), role]
  )
  return id
}

beforeAll(() => {
  ensureSchema()
})

afterAll(() => {
  closeDb()
})

describe("settings manager PIN", () => {
  it("GET never returns manager_pin, only has_manager_pin", async () => {
    const data = await (await settingsRoute.GET()).json()
    expect(data).not.toHaveProperty("manager_pin")
    expect(data.has_manager_pin).toBe(true)
    expect(data.business_name).toBeDefined()
  })

  it("keeps the PIN valid across repeated GET -> POST round-trips", async () => {
    expect(await verifyPin("1234")).toBe(200)

    // The settings page loads the form from GET and saves the whole form back.
    // Previously the second save hashed the stored hash and locked out the PIN.
    for (let i = 0; i < 2; i++) {
      const loaded = await (await settingsRoute.GET()).json()
      const res = await settingsRoute.POST(
        req("/api/settings", "POST", { ...loaded, auto_print: loaded.auto_print === "true" })
      )
      expect(res.status).toBe(200)
      expect(await verifyPin("1234")).toBe(200)
    }

    // Current page: strips has_manager_pin and sends a blank PIN field
    for (let i = 0; i < 2; i++) {
      const { has_manager_pin, ...rest } = await (await settingsRoute.GET()).json()
      const res = await settingsRoute.POST(req("/api/settings", "POST", { ...rest, manager_pin: "" }))
      expect(res.status).toBe(200)
      expect(await verifyPin("1234")).toBe(200)
    }
  })

  it("re-hashes only when a new PIN is supplied, and that PIN survives later saves", async () => {
    const setRes = await settingsRoute.POST(req("/api/settings", "POST", { manager_pin: "4321" }))
    expect(setRes.status).toBe(200)
    expect(await verifyPin("4321")).toBe(200)
    expect(await verifyPin("1234")).toBe(401)

    const stored = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'manager_pin'")
    expect(stored!.value).toMatch(/^\$2[aby]\$/)

    for (let i = 0; i < 2; i++) {
      const loaded = await (await settingsRoute.GET()).json()
      const res = await settingsRoute.POST(req("/api/settings", "POST", { ...loaded, manager_pin: "" }))
      expect(res.status).toBe(200)
    }
    expect(await verifyPin("4321")).toBe(200)
    const after = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'manager_pin'")
    expect(after!.value).toBe(stored!.value)
  })

  it("rejects a non-numeric PIN (e.g. a hash posted back) without changing the stored PIN", async () => {
    const stored = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'manager_pin'")
    const res = await settingsRoute.POST(req("/api/settings", "POST", { manager_pin: stored!.value }))
    expect(res.status).toBe(400)
    expect(await verifyPin("4321")).toBe(200)
  })
})

describe("login", () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("does not hold a transaction while bcrypt runs; concurrent writes survive a wrong PIN", async () => {
    const userId = await insertUser("Admin Test Login Cashier", "1111")
    const realCompare = bcrypt.compare.bind(bcrypt)
    const plainWriteName = `During login plain ${crypto.randomUUID()}`
    const txWriteName = `During login tx ${crypto.randomUUID()}`
    let inTransactionDuringCompare: boolean | null = null
    let concurrentTxError: unknown = null

    // Simulate a sale/other request landing while bcrypt is hashing
    jest.spyOn(bcrypt, "compare").mockImplementation((async (pin: string, hash: string) => {
      inTransactionDuringCompare = getDb().inTransaction
      await query("INSERT INTO categories (id, name, pos_id) VALUES ($1, $2, $3)", [crypto.randomUUID(), plainWriteName, POS])
      try {
        await transaction(async (client) => {
          client.query("INSERT INTO categories (id, name, pos_id) VALUES ($1, $2, $3)", [crypto.randomUUID(), txWriteName, POS])
        })
      } catch (error) {
        concurrentTxError = error
      }
      return realCompare(pin, hash)
    }) as any)

    const res = await loginRoute.POST(req("/api/auth/login", "POST", { userId, pin: "0000" }))

    expect(res.status).toBe(401)
    expect(inTransactionDuringCompare).toBe(false)
    expect(concurrentTxError).toBeNull()
    expect(await queryOne("SELECT id FROM categories WHERE name = $1", [plainWriteName])).not.toBeNull()
    expect(await queryOne("SELECT id FROM categories WHERE name = $1", [txWriteName])).not.toBeNull()
    expect(getDb().inTransaction).toBe(false)
  })

  it("still writes the login audit log on success", async () => {
    const userId = await insertUser("Admin Test Login Manager", "2222", "MANAGER")
    const res = await loginRoute.POST(req("/api/auth/login", "POST", { userId, pin: "2222", auditMetadata: { source: "test" } }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.user.id).toBe(userId)
    expect(body.user).not.toHaveProperty("pin_hash")
    const log = await queryOne<{ audit_metadata: string }>(
      "SELECT audit_metadata FROM audit_logs WHERE user_id = $1 AND action_type = 'MANUAL_AUDIT'",
      [userId]
    )
    expect(JSON.parse(log!.audit_metadata)).toMatchObject({ event: "USER_LOGIN", source: "test" })
  })
})

describe("date filters (stored created_at is 'YYYY-MM-DD HH:MM:SS' UTC)", () => {
  // A UTC+8 (Asia/Manila) browser selecting "today" = 2025-03-15 sends:
  const MANILA_START = "2025-03-14T16:00:00.000Z" // startOfDay(2025-03-15 local)
  const MANILA_END = "2025-03-15T15:59:59.999Z" // endOfDay(2025-03-15 local)

  it("financials: includes 00:00-07:59 local sales and excludes the next local day", async () => {
    await insertSale({ createdAt: "2025-03-14 16:30:00", net: 100 }) // 00:30 Mar 15 local
    await insertSale({ createdAt: "2025-03-14 23:59:00", net: 20 }) // 07:59 Mar 15 local
    await insertSale({ createdAt: "2025-03-14 15:30:00", net: 7 }) // 23:30 Mar 14 local
    await insertSale({ createdAt: "2025-03-15 16:30:00", net: 3 }) // 00:30 Mar 16 local

    const res = await financialsRoute.GET(withRange("/api/reports/financials", MANILA_START, MANILA_END))
    const report = await res.json()

    expect(res.status).toBe(200)
    expect(report.total_revenue).toBe(120)
    expect(report.total_transactions).toBe(2)
  })

  it("metrics: early-morning UTC+8 sale counts as today, late sale as yesterday", async () => {
    // Manila "today" = 2025-04-15
    await insertSale({ createdAt: "2025-04-14 16:30:00", net: 100 }) // 00:30 Apr 15 local
    await insertSale({ createdAt: "2025-04-14 15:30:00", net: 40 }) // 23:30 Apr 14 local
    await insertSale({ createdAt: "2025-04-15 16:30:00", net: 3 }) // 00:30 Apr 16 local

    const res = await metricsRoute.GET(
      withRange("/api/dashboard/metrics", "2025-04-14T16:00:00.000Z", "2025-04-15T15:59:59.999Z")
    )
    const metrics = await res.json()

    expect(res.status).toBe(200)
    expect(metrics.pulse.net_sales_today).toBe(100)
    expect(metrics.pulse.net_sales_yesterday).toBe(40)
  })

  it("metrics: default 'today' (server local midnight) includes a sale 30 minutes after midnight", async () => {
    jest.useFakeTimers({
      now: new Date(2025, 5, 20, 10, 0, 0),
      doNotFake: [
        "nextTick", "setImmediate", "clearImmediate", "setInterval", "clearInterval",
        "setTimeout", "clearTimeout", "queueMicrotask", "hrtime", "performance",
      ],
    })
    try {
      await insertSale({ createdAt: toDbTimestamp(new Date(2025, 5, 20, 0, 30)), net: 55 })
      await insertSale({ createdAt: toDbTimestamp(new Date(2025, 5, 19, 23, 30)), net: 11 })

      const metrics = await (await metricsRoute.GET(req("/api/dashboard/metrics"))).json()

      expect(metrics.pulse.net_sales_today).toBe(55)
      expect(metrics.pulse.net_sales_yesterday).toBe(11)
    } finally {
      jest.useRealTimers()
    }
  })

  it("audit logs: includes 00:00-07:59 local entries and excludes the next local day", async () => {
    const inRange = crypto.randomUUID()
    const nextDay = crypto.randomUUID()
    await query(
      `INSERT INTO audit_logs (id, action_type, created_at) VALUES ($1, 'MANUAL_AUDIT', '2025-03-14 17:00:00'), ($2, 'MANUAL_AUDIT', '2025-03-15 17:00:00')`,
      [inRange, nextDay]
    )

    const logs = await (await auditLogsRoute.GET(withRange("/api/audit-logs", MANILA_START, MANILA_END))).json()
    const ids = logs.map((l: { id: string }) => l.id)

    expect(ids).toContain(inRange)
    expect(ids).not.toContain(nextDay)
  })
})

describe("staff risk", () => {
  it("does not multiply cash variance by the number of voids", async () => {
    const cashierId = await insertUser("Admin Test Risk Cashier", "3333")
    const shiftId = crypto.randomUUID()
    await query(
      `INSERT INTO shifts (id, pos_id, status, start_time, end_time, variance, user_id)
       VALUES ($1, $2, 'CLOSED', '2025-05-10 00:00:00', '2025-05-10 05:00:00', -50, $3)`,
      [shiftId, POS, cashierId]
    )
    for (let i = 0; i < 3; i++) {
      await query(
        `INSERT INTO voids (id, shift_id, cashier_id, item_details, reason, occurred_at)
         VALUES ($1, $2, $3, '{}', 'test', $4)`,
        [crypto.randomUUID(), shiftId, cashierId, `2025-05-10 04:0${i}:00`]
      )
    }

    const metrics = await (
      await metricsRoute.GET(withRange("/api/dashboard/metrics", "2025-05-09T16:00:00.000Z", "2025-05-10T15:59:59.999Z"))
    ).json()
    const row = metrics.staff_risk.find((r: { cashier_id: string }) => r.cashier_id === cashierId)

    expect(row).toMatchObject({ void_count: 3, cash_variance: 50, risk_score: 80 })
  })
})

describe("menu doctor", () => {
  it("counts only PAID sales from the last 30 days and keeps products with no sales", async () => {
    const sold = await insertProduct("Admin Test MD Sold", 10, 6)
    const unsold = await insertProduct("Admin Test MD Unsold", 10, 6)
    const daysAgo = (n: number) => toDbTimestamp(new Date(Date.now() - n * 24 * 60 * 60 * 1000))

    await insertSale({ createdAt: daysAgo(1), net: 20, productId: sold, qty: 2, price: 10, cost: 6 })
    await insertSale({ createdAt: daysAgo(1), net: 50, status: "VOIDED", productId: sold, qty: 5, price: 10, cost: 6 })
    await insertSale({ createdAt: daysAgo(60), net: 70, productId: sold, qty: 7, price: 10, cost: 6 })

    const res = await menuDoctorRoute.GET()
    const data = await res.json()
    const soldRow = data.items.find((i: { id: string }) => i.id === sold)
    const unsoldRow = data.items.find((i: { id: string }) => i.id === unsold)

    expect(res.status).toBe(200)
    expect(soldRow).toMatchObject({ total_qty: 2, total_revenue: 20, total_profit: 8 })
    expect(unsoldRow).toMatchObject({ total_qty: 0, total_revenue: 0, total_profit: 0 })
  })
})
