-- 009_wholesale_pricing.sql

ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price DECIMAL(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_threshold INTEGER DEFAULT 0;
