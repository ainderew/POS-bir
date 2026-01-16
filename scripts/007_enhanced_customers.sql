-- 007_enhanced_customers.sql

-- 1. Enable Trigram Extension for fast fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Rename columns to match Staff+ Spec if they exist, or create if not
-- We need to be careful with existing data. 
-- Since we just created the table in 006, we can alter it.

DO $$
BEGIN
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'name') THEN
    ALTER TABLE customers RENAME COLUMN name TO full_name;
  END IF;
  
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'contact_number') THEN
    ALTER TABLE customers RENAME COLUMN contact_number TO phone_number;
  END IF;
END $$;

-- 3. Add new metrics columns
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_spend DECIMAL(12,2) DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_visit_at TIMESTAMPTZ;

-- 4. Add constraints and indexes
-- Phone number should be unique (but handle existing nulls/duplicates if any? For now we assume clean slate or unique enough)
DROP INDEX IF EXISTS idx_customers_phone_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_unique ON customers(phone_number) WHERE phone_number IS NOT NULL;

-- 5. Create High-Performance Search Index using GIN
DROP INDEX IF EXISTS idx_customers_full_name_trgm;
CREATE INDEX IF NOT EXISTS idx_customers_full_name_trgm ON customers USING GIN (full_name gin_trgm_ops);
