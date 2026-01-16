export interface CreditStats {
  totalReceivables: number
  overdueAmount: number
  collectionRate: number
  totalDebtors: number
  blockedCount: number
}

export interface CollectionLog {
  id: string
  customer_id: string
  note: string
  created_at: string
  user_name?: string
}

export interface CustomerCreditSummary {
  id: string
  full_name: string
  current_debt_balance: number
  credit_limit: number
  credit_status: "ACTIVE" | "BLOCKED" | "OVERDUE"
  last_payment_date: string | null
  last_visit_at: string | null
  phone_number: string | null
}

export interface LedgerEntry {
  id: string
  customer_id: string
  transaction_id?: string
  shift_id?: string
  entry_type: string
  amount: number
  running_balance: number
  occurred_at: string
  notes?: string
}
