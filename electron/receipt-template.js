'use strict';

/**
 * Pure receipt -> HTML renderer for thermal printers (58mm / 80mm).
 *
 * CommonJS so electron/main.js can require it; no Electron or Node APIs are
 * used, so it is unit-testable from Jest. Every interpolated value goes
 * through escapeHtml(); money is always rendered to 2 decimal places.
 *
 * Payload contract (see lib/electron.d.ts for the TypeScript view):
 *   type?: 'sale' | 'void' | 'payment' | 'statement'   (default 'sale')
 *   header: businessName, address, tin, min, serialNumber, ptuNumber, headerLines[]
 *   meta:   invoiceNumber, date, cashier, footerLines[]
 *   items:  [{ name, quantity, unitPrice?, lineTotal?, price? }]
 *           `price` is the legacy field and means the LINE TOTAL (that is what
 *           every caller sends today); unitPrice falls back to lineTotal / qty.
 */

const RECEIPT_TYPES = ['sale', 'void', 'payment', 'statement'];
const MAX_ITEMS = 1000;

const NOT_VALID_FOR_INPUT_TAX = 'THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX';

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Coerce numbers and numeric strings; anything else (incl. NaN) -> null. */
function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** 1234.5 -> "1,234.50", -0.004 -> "0.00". Returns '' for non-numeric input. */
function formatMoney(value) {
  const n = toNumber(value);
  if (n === null) return '';
  // toPrecision(15) strips binary noise so 1.005 rounds to 1.01, not 1.00.
  const cents = Math.round(Number((Math.abs(n) * 100).toPrecision(15)));
  const whole = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = String(cents % 100).padStart(2, '0');
  return (n < 0 && cents > 0 ? '-' : '') + whole + '.' + frac;
}

/** Integer quantities as-is; weights up to 3 dp with trailing zeros trimmed. */
function formatQuantity(value) {
  const n = toNumber(value);
  if (n === null) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Local time "YYYY-MM-DD HH:mm:ss". Unparseable strings are printed verbatim. */
function formatDate(value, now) {
  const source = value === undefined || value === null || value === '' ? now : value;
  const d = source instanceof Date ? source : new Date(source);
  if (Number.isNaN(d.getTime())) return String(source);
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  );
}

function hasText(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Explicit `type` wins. Legacy payloads have no type: the credit table's
 * Statement of Account is recognised by its "SOA-" number so it is never
 * printed under a SALES INVOICE title; everything else is a sale.
 */
function resolveReceiptType(data) {
  if (isPlainObject(data) && hasText(data.type)) return String(data.type);
  if (isPlainObject(data) && /^SOA-/i.test(String(data.invoiceNumber || ''))) return 'statement';
  return 'sale';
}

function itemLineTotal(item) {
  const lineTotal = toNumber(item.lineTotal);
  if (lineTotal !== null) return lineTotal;
  const legacy = toNumber(item.price);
  if (legacy !== null) return legacy;
  const unit = toNumber(item.unitPrice);
  const qty = toNumber(item.quantity);
  return unit !== null && qty !== null ? unit * qty : null;
}

function itemUnitPrice(item) {
  const unit = toNumber(item.unitPrice);
  if (unit !== null) return unit;
  const total = itemLineTotal(item);
  const qty = toNumber(item.quantity);
  return total !== null && qty ? Math.abs(total / qty) : null;
}

/** Returns null when the payload can be printed, otherwise a short reason. */
function validateReceiptPayload(data) {
  if (!isPlainObject(data)) return 'Invalid receipt payload';

  const type = resolveReceiptType(data);
  if (!RECEIPT_TYPES.includes(type)) {
    return `Unknown receipt type: ${type.slice(0, 32)}`;
  }

  if (type === 'payment') {
    if (toNumber(data.amountPaid) === null) return 'Payment receipt requires a numeric amountPaid';
    return null;
  }

  const itemsRequired = type === 'sale' || type === 'void';
  if (data.items !== undefined || itemsRequired) {
    if (!Array.isArray(data.items)) return 'Receipt items must be an array';
    if (itemsRequired && data.items.length === 0) return 'Receipt has no items';
    if (data.items.length > MAX_ITEMS) return `Receipt has too many items (max ${MAX_ITEMS})`;
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      if (!isPlainObject(item)) return `Item ${i + 1} is invalid`;
      if (!hasText(item.name)) return `Item ${i + 1} has no name`;
      if (toNumber(item.quantity) === null) return `Item ${i + 1} has no numeric quantity`;
      if (itemLineTotal(item) === null) return `Item ${i + 1} has no numeric price`;
    }
  }

  if ((type === 'sale' || type === 'void') && !hasText(data.invoiceNumber)) {
    return 'Receipt requires an invoiceNumber';
  }
  if (toNumber(data.total) === null) return 'Receipt requires a numeric total';
  return null;
}

// ---------------------------------------------------------------------------
// HTML fragments. Every helper escapes its own inputs.

function line(text, cls) {
  return `<div class="${cls || 'c'}">${escapeHtml(text)}</div>`;
}

function rule() {
  return '<hr>';
}

/** Label/value row; skipped when value is missing. `money` formats the value. */
function row(label, value, opts) {
  const o = opts || {};
  const shown = o.money ? formatMoney(value) : hasText(value) ? String(value) : '';
  if (shown === '') return '';
  const cls = o.strong ? ' class="b lg"' : '';
  // Money never wraps; free text (names, references) may wrap on 58mm paper.
  const valueCls = o.money ? 'r' : 'r w';
  return `<tr${cls}><td>${escapeHtml(label)}</td><td class="${valueCls}">${escapeHtml(shown)}</td></tr>`;
}

function table(rows) {
  const body = rows.filter(Boolean).join('');
  return body ? `<table>${body}</table>` : '';
}

function tinLine(tin) {
  const s = String(tin).trim();
  // Bare numbers get the BIR label; pre-labelled strings are printed as given.
  return /^[0-9][0-9\s-]*$/.test(s) ? `VAT REG TIN: ${s}` : s;
}

function renderHeader(data) {
  const parts = [];
  if (hasText(data.businessName)) parts.push(line(data.businessName, 'c b lg'));
  if (hasText(data.address)) parts.push(line(data.address));
  if (hasText(data.tin)) parts.push(line(tinLine(data.tin)));
  if (hasText(data.min)) parts.push(line(`MIN: ${data.min}`));
  if (hasText(data.serialNumber)) parts.push(line(`S/N: ${data.serialNumber}`));
  if (hasText(data.ptuNumber)) parts.push(line(`PTU No: ${data.ptuNumber}`));
  if (Array.isArray(data.headerLines)) {
    data.headerLines.filter(hasText).forEach((l) => parts.push(line(l)));
  }
  return parts.join('');
}

function renderItems(items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  const rows = items.map((item) => {
    const qty = formatQuantity(item.quantity);
    const unit = formatMoney(itemUnitPrice(item));
    const detail = unit ? `${qty} x ${unit}` : qty;
    return (
      `<tr><td colspan="2" class="name">${escapeHtml(item.name)}</td></tr>` +
      `<tr><td class="ind">${escapeHtml(detail)}</td>` +
      `<td class="r">${escapeHtml(formatMoney(itemLineTotal(item)))}</td></tr>`
    );
  });
  return `<table>${rows.join('')}</table>`;
}

function renderVatBreakdown(data) {
  return table([
    row('VATable Sales', data.vatableSales, { money: true }),
    row('VAT Amount', data.vatAmount, { money: true }),
    row('VAT-Exempt Sales', data.vatExemptSales, { money: true }),
    row('Zero-Rated Sales', data.zeroRatedSales, { money: true }),
  ]);
}

function renderFooter(data, defaults) {
  const lines = (defaults || []).slice();
  if (Array.isArray(data.footerLines)) lines.push(...data.footerLines.filter(hasText));
  else if (hasText(data.footer)) lines.push(data.footer);
  return lines.length ? rule() + lines.map((l) => line(l)).join('') : '';
}

function section(html) {
  return html ? rule() + html : '';
}

function renderSale(data, now) {
  return [
    renderHeader(data),
    rule(),
    line('SALES INVOICE', 'c b'),
    table([
      row('Invoice No', data.invoiceNumber),
      row('Date', formatDate(data.date, now)),
      row('Cashier', data.cashier),
      row('Customer', data.customerName),
      row('SC/PWD ID', data.scPwdId),
    ]),
    section(renderItems(data.items)),
    rule(),
    table([
      row('Subtotal', data.subtotal, { money: true }),
      row('Less VAT (SC/PWD)', data.lessVat, { money: true }),
      row('Less Discount', data.discount, { money: true }),
      row('TOTAL', data.total, { money: true, strong: true }),
    ]),
    section(renderVatBreakdown(data)),
    section(
      table([
        row('Payment', data.paymentMethod),
        row('Reference No', data.referenceNumber),
        row('Amount Tendered', data.amountTendered, { money: true }),
        row('Change', data.change, { money: true }),
      ])
    ),
    renderFooter(data, ['Thank you!']),
  ].join('');
}

function renderVoid(data, now) {
  return [
    renderHeader(data),
    rule(),
    line('*** VOID ***', 'c b lg'),
    line('VOID SLIP', 'c b'),
    table([
      row('Void Ref No', data.invoiceNumber),
      row('Orig. Invoice', data.originalInvoiceNumber),
      row('Date', formatDate(data.date, now)),
      row('Cashier', data.cashier),
      row('Authorized By', data.authorizedBy),
    ]),
    hasText(data.reason) ? line(`Reason: ${data.reason}`, 'l') : '',
    section(renderItems(data.items)),
    rule(),
    table([
      row('Less VAT (SC/PWD)', data.lessVat, { money: true }),
      row('Less Discount', data.discount, { money: true }),
      row('TOTAL VOIDED', data.total, { money: true, strong: true }),
    ]),
    section(renderVatBreakdown(data)),
    section(table([row('Orig. Payment', data.paymentMethod)])),
    renderFooter(data, []),
  ].join('');
}

function renderPayment(data, now) {
  return [
    renderHeader(data),
    rule(),
    line('PAYMENT RECEIPT', 'c b'),
    table([
      row('Receipt No', data.invoiceNumber),
      row('Date', formatDate(data.date, now)),
      row('Cashier', data.cashier),
      row('Customer', data.customerName),
    ]),
    rule(),
    table([
      row('Previous Balance', data.previousBalance, { money: true }),
      row('AMOUNT PAID', data.amountPaid, { money: true, strong: true }),
      row('Remaining Balance', data.newBalance, { money: true }),
    ]),
    section(
      table([
        row('Payment', data.paymentMethod),
        row('Reference No', data.referenceNumber),
        row('Amount Tendered', data.amountTendered, { money: true }),
        row('Change', data.change, { money: true }),
      ])
    ),
    renderFooter(data, [NOT_VALID_FOR_INPUT_TAX, 'Thank you!']),
  ].join('');
}

function renderStatement(data, now) {
  return [
    renderHeader(data),
    rule(),
    line('STATEMENT OF ACCOUNT', 'c b'),
    table([
      row('SOA No', data.invoiceNumber),
      row('Date', formatDate(data.date, now)),
      row('Customer', data.customerName),
    ]),
    section(renderItems(data.items)),
    rule(),
    table([row('BALANCE DUE', data.total, { money: true, strong: true })]),
    renderFooter(data, [NOT_VALID_FOR_INPUT_TAX]),
  ].join('');
}

const RENDERERS = {
  sale: renderSale,
  void: renderVoid,
  payment: renderPayment,
  statement: renderStatement,
};

const STYLES = [
  '@page{margin:0}',
  '*{box-sizing:border-box}',
  'html,body{margin:0;padding:0;color:#000}',
  // 72mm fits 80mm rolls; max-width lets 58mm rolls (~48mm printable) shrink to fit.
  'body{width:72mm;max-width:100%;font-family:"Courier New",Courier,monospace;font-size:12px;line-height:1.25}',
  '.c{text-align:center}.l{text-align:left}.r{text-align:right;white-space:nowrap;padding-left:4px}',
  '.b{font-weight:bold}.lg{font-size:14px}',
  '.w{white-space:normal;word-break:break-word}.name{word-break:break-word}.ind{padding-left:8px}',
  'hr{border:0;border-top:1px dashed #000;margin:4px 0}',
  'table{width:100%;border-collapse:collapse}td{padding:0;vertical-align:top}',
].join('');

/**
 * @param {unknown} data receipt payload (validate with validateReceiptPayload first)
 * @param {{ now?: Date }} [options] `now` is the fallback date (injectable for tests)
 * @returns {string} a complete HTML document
 */
function renderReceiptHtml(data, options) {
  const payload = isPlainObject(data) ? data : {};
  const now = (options && options.now) || new Date();
  const render = RENDERERS[resolveReceiptType(payload)] || renderSale;
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    // Static document: no scripts, no network, inline styles only.
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">` +
    `<title>Receipt</title><style>${STYLES}</style></head><body>` +
    render(payload, now) +
    '</body></html>'
  );
}

module.exports = {
  RECEIPT_TYPES,
  MAX_ITEMS,
  escapeHtml,
  formatMoney,
  formatQuantity,
  formatDate,
  resolveReceiptType,
  validateReceiptPayload,
  renderReceiptHtml,
};
