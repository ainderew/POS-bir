export type UnitType = "QUANTITY" | "WEIGHT"
export type TaxCategory = "VATABLE" | "VAT_EXEMPT" | "ZERO_RATED"
export type SupplierType = "WHOLESALER" | "WET_MARKET" | "DIRECT_DELIVERY"

export interface SyncMetadata {
  pos_id: string
  is_synced: boolean
  updated_at: Date
  created_at: Date
}

export interface Category extends SyncMetadata {
  id: string
  name: string
}

export interface Product extends SyncMetadata {
  id: string
  name: string
  barcode: string | null
  selling_price: number
  cost_price: number
  stock_level: number
  unit_type: UnitType
  low_stock_threshold: number
  notify_low_stock: boolean
  category_id: string | null
  tax_category: TaxCategory
  supplier_type: SupplierType
  is_promo: boolean
  promo_price: number | null
  category_name?: string
  is_low_stock?: boolean
}

export interface Transaction {
  id: string
  invoice_number: string
  status: "PAID" | "VOIDED" | "REFUND"
  void_reason?: string
  authorized_by?: string
  pos_id: string
  is_synced: boolean
  created_at: Date
  
  gross_sales: number
  vatable_sales: number
  vat_amount: number
  vat_exempt_sales: number
  zero_rated_sales: number
  total_discount: number
  net_sales: number
  
  pax_count: number
  senior_count: number
  sc_pwd_id?: string
  sc_pwd_name?: string
  
  payment_method: string
  amount_tendered?: number
  change_amount?: number
  reference_number?: string
  item_count?: number
  void_authorized_by?: string
  voided_at?: Date
}

export interface TransactionItem {
  id: string
  transaction_id: string
  product_id: string
  quantity_sold: number
  price_at_sale: number
  cost_at_sale: number
  profit: number
  tax_category: TaxCategory
  pos_id: string
  is_synced: boolean
  created_at: Date
  product_name?: string
}

export interface CartItem {
  product: Product
  quantity: number
}

export interface FinancialReport {
  total_revenue: number
  total_profit: number
  total_transactions: number
  items: ProductReport[]
}

export interface ProductReport {
  product_id: string
  product_name: string
  total_quantity_sold: number
  total_revenue: number
  total_profit: number
}

export interface Settings {
  accumulated_grand_total: number
  next_invoice_number: number
  manager_pin: string
  business_name: string
  business_address: string
  business_tin: string
  vat_rate: number
  auto_print: boolean
}

export type UserRole = "ADMIN" | "CASHIER" | "MANAGER" | "OWNER"

export interface User {
  id: string
  full_name: string
  role: UserRole
  is_active: boolean
  created_at: Date
  updated_at: Date
  // Note: pin_hash is never exposed to frontend
}

export interface AuthResponse {
  success: boolean
  user?: User
  error?: string
}

export interface Terminal {
  id: string
  pos_id: string
  ptu_number: string
  serial_number: string
  current_state: "OPEN" | "CLOSED"
  accumulated_grand_total: number
  last_z_counter: number
  created_at: Date
  updated_at: Date
  is_synced: boolean
}

export type AuditActionType =
  | "USER_LOGIN"  // NEW - user authentication events
  | "SHIFT_OPEN"
  | "SHIFT_CLOSE"
  | "CASH_IN"
  | "CASH_OUT"
  | "SAFE_DROP"
  | "Z_READING"
  | "MANUAL_AUDIT"

export interface AuditLog {
  id: string
  user_id: string | null
  shift_id: string | null
  terminal_id: string | null
  action_type: AuditActionType
  audit_image: Buffer | null
  audit_metadata: Record<string, any>
  created_at: Date
  is_synced: boolean
}

export interface Shift {
  id: string
  pos_id: string
  status: "OPEN" | "CLOSED"
  start_time: Date
  end_time?: Date
  opening_fund: number
  theoretical_cash: number
  actual_cash: number
  theoretical_gcash?: number
  actual_gcash?: number
  theoretical_maya?: number
  actual_maya?: number
  theoretical_card?: number
  actual_card?: number
  variance: number
  is_synced: boolean
  user_id?: string  // NEW - links shift to authenticated user
  terminal_id?: string
  snapshot_z_counter?: number
  snapshot_accumulated_total?: number
}

export type CashMovementType = "CASH_IN" | "CASH_OUT" | "SAFE_DROP"

export interface CashMovement {
  id: string
  shift_id: string
  type: CashMovementType
  amount: number
  reason: string
  created_at: Date
  is_synced: boolean
}
