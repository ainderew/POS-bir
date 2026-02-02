/**
 * @jest-environment node
 */

/**
 * Query Snapshot Tests
 *
 * Tests the actual SQL queries used by API routes against a real SQLite database.
 * Seeds test data, runs queries, and verifies expected outputs.
 */
import { query, queryOne, transaction, closeDb } from "@/lib/db"
import { ensureSchema } from "./_setup"
import crypto from "crypto"
import bcrypt from "bcryptjs"

jest.setTimeout(30000)

// Test data IDs (deterministic for cleanup)
const TEST_POS_ID = "00000000-0000-0000-0000-000000000001"
const TEST_USER_ID = "00000000-0000-0000-0000-100000000001"
const TEST_TERMINAL_ID = "00000000-0000-0000-0000-200000000001"
const TEST_CATEGORY_ID = "00000000-0000-0000-0000-300000000001"
const TEST_PRODUCT_ID = "00000000-0000-0000-0000-400000000001"
const TEST_PRODUCT_ID_2 = "00000000-0000-0000-0000-400000000002"
const TEST_CUSTOMER_ID = "00000000-0000-0000-0000-500000000001"
const TEST_SHIFT_ID = "00000000-0000-0000-0000-600000000001"
const TEST_TRANSACTION_ID = "00000000-0000-0000-0000-700000000001"
const TEST_TXN_ITEM_ID = "00000000-0000-0000-0000-800000000001"
const TEST_CASH_MOV_ID = "00000000-0000-0000-0000-900000000001"

async function seedTestData() {
  const pinHash = await bcrypt.hash("1234", 10)

  await query(`
    INSERT OR IGNORE INTO users (id, full_name, pin_hash, role, is_active)
    VALUES ($1, 'Test Cashier', $2, 'CASHIER', 1)
  `, [TEST_USER_ID, pinHash])

  await query(`
    INSERT OR IGNORE INTO terminals (id, pos_id, ptu_number, serial_number, current_state, accumulated_grand_total, last_z_counter)
    VALUES ($1, $2, 'PTU-TEST-001', 'SN-TEST-001', 'OPEN', 1000.00, 5)
  `, [TEST_TERMINAL_ID, TEST_POS_ID])

  await query(`
    INSERT OR IGNORE INTO categories (id, name, pos_id)
    VALUES ($1, 'Test Category', $2)
  `, [TEST_CATEGORY_ID, TEST_POS_ID])

  await query(`
    INSERT OR IGNORE INTO products (id, name, barcode, selling_price, cost_price, stock_level, unit_type, low_stock_threshold, notify_low_stock, category_id, tax_category, supplier_type, pos_id)
    VALUES ($1, 'Test Product A', 'BAR001', 100.00, 80.00, 50, 'QUANTITY', 5, 1, $2, 'VATABLE', 'WHOLESALER', $3)
  `, [TEST_PRODUCT_ID, TEST_CATEGORY_ID, TEST_POS_ID])

  await query(`
    INSERT OR IGNORE INTO products (id, name, barcode, selling_price, cost_price, stock_level, unit_type, low_stock_threshold, notify_low_stock, category_id, tax_category, supplier_type, pos_id)
    VALUES ($1, 'Test Product B', 'BAR002', 250.00, 200.00, 0, 'QUANTITY', 10, 1, $2, 'VAT_EXEMPT', 'WHOLESALER', $3)
  `, [TEST_PRODUCT_ID_2, TEST_CATEGORY_ID, TEST_POS_ID])

  await query(`
    INSERT OR IGNORE INTO customers (id, full_name, phone_number, credit_limit, current_debt_balance, credit_status, total_spend, pos_id)
    VALUES ($1, 'Juan Dela Cruz', '09171234567', 5000.00, 1000.00, 'ACTIVE', 2500.00, $2)
  `, [TEST_CUSTOMER_ID, TEST_POS_ID])

  await query(`
    INSERT OR IGNORE INTO shifts (id, pos_id, status, opening_fund, terminal_id, user_id)
    VALUES ($1, $2, 'OPEN', 500.00, $3, $4)
  `, [TEST_SHIFT_ID, TEST_POS_ID, TEST_TERMINAL_ID, TEST_USER_ID])

  await query(`
    INSERT OR IGNORE INTO transactions (id, invoice_number, pos_id, gross_sales, vatable_sales, vat_amount, vat_exempt_sales, zero_rated_sales, total_discount, net_sales, payment_method, status)
    VALUES ($1, 'SI-000099', $2, 200.00, 178.57, 21.43, 0, 0, 0, 200.00, 'CASH', 'PAID')
  `, [TEST_TRANSACTION_ID, TEST_POS_ID])

  await query(`
    INSERT OR IGNORE INTO transaction_items (id, transaction_id, product_id, quantity_sold, price_at_sale, cost_at_sale, tax_category, pos_id)
    VALUES ($1, $2, $3, 2, 100.00, 80.00, 'VATABLE', $4)
  `, [TEST_TXN_ITEM_ID, TEST_TRANSACTION_ID, TEST_PRODUCT_ID, TEST_POS_ID])

  await query(`
    INSERT OR IGNORE INTO cash_movements (id, shift_id, type, amount, reason)
    VALUES ($1, $2, 'CASH_IN', 200.00, 'Test deposit')
  `, [TEST_CASH_MOV_ID, TEST_SHIFT_ID])
}

async function cleanupTestData() {
  // Delete in reverse dependency order
  await query("DELETE FROM credit_ledger WHERE customer_id = $1", [TEST_CUSTOMER_ID])
  await query("DELETE FROM collection_logs WHERE customer_id = $1", [TEST_CUSTOMER_ID])
  await query("DELETE FROM transaction_items WHERE transaction_id = $1", [TEST_TRANSACTION_ID])
  await query("DELETE FROM voids WHERE shift_id = $1", [TEST_SHIFT_ID])
  await query("DELETE FROM audit_logs WHERE shift_id = $1", [TEST_SHIFT_ID])
  await query("DELETE FROM cash_movements WHERE shift_id = $1", [TEST_SHIFT_ID])
  await query("DELETE FROM transactions WHERE id = $1", [TEST_TRANSACTION_ID])
  await query("DELETE FROM shifts WHERE id = $1", [TEST_SHIFT_ID])
  await query("DELETE FROM customers WHERE id = $1", [TEST_CUSTOMER_ID])
  await query("DELETE FROM products WHERE id IN ($1, $2)", [TEST_PRODUCT_ID, TEST_PRODUCT_ID_2])
  await query("DELETE FROM categories WHERE id = $1", [TEST_CATEGORY_ID])
  await query("DELETE FROM terminals WHERE id = $1", [TEST_TERMINAL_ID])
  await query("DELETE FROM users WHERE id = $1", [TEST_USER_ID])
}

describe("Query Snapshots", () => {
  beforeAll(async () => {
    ensureSchema()
    await seedTestData()
  })

  afterAll(async () => {
    await cleanupTestData()
    closeDb()
  })

  // =====================================================
  // Products Queries (from app/api/products/route.ts)
  // =====================================================
  describe("Products", () => {
    it("GET: lists products with category name and low stock flag", async () => {
      const rows = await query(`
        SELECT p.*, c.name as category_name,
          CASE
            WHEN p.notify_low_stock = TRUE AND p.stock_level < p.low_stock_threshold
            THEN TRUE ELSE FALSE
          END as is_low_stock
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.id = $1
        ORDER BY p.name ASC
      `, [TEST_PRODUCT_ID])

      expect(rows).toHaveLength(1)
      expect(rows[0].name).toBe("Test Product A")
      expect(rows[0].category_name).toBe("Test Category")
      // SQLite returns 0/1 for boolean expressions
      expect(rows[0].is_low_stock).toBe(0) // stock 50 > threshold 5
      expect(typeof rows[0].selling_price).toBe("number")
      expect(rows[0].selling_price).toBe(100)
    })

    it("GET: detects low stock correctly", async () => {
      const rows = await query(`
        SELECT p.id, p.name, p.stock_level, p.low_stock_threshold,
          CASE
            WHEN p.notify_low_stock = TRUE AND p.stock_level < p.low_stock_threshold
            THEN TRUE ELSE FALSE
          END as is_low_stock
        FROM products p
        WHERE p.id = $1
      `, [TEST_PRODUCT_ID_2])

      expect(rows[0].is_low_stock).toBe(1) // stock 0 < threshold 10
    })

    it("GET: ILIKE search works (converted to LIKE)", async () => {
      const rows = await query(`
        SELECT p.* FROM products p
        WHERE (p.name ILIKE $1 OR p.barcode ILIKE $1)
      `, ["%test%"])

      expect(rows.length).toBeGreaterThanOrEqual(2)
    })

    it("POST: INSERT RETURNING returns created product with all fields", async () => {
      await transaction(async (client) => {
        const res = await client.query(`
          INSERT INTO products
            (id, name, barcode, selling_price, cost_price, stock_level, unit_type, category_id, tax_category, supplier_type, pos_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *
        `, [crypto.randomUUID(), "Temp Product", "TEMP001", 50, 30, 10, "QUANTITY", TEST_CATEGORY_ID, "VATABLE", "WHOLESALER", TEST_POS_ID])

        const product = res.rows[0]

        // Verify shape
        expect(product).toHaveProperty("id")
        expect(product.id).toMatch(/^[0-9a-f-]{36}$/) // UUID format
        expect(product.name).toBe("Temp Product")
        expect(typeof product.selling_price).toBe("number")
        expect(product.is_synced).toBe(0) // SQLite returns 0 for false
        expect(product).toHaveProperty("created_at")
        expect(product).toHaveProperty("updated_at")

        throw new Error("rollback") // Don't actually insert
      }).catch((e) => {
        if (e.message !== "rollback") throw e
      })
    })
  })

  // =====================================================
  // Transactions Queries (from app/api/transactions/route.ts)
  // =====================================================
  describe("Transactions", () => {
    it("GET: lists transactions with item count", async () => {
      const rows = await query(`
        SELECT t.*, COUNT(ti.id) as item_count
        FROM transactions t
        LEFT JOIN transaction_items ti ON t.id = ti.transaction_id
        WHERE t.id = $1
        GROUP BY t.id
      `, [TEST_TRANSACTION_ID])

      expect(rows).toHaveLength(1)
      expect(rows[0].invoice_number).toBe("SI-000099")
      expect(typeof rows[0].net_sales).toBe("number")
      expect(rows[0].net_sales).toBe(200)
      expect(rows[0].item_count).toBe(1)
    })

    it("GET: date filter with ::timestamp cast works", async () => {
      const rows = await query(`
        SELECT t.id FROM transactions t
        WHERE t.created_at >= $1::timestamp
        AND t.id = $2
      `, ["2020-01-01", TEST_TRANSACTION_ID])

      expect(rows).toHaveLength(1)
    })

    it("invoice number increment with type cast", async () => {
      // This is the critical query: (value::int + 1)::text
      const result = await transaction(async (client) => {
        // Get current value
        const before = await client.query(
          "SELECT value FROM settings WHERE key = 'next_invoice_number'"
        )
        const beforeVal = parseInt(before.rows[0].value)

        // Increment
        const res = await client.query(
          "UPDATE settings SET value = (value::int + 1)::text WHERE key = 'next_invoice_number' RETURNING value"
        )
        const afterVal = parseInt(res.rows[0].value)
        expect(afterVal).toBe(beforeVal + 1)

        // Reset back
        await client.query(
          "UPDATE settings SET value = $1 WHERE key = 'next_invoice_number'",
          [String(beforeVal)]
        )

        return { beforeVal, afterVal }
      })

      expect(result.afterVal).toBe(result.beforeVal + 1)
    })
  })

  // =====================================================
  // Transaction Items (generated column)
  // =====================================================
  describe("Transaction Items", () => {
    it("GENERATED ALWAYS AS profit column computes correctly", async () => {
      const rows = await query(`
        SELECT price_at_sale, cost_at_sale, quantity_sold, profit
        FROM transaction_items
        WHERE transaction_id = $1
      `, [TEST_TRANSACTION_ID])

      expect(rows).toHaveLength(1)
      const item = rows[0]
      // profit = (price_at_sale - cost_at_sale) * quantity_sold = (100 - 80) * 2 = 40
      expect(item.profit).toBe(40)
    })
  })

  // =====================================================
  // Dashboard Metrics (most complex queries)
  // =====================================================
  describe("Dashboard Metrics", () => {
    it("sales aggregation with CASE WHEN date filters", async () => {
      const rows = await query(`
        SELECT
          SUM(CASE WHEN created_at >= $1 AND created_at <= $2 THEN net_sales ELSE 0 END) as current_sales,
          SUM(CASE WHEN created_at >= $3 AND created_at < $1 THEN net_sales ELSE 0 END) as previous_sales
        FROM transactions
        WHERE status = 'PAID'
      `, ["2020-01-01", "2099-12-31", "2019-01-01"])

      expect(rows).toHaveLength(1)
      expect(typeof parseFloat(rows[0].current_sales)).toBe("number")
    })

    it("cash exposure CTE with JOINs and subqueries", async () => {
      const rows = await query(`
        SELECT
          COALESCE(SUM(s.opening_fund), 0) +
          COALESCE((
            SELECT SUM(t.net_sales)
            FROM transactions t
            JOIN shifts s ON t.pos_id = s.pos_id AND t.created_at >= s.start_time
            WHERE s.status = 'OPEN' AND t.payment_method = 'CASH' AND t.status = 'PAID'
          ), 0) +
          COALESCE((
            SELECT SUM(cm.amount)
            FROM cash_movements cm
            JOIN shifts s ON cm.shift_id = s.id
            WHERE s.status = 'OPEN' AND cm.type = 'CASH_IN'
          ), 0) -
          COALESCE((
            SELECT SUM(cm.amount)
            FROM cash_movements cm
            JOIN shifts s ON cm.shift_id = s.id
            WHERE s.status = 'OPEN' AND (cm.type = 'CASH_OUT' OR cm.type = 'SAFE_DROP')
          ), 0) as total_exposure
        FROM shifts s
        WHERE s.status = 'OPEN'
      `)

      expect(rows).toHaveLength(1)
      const exposure = parseFloat(rows[0].total_exposure || "0")
      expect(typeof exposure).toBe("number")
    })

    it("EXTRACT DOW and HOUR from timestamp", async () => {
      const rows = await query(`
        SELECT
          EXTRACT(DOW FROM created_at) as day_of_week,
          EXTRACT(HOUR FROM created_at) as hour_of_day,
          COUNT(*) as volume
        FROM transactions
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day_of_week, hour_of_day
        ORDER BY day_of_week, hour_of_day
      `)

      // Verify shape (may be empty if test data is old)
      if (rows.length > 0) {
        expect(typeof parseInt(rows[0].day_of_week)).toBe("number")
        expect(typeof parseInt(rows[0].hour_of_day)).toBe("number")
        expect(parseInt(rows[0].day_of_week)).toBeGreaterThanOrEqual(0)
        expect(parseInt(rows[0].day_of_week)).toBeLessThanOrEqual(6)
        expect(parseInt(rows[0].hour_of_day)).toBeGreaterThanOrEqual(0)
        expect(parseInt(rows[0].hour_of_day)).toBeLessThanOrEqual(23)
      }
    })

    it("inventory health with conditional COUNT", async () => {
      const rows = await query(`
        SELECT
          COUNT(*) as total_products,
          COUNT(CASE WHEN stock_level <= 0 THEN 1 END) as out_of_stock,
          COUNT(CASE WHEN stock_level > 0 AND stock_level <= low_stock_threshold THEN 1 END) as low_stock
        FROM products
      `)

      expect(rows).toHaveLength(1)
      const total = rows[0].total_products
      const oos = rows[0].out_of_stock
      expect(total).toBeGreaterThanOrEqual(2) // Our 2 test products
      expect(oos).toBeGreaterThanOrEqual(1) // Product B has stock 0
    })

    it("staff risk matrix with LEFT JOINs and aggregations", async () => {
      const rows = await query(`
        SELECT
          u.id as cashier_id,
          u.full_name as name,
          COALESCE(COUNT(DISTINCT v.id), 0) as void_count,
          COALESCE(SUM(ABS(s.variance)), 0) as cash_variance
        FROM users u
        LEFT JOIN voids v ON v.cashier_id = u.id AND v.occurred_at >= $1 AND v.occurred_at <= $2
        LEFT JOIN shifts s ON s.user_id = u.id AND s.status = 'CLOSED' AND s.end_time >= $1 AND s.end_time <= $2
        WHERE u.role IN ('CASHIER', 'MANAGER', 'ADMIN', 'OWNER')
        GROUP BY u.id, u.full_name
        ORDER BY (COALESCE(COUNT(DISTINCT v.id), 0) * 10 + COALESCE(SUM(ABS(s.variance)), 0)) DESC
        LIMIT 5
      `, ["2020-01-01", "2099-12-31"])

      expect(Array.isArray(rows)).toBe(true)
      if (rows.length > 0) {
        expect(rows[0]).toHaveProperty("cashier_id")
        expect(rows[0]).toHaveProperty("name")
        expect(rows[0]).toHaveProperty("void_count")
        expect(rows[0]).toHaveProperty("cash_variance")
      }
    })
  })

  // =====================================================
  // Customer Queries
  // =====================================================
  describe("Customers", () => {
    it("LIKE search for customer name and phone", async () => {
      const rows = await query(`
        SELECT * FROM customers
        WHERE
          full_name LIKE $1
          OR phone_number LIKE $1
        ORDER BY last_visit_at DESC NULLS LAST, total_spend DESC, full_name ASC
        LIMIT 20
      `, ["%Juan%"])

      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0].full_name).toBe("Juan Dela Cruz")
    })

    it("customer payment with balance update and CASE", async () => {
      await transaction(async (client) => {
        const res = await client.query(`
          UPDATE customers
          SET current_debt_balance = current_debt_balance - $1,
              last_payment_date = NOW(),
              credit_status = CASE
                WHEN (current_debt_balance - $1) <= credit_limit AND credit_status = 'BLOCKED' THEN 'ACTIVE'
                ELSE credit_status
              END,
              updated_at = NOW()
          WHERE id = $2
          RETURNING current_debt_balance, credit_status
        `, [100, TEST_CUSTOMER_ID])

        expect(res.rows).toHaveLength(1)
        const newBalance = Number(res.rows[0].current_debt_balance)
        // Was 1000, paid 100, should be 900
        expect(newBalance).toBe(900)
        expect(res.rows[0].credit_status).toBe("ACTIVE")

        throw new Error("rollback") // Don't persist
      }).catch((e) => {
        if (e.message !== "rollback") throw e
      })
    })
  })

  // =====================================================
  // Shifts & Cash Movements
  // =====================================================
  describe("Shifts", () => {
    it("sales by payment method for shift close", async () => {
      const shift = await queryOne("SELECT * FROM shifts WHERE id = $1", [TEST_SHIFT_ID])
      expect(shift).not.toBeNull()

      const rows = await query(`
        SELECT payment_method, COALESCE(SUM(net_sales), 0) as total
        FROM transactions
        WHERE created_at >= $1 AND status = 'PAID'
        GROUP BY payment_method
      `, [shift!.start_time])

      expect(Array.isArray(rows)).toBe(true)
    })

    it("cash movements aggregation by type", async () => {
      const rows = await query(
        "SELECT type, SUM(amount) as total FROM cash_movements WHERE shift_id = $1 GROUP BY type",
        [TEST_SHIFT_ID]
      )

      expect(rows.length).toBeGreaterThanOrEqual(1)
      const cashIn = rows.find((r: any) => r.type === "CASH_IN")
      expect(cashIn).toBeDefined()
      expect(parseFloat(cashIn.total)).toBe(200)
    })
  })

  // =====================================================
  // Credit Dashboard Queries
  // =====================================================
  describe("Credit Dashboard", () => {
    it("overdue detection query", async () => {
      const rows = await query(`
        SELECT id, full_name, current_debt_balance, credit_status, last_payment_date
        FROM customers
        WHERE credit_status = 'ACTIVE'
        AND current_debt_balance > 0
      `)

      expect(rows.length).toBeGreaterThanOrEqual(1)
    })

    it("credit ledger with running balance", async () => {
      // Insert a test ledger entry
      await query(`
        INSERT INTO credit_ledger (id, customer_id, entry_type, amount, running_balance, pos_id)
        VALUES ($1, $2, 'CHARGE', 500.00, 1500.00, $3)
      `, [crypto.randomUUID(), TEST_CUSTOMER_ID, TEST_POS_ID])

      const rows = await query(`
        SELECT cl.*, c.full_name as customer_name
        FROM credit_ledger cl
        JOIN customers c ON cl.customer_id = c.id
        WHERE cl.customer_id = $1
        ORDER BY cl.occurred_at DESC
      `, [TEST_CUSTOMER_ID])

      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0].customer_name).toBe("Juan Dela Cruz")
      expect(typeof Number(rows[0].running_balance)).toBe("number")
    })
  })

  // =====================================================
  // Settings (type cast critical path)
  // =====================================================
  describe("Settings", () => {
    it("reads all settings", async () => {
      const rows = await query("SELECT key, value FROM settings ORDER BY key")
      expect(rows.length).toBeGreaterThanOrEqual(1)
      const keys = rows.map((r: any) => r.key)
      expect(keys).toContain("business_name")
      expect(keys).toContain("next_invoice_number")
    })

    it("ON CONFLICT DO NOTHING for settings upsert", async () => {
      // This should not throw
      await query(`
        INSERT INTO settings (key, value) VALUES ($1, $2)
        ON CONFLICT (key) DO NOTHING
      `, ["business_name", "should_not_overwrite"])

      const row = await queryOne("SELECT value FROM settings WHERE key = $1", ["business_name"])
      expect(row!.value).not.toBe("should_not_overwrite")
    })
  })

  // =====================================================
  // Sync Compatibility (is_synced flag)
  // =====================================================
  describe("Sync Compatibility", () => {
    it("is_synced defaults to 0 on insert", async () => {
      const product = await queryOne("SELECT is_synced FROM products WHERE id = $1", [TEST_PRODUCT_ID])
      expect(product!.is_synced).toBe(0)
    })

    it("is_synced resets to 0 on update (via trigger)", async () => {
      // First set it to 1 manually
      await query("UPDATE products SET is_synced = 1 WHERE id = $1", [TEST_PRODUCT_ID])

      // Now update a field — trigger should reset is_synced to 0
      await query("UPDATE products SET name = 'Test Product A Updated' WHERE id = $1", [TEST_PRODUCT_ID])

      const product = await queryOne("SELECT is_synced, name FROM products WHERE id = $1", [TEST_PRODUCT_ID])
      expect(product!.is_synced).toBe(0)

      // Reset name
      await query("UPDATE products SET name = 'Test Product A' WHERE id = $1", [TEST_PRODUCT_ID])
    })

    it("pending sync count query works", async () => {
      const result = await query("SELECT COUNT(*) as cnt FROM transactions WHERE is_synced = 0")
      expect(result).toHaveLength(1)
      expect(result[0].cnt).toBeGreaterThanOrEqual(0)
    })

    it("pos_id is preserved on all syncable tables", async () => {
      const product = await queryOne("SELECT pos_id FROM products WHERE id = $1", [TEST_PRODUCT_ID])
      expect(product!.pos_id).toBe(TEST_POS_ID)

      const shift = await queryOne("SELECT pos_id FROM shifts WHERE id = $1", [TEST_SHIFT_ID])
      expect(shift!.pos_id).toBe(TEST_POS_ID)

      const tx = await queryOne("SELECT pos_id FROM transactions WHERE id = $1", [TEST_TRANSACTION_ID])
      expect(tx!.pos_id).toBe(TEST_POS_ID)
    })
  })

  // =====================================================
  // Financial Precision
  // =====================================================
  describe("Financial Precision", () => {
    it("arithmetic preserves precision", async () => {
      const rows = await query(`
        SELECT
          100.00 + 200.50 as sum,
          100.00 * 0.12 as vat,
          1000.00 / 1.12 as net_of_vat
      `)

      expect(rows[0].sum).toBe(300.5)
      expect(rows[0].vat).toBeCloseTo(12, 2)
      // 1000 / 1.12 = 892.857142...
      expect(rows[0].net_of_vat).toBeCloseTo(892.86, 1)
    })

    it("SUM of columns returns correct totals", async () => {
      const rows = await query(`
        SELECT SUM(net_sales) as total_sales, SUM(vat_amount) as total_vat
        FROM transactions
        WHERE id = $1
      `, [TEST_TRANSACTION_ID])

      expect(rows[0].total_sales).toBe(200)
      expect(rows[0].total_vat).toBeCloseTo(21.43, 2)
    })
  })
})
