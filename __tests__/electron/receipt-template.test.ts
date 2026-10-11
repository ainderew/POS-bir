/** @jest-environment node */

/**
 * electron/receipt-template.js unit tests: escaping, money formatting,
 * payload validation, and each receipt variant (sale, void, payment, statement).
 */
import {
  escapeHtml,
  formatMoney,
  formatQuantity,
  formatDate,
  resolveReceiptType,
  validateReceiptPayload,
  renderReceiptHtml,
} from "../../electron/receipt-template"

const NOW = new Date(2026, 9, 11, 14, 5, 9) // local time

/** Body text with tags stripped, entities decoded, whitespace collapsed. */
function text(html: string): string {
  const body = html.slice(html.indexOf("<body>"))
  return body
    .replace(/<\/(td|tr|div)>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
}

// Exactly what app/pos/page.tsx sends today (no type, price = line total).
const legacySale = {
  businessName: "Aling Nena's Store",
  address: "123 Rizal Ave, Manila",
  tin: "123-456-789-000",
  invoiceNumber: "SI-000042",
  items: [
    { name: "Coke 1.5L", quantity: 2, price: 130 },
    { name: "Rice (kg)", quantity: 1.25, price: 62.5 },
  ],
  vatableSales: 171.88,
  vatAmount: 20.62,
  vatExemptSales: 0,
  total: 192.5,
}

describe("escapeHtml", () => {
  it("escapes all HTML-significant characters", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;"
    )
  })

  it("renders null/undefined as empty and stringifies numbers", () => {
    expect(escapeHtml(null)).toBe("")
    expect(escapeHtml(undefined)).toBe("")
    expect(escapeHtml(12.5)).toBe("12.5")
  })
})

describe("formatMoney", () => {
  it.each([
    [0, "0.00"],
    [5, "5.00"],
    [1234.5, "1,234.50"],
    [1234567.891, "1,234,567.89"],
    [1.005, "1.01"],
    [0.1 + 0.2, "0.30"],
    [-192.5, "-192.50"],
    [-0.004, "0.00"],
    ["99.9", "99.90"],
  ])("formats %p as %p", (input, expected) => {
    expect(formatMoney(input)).toBe(expected)
  })

  it.each([NaN, Infinity, undefined, null, "", "abc", {}])("returns '' for %p", (input) => {
    expect(formatMoney(input)).toBe("")
  })
})

describe("formatQuantity / formatDate", () => {
  it("keeps integers and trims fractional weights to 3 dp", () => {
    expect(formatQuantity(2)).toBe("2")
    expect(formatQuantity(-3)).toBe("-3")
    expect(formatQuantity(1.25)).toBe("1.25")
    expect(formatQuantity(0.3333333)).toBe("0.333")
  })

  it("formats dates in local time, defaults to now, and passes junk through", () => {
    expect(formatDate(undefined, NOW)).toBe("2026-10-11 14:05:09")
    expect(formatDate(new Date(2026, 0, 2, 3, 4, 5), NOW)).toBe("2026-01-02 03:04:05")
    expect(formatDate("not a date", NOW)).toBe("not a date")
  })
})

describe("resolveReceiptType", () => {
  it("defaults to sale, honours explicit type, and detects legacy SOA payloads", () => {
    expect(resolveReceiptType(legacySale)).toBe("sale")
    expect(resolveReceiptType({ type: "void" })).toBe("void")
    expect(resolveReceiptType({ invoiceNumber: "SOA-123456" })).toBe("statement")
    expect(resolveReceiptType({ type: "sale", invoiceNumber: "SOA-1" })).toBe("sale")
  })
})

describe("validateReceiptPayload", () => {
  it("accepts the payloads callers send today", () => {
    expect(validateReceiptPayload(legacySale)).toBeNull()
  })

  it.each([
    [null, "Invalid receipt payload"],
    ["receipt", "Invalid receipt payload"],
    [[], "Invalid receipt payload"],
    [{ ...legacySale, type: "bogus" }, "Unknown receipt type: bogus"],
    [{ ...legacySale, items: undefined }, "Receipt items must be an array"],
    [{ ...legacySale, items: [] }, "Receipt has no items"],
    [{ ...legacySale, items: [null] }, "Item 1 is invalid"],
    [{ ...legacySale, items: [{ quantity: 1, price: 1 }] }, "Item 1 has no name"],
    [{ ...legacySale, items: [{ name: "x", price: 1 }] }, "Item 1 has no numeric quantity"],
    [{ ...legacySale, items: [{ name: "x", quantity: 1, price: NaN }] }, "Item 1 has no numeric price"],
    [{ ...legacySale, invoiceNumber: "" }, "Receipt requires an invoiceNumber"],
    [{ ...legacySale, total: NaN }, "Receipt requires a numeric total"],
    [{ type: "payment" }, "Payment receipt requires a numeric amountPaid"],
  ])("rejects %p", (payload, error) => {
    expect(validateReceiptPayload(payload)).toBe(error)
  })

  it("caps item count", () => {
    const items = Array.from({ length: 1001 }, () => ({ name: "x", quantity: 1, price: 1 }))
    expect(validateReceiptPayload({ ...legacySale, items })).toMatch(/too many items/)
  })

  it("allows a statement without items and a payment without total", () => {
    expect(validateReceiptPayload({ type: "statement", total: 0 })).toBeNull()
    expect(validateReceiptPayload({ type: "payment", amountPaid: 100 })).toBeNull()
  })
})

describe("renderReceiptHtml", () => {
  it("produces a static, script-free document for thermal paper", () => {
    const html = renderReceiptHtml(legacySale, { now: NOW })
    expect(html.startsWith("<!doctype html>")).toBe(true)
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain("default-src 'none'")
    expect(html).toContain("width:72mm")
    expect(html).toContain("monospace")
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/background/i)
  })

  it("renders a legacy sale receipt (price = line total)", () => {
    const out = text(renderReceiptHtml(legacySale, { now: NOW }))
    expect(out).toContain("Aling Nena's Store")
    expect(out).toContain("123 Rizal Ave, Manila")
    expect(out).toContain("VAT REG TIN: 123-456-789-000")
    expect(out).toContain("SALES INVOICE")
    expect(out).toContain("Invoice No SI-000042")
    expect(out).toContain("Date 2026-10-11 14:05:09")
    expect(out).toContain("Coke 1.5L 2 x 65.00 130.00")
    expect(out).toContain("Rice (kg) 1.25 x 50.00 62.50")
    expect(out).toContain("TOTAL 192.50")
    expect(out).toContain("VATable Sales 171.88")
    expect(out).toContain("VAT Amount 20.62")
    expect(out).toContain("VAT-Exempt Sales 0.00")
    expect(out).not.toContain("Zero-Rated") // not in payload -> omitted
  })

  it("renders every optional sale field when present", () => {
    const out = text(
      renderReceiptHtml(
        {
          ...legacySale,
          min: "MIN-001",
          serialNumber: "SN-9",
          ptuNumber: "PTU-77",
          headerLines: ["Branch 2"],
          date: new Date(2026, 4, 1, 8, 0, 0),
          cashier: "Maria",
          customerName: "Lolo Ben",
          scPwdId: "SC-555",
          items: [{ name: "Bread", quantity: 3, unitPrice: 10, lineTotal: 30 }],
          subtotal: 200,
          discount: 7.5,
          zeroRatedSales: 0,
          paymentMethod: "CASH",
          referenceNumber: "REF-1",
          amountTendered: 500,
          change: 307.5,
          footerLines: ["Come again!"],
        },
        { now: NOW }
      )
    )
    for (const expected of [
      "MIN: MIN-001",
      "S/N: SN-9",
      "PTU No: PTU-77",
      "Branch 2",
      "Date 2026-05-01 08:00:00",
      "Cashier Maria",
      "Customer Lolo Ben",
      "SC/PWD ID SC-555",
      "Bread 3 x 10.00 30.00",
      "Subtotal 200.00",
      "Less Discount 7.50",
      "Zero-Rated Sales 0.00",
      "Payment CASH",
      "Reference No REF-1",
      "Amount Tendered 500.00",
      "Change 307.50",
      "Thank you! Come again!",
    ]) {
      expect(out).toContain(expected)
    }
  })

  it("escapes every interpolated value", () => {
    const evil = `<img src=x onerror="alert(1)">`
    const html = renderReceiptHtml(
      {
        businessName: evil,
        address: evil,
        tin: evil,
        min: evil,
        headerLines: [evil],
        invoiceNumber: evil,
        date: evil,
        cashier: evil,
        customerName: evil,
        items: [{ name: evil, quantity: 1, price: 1 }],
        total: 1,
        paymentMethod: evil,
        referenceNumber: evil,
        footerLines: [evil],
      },
      { now: NOW }
    )
    expect(html).not.toContain("<img")
    expect(html).not.toContain('"alert(1)"')
    // 13 interpolated fields; each must appear escaped
    expect(html.split("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;").length - 1).toBe(13)
  })

  it("does not double-label a TIN the caller already labelled", () => {
    const out = text(renderReceiptHtml({ ...legacySale, tin: "VAT REG TIN: 000-000-000-000" }, { now: NOW }))
    expect(out).toContain("VAT REG TIN: 000-000-000-000")
    expect(out).not.toContain("VAT REG TIN: VAT REG TIN")
  })

  it("renders a void slip", () => {
    const out = text(
      renderReceiptHtml(
        {
          type: "void",
          businessName: "Store",
          tin: "000-000-000-000",
          invoiceNumber: "CN-000043",
          originalInvoiceNumber: "SI-000042",
          reason: "Wrong item <scanned>",
          authorizedBy: "Manager Jose",
          items: [{ name: "Coke 1.5L", quantity: -2, unitPrice: 65, lineTotal: -130 }],
          vatableSales: -116.07,
          vatAmount: -13.93,
          vatExemptSales: 0,
          total: -130,
          paymentMethod: "GCASH",
        },
        { now: NOW }
      )
    )
    expect(out).toContain("*** VOID ***")
    expect(out).toContain("VOID SLIP")
    expect(out).toContain("Void Ref No CN-000043")
    expect(out).toContain("Orig. Invoice SI-000042")
    expect(out).toContain("Authorized By Manager Jose")
    expect(out).toContain("Reason: Wrong item <scanned>")
    expect(out).toContain("Coke 1.5L -2 x 65.00 -130.00")
    expect(out).toContain("TOTAL VOIDED -130.00")
    expect(out).toContain("VATable Sales -116.07")
    expect(out).toContain("VAT Amount -13.93")
    expect(out).toContain("Orig. Payment GCASH")
    expect(out).not.toContain("SALES INVOICE")
  })

  it("renders a payment receipt", () => {
    const out = text(
      renderReceiptHtml(
        {
          type: "payment",
          businessName: "Store",
          invoiceNumber: "PR-000007",
          customerName: "Juan Dela Cruz",
          previousBalance: 1500,
          amountPaid: 1000,
          newBalance: 500,
          paymentMethod: "CASH",
          amountTendered: 1000,
          change: 0,
        },
        { now: NOW }
      )
    )
    expect(out).toContain("PAYMENT RECEIPT")
    expect(out).toContain("Receipt No PR-000007")
    expect(out).toContain("Customer Juan Dela Cruz")
    expect(out).toContain("Previous Balance 1,500.00")
    expect(out).toContain("AMOUNT PAID 1,000.00")
    expect(out).toContain("Remaining Balance 500.00")
    expect(out).toContain("Payment CASH")
    expect(out).toContain("THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX")
    expect(out).not.toContain("SALES INVOICE")
  })

  it("renders the legacy SOA payload from credit-table as a statement", () => {
    const out = text(
      renderReceiptHtml(
        {
          businessName: "GENERAL STORE POS",
          address: "Statement of Account",
          tin: "Customer: Juan Dela Cruz",
          invoiceNumber: "SOA-123456",
          items: [{ name: "10/1/2026 - SI-000040", quantity: 1, price: 250 }],
          vatableSales: 0,
          vatAmount: 0,
          vatExemptSales: 0,
          total: 2500,
        },
        { now: NOW }
      )
    )
    expect(out).toContain("STATEMENT OF ACCOUNT")
    expect(out).toContain("Customer: Juan Dela Cruz")
    expect(out).toContain("SOA No SOA-123456")
    expect(out).toContain("10/1/2026 - SI-000040 1 x 250.00 250.00")
    expect(out).toContain("BALANCE DUE 2,500.00")
    expect(out).toContain("THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX")
    expect(out).not.toContain("SALES INVOICE")
    expect(out).not.toContain("VATable")
  })

  it("does not throw on minimal or malformed payloads", () => {
    expect(() => renderReceiptHtml({ invoiceNumber: "SI-1", items: [{ name: "x", quantity: 1, price: 1 }], total: 1 })).not.toThrow()
    expect(() => renderReceiptHtml({ type: "void", invoiceNumber: "CN-1", items: [], total: 0 })).not.toThrow()
    expect(() => renderReceiptHtml({ type: "payment", amountPaid: 1 })).not.toThrow()
    expect(() => renderReceiptHtml({ type: "statement", total: 0 })).not.toThrow()
    expect(() => renderReceiptHtml(null)).not.toThrow()
    expect(() => renderReceiptHtml({ items: "nope", headerLines: "nope", footerLines: 5, total: "x" })).not.toThrow()
    expect(() => renderReceiptHtml({ items: [{ name: "x", quantity: 0, price: 5 }], total: 5 })).not.toThrow()

    const minimal = text(renderReceiptHtml({ invoiceNumber: "SI-1", items: [{ name: "x", quantity: 1, price: 1 }], total: 1 }, { now: NOW }))
    expect(minimal).not.toMatch(/undefined|null|NaN/)
  })
})

describe("SC/PWD totals add up on paper", () => {
  it("prints Subtotal, Less VAT and Less Discount on a sale, and omits Less VAT when absent", () => {
    const sale = text(renderReceiptHtml({
      type: "sale", invoiceNumber: "SI-000009", items: [{ name: "Rice", quantity: 1, lineTotal: 100 }],
      subtotal: 100, lessVat: 10.71, discount: 17.86, total: 71.43,
    }, { now: NOW }))
    expect(sale).toMatch(/Subtotal\s*100\.00/)
    expect(sale).toMatch(/Less VAT \(SC\/PWD\)\s*10\.71/)
    expect(sale).toMatch(/Less Discount\s*17\.86/)

    const regular = text(renderReceiptHtml({
      type: "sale", invoiceNumber: "SI-000010", items: [{ name: "Rice", quantity: 1, lineTotal: 100 }], subtotal: 100, total: 100,
    }, { now: NOW }))
    expect(regular).not.toMatch(/Less VAT/)
  })

  it("prints the reversed Less VAT and discount on a void slip", () => {
    const slip = text(renderReceiptHtml({
      type: "void", invoiceNumber: "CN-000001", items: [{ name: "Rice", quantity: -1, lineTotal: -100 }],
      lessVat: -10.71, discount: -17.86, total: -71.43,
    }, { now: NOW }))
    expect(slip).toMatch(/Less VAT \(SC\/PWD\)\s*-10\.71/)
    expect(slip).toMatch(/Less Discount\s*-17\.86/)
  })
})
