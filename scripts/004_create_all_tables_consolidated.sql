-- =====================================================
-- General Store POS - Consolidated Database Schema
-- Includes changes from:
-- 001_create_tables.sql
-- 002_add_terminal_management.sql
-- 003_add_user_authentication.sql
-- + "Implicit" schema changes found in code (transactions table)
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Settings Table
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(50) PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES 
('accumulated_grand_total', '0.00'),
('next_invoice_number', '1'),
('manager_pin', '1234'),
('business_name', 'General Store POS'),
('business_address', '123 Business St, City'),
('business_tin', '000-000-000-000'),
('vat_rate', '12'),
('auto_print', 'false')
ON CONFLICT (key) DO NOTHING;

-- 2. Users Table (Added in 003)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(100) NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'CASHIER', 'MANAGER')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Seed Default Admin User
INSERT INTO users (full_name, pin_hash, role) VALUES
('Administrator', '$2b$10$tKWHEh7nlNKJKoRFBr6BXewNWkuZrEiUaeWUqNZJTQ0HdMCrMdv3K', 'ADMIN')
ON CONFLICT DO NOTHING;

-- Trigger for users updated_at
CREATE OR REPLACE FUNCTION update_user_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_timestamp
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_user_timestamp();


-- 3. Terminals Table (Added in 002)
CREATE TABLE IF NOT EXISTS terminals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pos_id UUID NOT NULL,
  ptu_number VARCHAR(50) NOT NULL UNIQUE,
  serial_number VARCHAR(100) NOT NULL UNIQUE,
  current_state VARCHAR(20) DEFAULT 'CLOSED' CHECK (current_state IN ('OPEN', 'CLOSED')),
  accumulated_grand_total DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
  last_z_counter INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_synced BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_terminals_pos_id ON terminals(pos_id);
CREATE INDEX IF NOT EXISTS idx_terminals_ptu ON terminals(ptu_number);

-- Trigger for terminals updated_at
CREATE OR REPLACE FUNCTION update_terminal_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_terminal_timestamp
  BEFORE UPDATE ON terminals
  FOR EACH ROW
  EXECUTE FUNCTION update_terminal_timestamp();


-- 4. Categories Table
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  pos_id UUID NOT NULL,
  is_synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Generic updated_at function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  NEW.is_synced = FALSE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- 5. Products Table
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  barcode VARCHAR(255) UNIQUE,
  selling_price DECIMAL(10, 2) NOT NULL,
  cost_price DECIMAL(10, 2) NOT NULL,
  stock_level DECIMAL(10, 3) NOT NULL DEFAULT 0,
  unit_type VARCHAR(20) NOT NULL CHECK (unit_type IN ('QUANTITY', 'WEIGHT')),
  low_stock_threshold DECIMAL(10, 3) DEFAULT 0,
  notify_low_stock BOOLEAN DEFAULT FALSE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  tax_category VARCHAR(20) DEFAULT 'VATABLE' CHECK (tax_category IN ('VATABLE', 'VAT_EXEMPT', 'ZERO_RATED')),
  supplier_type VARCHAR(20) DEFAULT 'WHOLESALER' CHECK (supplier_type IN ('WHOLESALER', 'WET_MARKET', 'DIRECT_DELIVERY')),
  is_promo BOOLEAN DEFAULT FALSE,
  promo_price DECIMAL(10, 2),
  pos_id UUID NOT NULL,
  is_synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- 6. Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(20) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'PAID' CHECK (status IN ('PAID', 'VOIDED')),
  void_reason TEXT,
  authorized_by VARCHAR(50),
  pos_id UUID NOT NULL,
  is_synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Financials
  gross_sales DECIMAL(10, 2) NOT NULL,
  vatable_sales DECIMAL(10, 2) DEFAULT 0,
  vat_amount DECIMAL(10, 2) DEFAULT 0,
  vat_exempt_sales DECIMAL(10, 2) DEFAULT 0,
  zero_rated_sales DECIMAL(10, 2) DEFAULT 0,
  total_discount DECIMAL(10, 2) DEFAULT 0,
  net_sales DECIMAL(10, 2) NOT NULL,
  
  -- Metadata
  pax_count INTEGER DEFAULT 1,
  senior_count INTEGER DEFAULT 0,
  sc_pwd_id VARCHAR(50),
  sc_pwd_name VARCHAR(255),
  
  -- Payment Info
  payment_method VARCHAR(50) NOT NULL DEFAULT 'CASH',
  amount_tendered DECIMAL(10, 2),
  change_amount DECIMAL(10, 2),
  reference_number VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_transactions_invoice ON transactions(invoice_number);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);


-- 7. Transaction Items Table
CREATE TABLE IF NOT EXISTS transaction_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity_sold DECIMAL(10, 3) NOT NULL,
  price_at_sale DECIMAL(10, 2) NOT NULL,
  cost_at_sale DECIMAL(10, 2) NOT NULL,
  profit DECIMAL(10, 2) GENERATED ALWAYS AS ((price_at_sale - cost_at_sale) * quantity_sold) STORED,
  tax_category VARCHAR(20) NOT NULL,
  pos_id UUID NOT NULL,
  is_synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- 8. Daily Readings Table
CREATE TABLE IF NOT EXISTS daily_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(10) NOT NULL CHECK (type IN ('X', 'Z')),
  reading_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  total_sales DECIMAL(10, 2) NOT NULL,
  total_vat DECIMAL(10, 2) NOT NULL,
  beginning_invoice VARCHAR(20),
  ending_invoice VARCHAR(20),
  accumulated_grand_total DECIMAL(20, 2) NOT NULL,
  pos_id UUID NOT NULL,
  is_synced BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_daily_readings_date ON daily_readings(reading_date);


-- 9. Shifts Table (Consolidated)
CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pos_id UUID NOT NULL,
  status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  end_time TIMESTAMP,
  
  -- Cash Management
  opening_fund DECIMAL(10, 2) NOT NULL DEFAULT 0,
  theoretical_cash DECIMAL(10, 2) DEFAULT 0,
  actual_cash DECIMAL(10, 2) DEFAULT 0,
  variance DECIMAL(10, 2) DEFAULT 0,
  
  -- Digital Payments (Added in 002)
  theoretical_gcash DECIMAL(10, 2) DEFAULT 0,
  actual_gcash DECIMAL(10, 2) DEFAULT 0,
  theoretical_maya DECIMAL(10, 2) DEFAULT 0,
  actual_maya DECIMAL(10, 2) DEFAULT 0,
  theoretical_card DECIMAL(10, 2) DEFAULT 0,
  actual_card DECIMAL(10, 2) DEFAULT 0,
  
  -- References
  terminal_id UUID REFERENCES terminals(id) ON DELETE SET NULL, -- Added in 002
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,         -- Added in 003
  
  -- Snapshots (Added in 002)
  snapshot_z_counter INTEGER,
  snapshot_accumulated_total DECIMAL(20, 2),
  
  is_synced BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_shifts_terminal ON shifts(terminal_id);
CREATE INDEX IF NOT EXISTS idx_shifts_user ON shifts(user_id);


-- 10. Cash Movements Table
CREATE TABLE IF NOT EXISTS cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('CASH_IN', 'CASH_OUT', 'SAFE_DROP')),
  amount DECIMAL(10, 2) NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_synced BOOLEAN DEFAULT FALSE
);


-- 11. Audit Logs Table (Consolidated 002 & 003)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- UUID FK from 003
  shift_id UUID REFERENCES shifts(id) ON DELETE CASCADE,
  terminal_id UUID REFERENCES terminals(id) ON DELETE SET NULL,

  action_type VARCHAR(50) NOT NULL CHECK (action_type IN (
    'SHIFT_OPEN', 'SHIFT_CLOSE', 'CASH_IN', 'CASH_OUT', 'SAFE_DROP',
    'Z_READING', 'MANUAL_AUDIT', 'USER_LOGIN'
  )),

  audit_image BYTEA,
  audit_metadata JSONB,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_synced BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_shift ON audit_logs(shift_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_terminal ON audit_logs(terminal_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
