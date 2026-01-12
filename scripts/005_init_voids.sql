-- =====================================================
-- Void, Correction & Legacy Migration Module
-- Compliance Standard: Philippines BIR RMO 24-2023
-- =====================================================

-- 1. Update users table role constraint
-- Add 'OWNER' to the allowed roles
DO $$
BEGIN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check 
    CHECK (role IN ('ADMIN', 'CASHIER', 'MANAGER', 'OWNER'));
END $$;

-- 2. Update transactions table
-- Add columns for void tracking and authorization
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS status_new VARCHAR(20) DEFAULT 'PAID' CHECK (status_new IN ('PAID', 'VOIDED')),
ADD COLUMN IF NOT EXISTS void_reason VARCHAR(255),
ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS void_authorized_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(20) DEFAULT 'SALE' CHECK (transaction_type IN ('SALE', 'VOID_REFUND')); -- Added for reversals


-- Update existing status column if it exists, or migrate data
-- (Assuming 'status' already exists as VARCHAR from 004 script)
-- We will just add the new check constraint if not present
DO $$
BEGIN
    -- Drop old check constraint if it exists to allow update
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
    
    -- Add new constraint
    ALTER TABLE transactions 
    ADD CONSTRAINT transactions_status_check 
    CHECK (status IN ('PAID', 'VOIDED', 'REFUND')); -- 'COMPLETED' mapped to 'PAID' for consistency
END $$;


-- 2. Create voids table (For Line Voids/Corrections)
-- Purpose: Track items removed from the cart before payment.
CREATE TABLE IF NOT EXISTS voids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID REFERENCES shifts(id),
  cashier_id UUID REFERENCES users(id), -- Who was operating the POS
  manager_id UUID REFERENCES users(id), -- Who authorized the removal
  
  item_details JSONB NOT NULL, -- Snapshot of item name, price, qty
  reason VARCHAR(255) NOT NULL, -- e.g., "Customer Changed Mind"
  
  audit_image BYTEA, -- Critical: Photo of the Manager authorizing the action
  
  occurred_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_voids_shift ON voids(shift_id);
-- 3. Update audit_logs action_type constraint
-- Add 'TRANSACTION_VOID' and 'LINE_VOID' to allowed actions
DO $$
BEGIN
    ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_type_check;
    ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_type_check 
    CHECK (action_type IN (
      'SHIFT_OPEN', 'SHIFT_CLOSE', 'CASH_IN', 'CASH_OUT', 'SAFE_DROP',
      'Z_READING', 'MANUAL_AUDIT', 'USER_LOGIN', 
      'TRANSACTION_VOID', 'LINE_VOID'
    ));
END $$;

