-- 006_init_ledger.sql

-- 1. Create Customers Table (since it doesn't exist yet)
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    contact_number VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    
    -- Credit Fields
    credit_limit DECIMAL(12,2) DEFAULT 0.00,
    current_debt_balance DECIMAL(12,2) DEFAULT 0.00,
    credit_status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (credit_status IN ('ACTIVE', 'BLOCKED', 'OVERDUE')),
    last_payment_date TIMESTAMPTZ,
    
    pos_id UUID, -- For syncing
    is_synced BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_credit_status ON customers(credit_status);

-- 2. The Credit Ledger
CREATE TABLE IF NOT EXISTS credit_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) NOT NULL,
    
    -- Link to specific interaction
    transaction_id UUID REFERENCES transactions(id),
    shift_id UUID REFERENCES shifts(id),
    
    -- The Movement
    entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('CHARGE', 'PAYMENT', 'ADJUSTMENT')),
    amount DECIMAL(12,2) NOT NULL,
    
    -- State after move
    running_balance DECIMAL(12,2) NOT NULL,
    
    occurred_at TIMESTAMPTZ DEFAULT NOW(),
    notes VARCHAR(255),
    
    pos_id UUID, -- For syncing context
    is_synced BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_ledger_customer ON credit_ledger(customer_id, occurred_at DESC);

-- Trigger for customers updated_at
-- (Assuming update_updated_at_column function already exists from 001_create_tables.sql or 004_consolidated)
DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
