-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Settings Table (BIR compliance & system config)
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(50) PRIMARY KEY,
  value TEXT NOT NULL
);

-- Initialize default settings
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

-- Categories Table
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  pos_id UUID NOT NULL,
  is_synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products Table
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

-- Transactions Table (BIR Compliant)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(20) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'PAID' CHECK (status IN ('PAID', 'VOIDED')),
  void_reason TEXT,
  authorized_by VARCHAR(50), -- Manager PIN/Name
  pos_id UUID NOT NULL,
  is_synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Tax Breakdown (Mandatory for BIR)
  gross_sales DECIMAL(10, 2) NOT NULL,
  vatable_sales DECIMAL(10, 2) DEFAULT 0,
  vat_amount DECIMAL(10, 2) DEFAULT 0,
  vat_exempt_sales DECIMAL(10, 2) DEFAULT 0,
  zero_rated_sales DECIMAL(10, 2) DEFAULT 0,
  total_discount DECIMAL(10, 2) DEFAULT 0,
  net_sales DECIMAL(10, 2) NOT NULL,
  
  -- SC/PWD Details
  pax_count INTEGER DEFAULT 1,
  senior_count INTEGER DEFAULT 0,
  sc_pwd_id VARCHAR(50),
  sc_pwd_name VARCHAR(255),
  
  payment_method VARCHAR(50) NOT NULL DEFAULT 'CASH'
);

-- Transaction Items Table
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

-- Daily Readings Table (Audit Trail)
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

-- Shifts Table (Cash Management)
CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pos_id UUID NOT NULL,
  status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  end_time TIMESTAMP,
  opening_fund DECIMAL(10, 2) NOT NULL DEFAULT 0,
  theoretical_cash DECIMAL(10, 2) DEFAULT 0,
  actual_cash DECIMAL(10, 2) DEFAULT 0,
  variance DECIMAL(10, 2) DEFAULT 0,
  is_synced BOOLEAN DEFAULT FALSE
);

-- Cash Movements Table
CREATE TABLE IF NOT EXISTS cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('CASH_IN', 'CASH_OUT', 'SAFE_DROP')),
  amount DECIMAL(10, 2) NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_synced BOOLEAN DEFAULT FALSE
);

-- Create Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_transactions_invoice ON transactions(invoice_number);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_daily_readings_date ON daily_readings(reading_date);

-- Trigger for updated_at remains the same
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

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
