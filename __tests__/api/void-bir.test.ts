/**
 * @jest-environment node
 */

/**
 * Void + BIR counter regression tests: voids reverse stock and store credit,
 * credit notes have their own CN series, Z-readings net out voids, and the
 * terminal grand total / Z counter advance only on Z-reading.
 */
import crypto from "crypto"
import bcrypt from "bcryptjs"
import { query, queryOne, getPosId, closeDb } from "@/lib/db"
import { ensureSchema } from "../db/_setup"
import { POST as SELL } from "../../app/api/transactions/route"
import { POST as VOID } from "../../app/api/transactions/void/route"
import { GET as Z_PREVIEW, POST as Z_READING } from "../../app/api/reports/z-reading/route"
import { POST as OPEN_SHIFT } from "../../app/api/shifts/current/route"
import { POST as CLOSE_SHIFT } from "../../app/api/shifts/close/route"

jest.setTimeout(30000)

const MANAGER_PIN = "4321"
const Z_PIN = "1234"
const managerId = crypto.randomUUID()
const cashierId = crypto.randomUUID()
const terminalId = crypto.randomUUID()
let originalManagerPin: string | null = null

const jsonRequest = (url: string, method: string, body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

async function insertProduct(stock: number) {
  const id = crypto.randomUUID()
  await query(
    `INSERT INTO products (id, name, selling_price, cost_price, stock_level, unit_type, tax_category, pos_id)
     VALUES ($1, $2, 80, 50, $3, 'QUANTITY', 'VAT_EXEMPT', 'test')`,
    [id, `Void Test ${id.slice(0, 8)}`, stock]
  )
  return queryOne("SELECT * FROM products WHERE id = $1", [id])
}

async function insertCustomer() {
  const id = crypto.randomUUID()
  await query(
    `INSERT INTO customers (id, full_name, credit_limit, current_debt_balance, total_spend, pos_id)
     VALUES ($1, $2, 100000, 0, 0, 'test')`,
    [id, `Customer ${id.slice(0, 8)}`]
  )
  return id
}

async function sell(product: any, quantity: number, paymentMethod = "CASH", customerId?: string) {
  const res = await SELL(jsonRequest("/api/transactions", "POST", {
    cart: [{ product, quantity }],
    payment_method: paymentMethod,
    reference_number: customerId,
  }))
  const body = await res.json()
  expect(res.status).toBe(201)
  return body
}

async function voidTransaction(id: string) {
  const res = await VOID(jsonRequest("/api/transactions/void", "POST", {
    originalTransactionId: id, managerId, pin: MANAGER_PIN, reason: "Customer changed mind",
  }))
  return { status: res.status, body: await res.json() }
}

// Pushes every existing timestamp back so rows created after a Z-reading are
// strictly later than it (datetime('now') only has one-second resolution).
async function ageTimestamps() {
  await query("UPDATE transactions SET created_at = datetime(created_at, '-5 seconds')")
  await query("UPDATE daily_readings SET reading_date = datetime(reading_date, '-5 seconds')")
  await query("UPDATE shifts SET start_time = datetime(start_time, '-5 seconds')")
  await query("UPDATE cash_movements SET created_at = datetime(created_at, '-5 seconds')")
}

async function zReading(body: Record<string, unknown> = { terminalId }) {
  const res = await Z_READING(jsonRequest("/api/reports/z-reading", "POST", { pin: Z_PIN, ...body }))
  const json = await res.json()
  expect(res.status).toBe(200)
  await ageTimestamps()
  return json
}

const getTerminal = () => queryOne("SELECT * FROM terminals WHERE id = $1", [terminalId])
const getSetting = async (key: string) =>
  (await queryOne("SELECT value FROM settings WHERE key = $1", [key]))?.value ?? null

async function openShift() {
  const res = await OPEN_SHIFT(jsonRequest("/api/shifts/current", "POST", {
    userId: cashierId, terminalId, openingFund: 0,
  }))
  const body = await res.json()
  expect(res.status).toBe(201)
  return body
}

async function closeShift(shiftId: string) {
  const res = await CLOSE_SHIFT(jsonRequest("/api/shifts/close", "POST", {
    shiftId, actualCash: 0, actualGcash: 0, actualMaya: 0, actualCard: 0,
  }))
  const body = await res.json()
  expect(res.status).toBe(200)
  return body
}

beforeAll(async () => {
  ensureSchema()
  await query(
    "INSERT INTO users (id, full_name, pin_hash, role) VALUES ($1, $2, $3, 'MANAGER')",
    [managerId, `Void Manager ${managerId.slice(0, 8)}`, await bcrypt.hash(MANAGER_PIN, 4)]
  )
  await query(
    "INSERT INTO users (id, full_name, pin_hash, role) VALUES ($1, $2, $3, 'CASHIER')",
    [cashierId, `Void Cashier ${cashierId.slice(0, 8)}`, await bcrypt.hash("1111", 4)]
  )
  await query(
    "INSERT INTO terminals (id, pos_id, ptu_number, serial_number) VALUES ($1, $2, $3, $4)",
    [terminalId, getPosId(), `PTU-${terminalId}`, `SN-${terminalId}`]
  )
  originalManagerPin = await getSetting("manager_pin")
  await query(
    "INSERT INTO settings (key, value) VALUES ('manager_pin', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
    [await bcrypt.hash(Z_PIN, 4)]
  )
})

afterAll(async () => {
  if (originalManagerPin !== null) {
    await query("UPDATE settings SET value = $1 WHERE key = 'manager_pin'", [originalManagerPin])
  }
  closeDb()
})

describe("POST /api/transactions/void", () => {
  it("issues credit notes from their own series (CN-000001 first) without touching the SI sequence", async () => {
    const product = await insertProduct(20)
    const saleA = await sell(product, 1)
    const saleB = await sell(product, 1)
    const nextInvoice = await getSetting("next_invoice_number")

    const voidA = await voidTransaction(saleA.id)
    const voidB = await voidTransaction(saleB.id)

    expect(voidA.status).toBe(200)
    expect(voidA.body.transaction.invoice_number).toBe("CN-000001")
    expect(voidB.body.transaction.invoice_number).toBe("CN-000002")
    expect(await getSetting("next_credit_note_number")).toBe("3")
    expect(await getSetting("next_invoice_number")).toBe(nextInvoice)
  })

  it("continues after the highest existing CN when the sequence key is missing (upgraded installs)", async () => {
    const product = await insertProduct(5)
    const sale = await sell(product, 1)
    await query("DELETE FROM settings WHERE key = 'next_credit_note_number'")

    const voided = await voidTransaction(sale.id)

    expect(voided.status).toBe(200)
    expect(voided.body.transaction.invoice_number).toBe("CN-000003")
    expect(await getSetting("next_credit_note_number")).toBe("4")
  })

  it("restores stock and reverses a store-credit charge with an ADJUSTMENT ledger entry", async () => {
    const product = await insertProduct(50)
    const customerId = await insertCustomer()
    const sale = await sell(product, 10, "STORE_CREDIT", customerId)
    expect(Number(sale.net_sales)).toBeCloseTo(800, 2)
    expect((await queryOne("SELECT stock_level FROM products WHERE id = $1", [product.id])).stock_level).toBe(40)

    const { status, body } = await voidTransaction(sale.id)

    expect(status).toBe(200)
    const creditNote = body.transaction
    expect(creditNote).toMatchObject({
      status: "REFUND",
      transaction_type: "VOID_REFUND",
      reference_number: sale.invoice_number,
      payment_method: "STORE_CREDIT",
    })
    expect(creditNote.net_sales).toBeCloseTo(-800, 2)
    expect((await queryOne("SELECT status FROM transactions WHERE id = $1", [sale.id])).status).toBe("VOIDED")
    expect((await queryOne("SELECT stock_level FROM products WHERE id = $1", [product.id])).stock_level).toBe(50)

    const customer = await queryOne("SELECT * FROM customers WHERE id = $1", [customerId])
    expect(customer.current_debt_balance).toBeCloseTo(0, 2)
    expect(customer.total_spend).toBeCloseTo(0, 2)

    const ledger = await query(
      "SELECT * FROM credit_ledger WHERE customer_id = $1 ORDER BY rowid",
      [customerId]
    )
    expect(ledger.map((e: any) => e.entry_type)).toEqual(["CHARGE", "ADJUSTMENT"])
    expect(ledger[1].amount).toBeCloseTo(800, 2)
    expect(ledger[1].running_balance).toBeCloseTo(0, 2)
    expect(ledger[1].transaction_id).toBe(creditNote.id)
    expect(ledger[1].notes).toContain(sale.invoice_number)
  })

  it("rejects voiding a credit note, an already-voided sale, or an unknown id", async () => {
    const product = await insertProduct(10)
    const sale = await sell(product, 2)
    const first = await voidTransaction(sale.id)
    expect(first.status).toBe(200)
    const cnCounter = await getSetting("next_credit_note_number")
    const stock = (await queryOne("SELECT stock_level FROM products WHERE id = $1", [product.id])).stock_level

    const voidCreditNote = await voidTransaction(first.body.transaction.id)
    const voidAgain = await voidTransaction(sale.id)
    const voidUnknown = await voidTransaction(crypto.randomUUID())

    expect(voidCreditNote.status).toBe(400)
    expect(voidAgain.status).toBe(400)
    expect(voidUnknown.status).toBe(404)
    expect(await getSetting("next_credit_note_number")).toBe(cnCounter)
    expect((await queryOne(
      "SELECT COUNT(*) as count FROM transactions WHERE reference_number = $1",
      [first.body.transaction.invoice_number]
    )).count).toBe(0)
    expect((await queryOne("SELECT stock_level FROM products WHERE id = $1", [product.id])).stock_level).toBe(stock)
  })
})

describe("Z-reading and terminal counters", () => {
  it("nets voids into the Z, including voids of sales from an earlier Z, and accumulates the net GT", async () => {
    await zReading() // close out anything left by earlier tests
    const startGrandTotal = (await getTerminal()).accumulated_grand_total
    const product = await insertProduct(100)

    const saleA = await sell(product, 5) // 400
    const z1 = await zReading()
    expect(z1.total_sales).toBeCloseTo(400, 2)
    expect(z1.accumulated_grand_total).toBeCloseTo(startGrandTotal + 400, 2)

    await voidTransaction(saleA.id) // void of a sale already reported in Z1
    const saleB = await sell(product, 2) // 160
    const saleC = await sell(product, 1) // 80, voided in the same period
    const voidC = await voidTransaction(saleC.id)

    const preview = await (await Z_PREVIEW()).json()
    expect(preview.total_net).toBeCloseTo(-240, 2)

    const z2 = await zReading()
    expect(z2.sales_total).toBeCloseTo(240, 2)
    expect(z2.void_total).toBeCloseTo(480, 2)
    expect(z2.void_count).toBe(2)
    expect(z2.total_sales).toBeCloseTo(-240, 2)
    expect(z2.beginning_grand_total).toBeCloseTo(z1.accumulated_grand_total, 2)
    expect(z2.accumulated_grand_total).toBeCloseTo(startGrandTotal + 160, 2)
    expect(z2.beginning_invoice).toBe(saleB.invoice_number)
    expect(z2.ending_invoice).toBe(saleC.invoice_number)
    expect(z2.end_credit_note).toBe(voidC.body.transaction.invoice_number)
    expect(z2.cash_breakdown.cash_sales).toBeCloseTo(-240, 2)

    expect((await getTerminal()).accumulated_grand_total).toBeCloseTo(startGrandTotal + 160, 2)
    expect(Number(await getSetting("accumulated_grand_total"))).toBeCloseTo(startGrandTotal + 160, 2)
    const stored = await queryOne("SELECT * FROM daily_readings WHERE id = $1", [z2.id])
    expect(stored.total_sales).toBeCloseTo(-240, 2)
    expect(stored.accumulated_grand_total).toBeCloseTo(startGrandTotal + 160, 2)
  })

  it("increments last_z_counter on every Z-reading and the next shift snapshots it", async () => {
    const before = (await getTerminal()).last_z_counter

    const z1 = await zReading()
    expect(z1.z_counter).toBe(before + 1)
    expect((await getTerminal()).last_z_counter).toBe(before + 1)

    // Without a terminalId (current settings page), the terminal that last opened a shift is used
    const shift = await openShift()
    await closeShift(shift.id)
    const z2 = await zReading({})
    expect(z2.terminal_id).toBe(terminalId)
    expect((await getTerminal()).last_z_counter).toBe(before + 2)

    const nextShift = await openShift()
    expect(nextShift.snapshot_z_counter).toBe(before + 2)
    expect(nextShift.snapshot_accumulated_total).toBeCloseTo((await getTerminal()).accumulated_grand_total, 2)
    await closeShift(nextShift.id)
  })

  it("does not add to the GT on shift close; the Z adds the shift's sales exactly once", async () => {
    await zReading()
    const start = await getTerminal()
    const product = await insertProduct(10)

    const shift = await openShift()
    await sell(product, 3) // 240
    await closeShift(shift.id)

    const afterClose = await getTerminal()
    expect(afterClose.accumulated_grand_total).toBeCloseTo(start.accumulated_grand_total, 2)
    expect(afterClose.last_z_counter).toBe(start.last_z_counter)
    const closeLog = await queryOne(
      "SELECT audit_metadata FROM audit_logs WHERE shift_id = $1 AND action_type = 'SHIFT_CLOSE'",
      [shift.id]
    )
    expect(JSON.parse(closeLog.audit_metadata)).toMatchObject({
      closing_z_counter: start.last_z_counter,
      closing_accumulated_total: start.accumulated_grand_total,
    })

    const z = await zReading()
    const expected = start.accumulated_grand_total + 240
    expect(z.accumulated_grand_total).toBeCloseTo(expected, 2)
    expect((await getTerminal()).accumulated_grand_total).toBeCloseTo(expected, 2)
    expect(Number(await getSetting("accumulated_grand_total"))).toBeCloseTo(expected, 2)
  })

  it("continues the reported GT chain for a terminal that was never Z-read (upgraded install)", async () => {
    const lastZ = await zReading()
    const zCount = (await queryOne("SELECT COUNT(*) as count FROM daily_readings WHERE type = 'Z'")).count
    const legacyTerminalId = crypto.randomUUID()
    // Old shift-close code inflated terminals.accumulated_grand_total and never set last_z_counter
    await query(
      `INSERT INTO terminals (id, pos_id, ptu_number, serial_number, accumulated_grand_total, last_z_counter)
       VALUES ($1, $2, $3, $4, 99999, 0)`,
      [legacyTerminalId, getPosId(), `PTU-${legacyTerminalId}`, `SN-${legacyTerminalId}`]
    )

    const z = await zReading({ terminalId: legacyTerminalId })

    expect(z.beginning_grand_total).toBeCloseTo(lastZ.accumulated_grand_total, 2)
    expect(z.z_counter).toBe(zCount + 1)
    const legacy = await queryOne("SELECT * FROM terminals WHERE id = $1", [legacyTerminalId])
    expect(legacy.last_z_counter).toBe(zCount + 1)
    expect(legacy.accumulated_grand_total).toBeCloseTo(lastZ.accumulated_grand_total, 2)
    await query("DELETE FROM terminals WHERE id = $1", [legacyTerminalId])
  })
})

describe("review regressions", () => {
  it("voiding a store-credit sale leaves the balance in centavos", async () => {
    const customerId = await insertCustomer()
    const sales = []
    for (const price of [10.1, 20.2]) {
      const id = crypto.randomUUID()
      await query(
        `INSERT INTO products (id, name, selling_price, cost_price, stock_level, unit_type, tax_category, pos_id)
         VALUES ($1, $2, $3, 1, 10, 'QUANTITY', 'VAT_EXEMPT', 'test')`,
        [id, `Cents ${id.slice(0, 8)}`, price]
      )
      sales.push(await sell(await queryOne("SELECT * FROM products WHERE id = $1", [id]), 1, "STORE_CREDIT", customerId))
    }

    expect((await voidTransaction(sales[0].id)).status).toBe(200)

    const customer = await queryOne("SELECT current_debt_balance, total_spend FROM customers WHERE id = $1", [customerId])
    expect(customer.current_debt_balance).toBe(20.2)
    expect(customer.total_spend).toBe(20.2)
    const adjustment = await queryOne(
      "SELECT running_balance FROM credit_ledger WHERE customer_id = $1 AND entry_type = 'ADJUSTMENT'",
      [customerId]
    )
    expect(adjustment.running_balance).toBe(20.2)
  })

  // Runs last: it clears the Z history to simulate an upgraded install that never ran a Z
  it("first Z on an upgraded install never Z-read does not start from the shift-close-inflated terminal GT", async () => {
    await ageTimestamps()
    await query("DELETE FROM daily_readings")
    await query("UPDATE settings SET value = '0.00' WHERE key = 'accumulated_grand_total'")
    const legacyTerminalId = crypto.randomUUID()
    // Old shift-close code had already added the period's sales into the terminal GT
    await query(
      `INSERT INTO terminals (id, pos_id, ptu_number, serial_number, accumulated_grand_total, last_z_counter)
       VALUES ($1, $2, $3, $4, 240, 0)`,
      [legacyTerminalId, getPosId(), `PTU-${legacyTerminalId}`, `SN-${legacyTerminalId}`]
    )

    const z = await zReading({ terminalId: legacyTerminalId })

    expect(z.beginning_grand_total).toBe(0)
    const legacy = await queryOne("SELECT * FROM terminals WHERE id = $1", [legacyTerminalId])
    expect(legacy.accumulated_grand_total).toBeCloseTo(Number(z.total_sales), 2)
    expect(legacy.last_z_counter).toBe(1)
    await query("DELETE FROM terminals WHERE id = $1", [legacyTerminalId])
  })
})
