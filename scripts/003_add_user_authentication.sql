-- =====================================================
-- Multi-User Authentication & Identity Verification
-- BIR RMO 24-2023 Compliance - User Accountability
-- =====================================================

-- 1. Create Users Table
-- Individual user accounts with PIN-based authentication
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(100) NOT NULL UNIQUE,  -- Prevent duplicate names
  pin_hash TEXT NOT NULL,  -- bcrypt hashed PIN (never stored in plain text)
  role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'CASHIER', 'MANAGER')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 2. Seed Default Admin User
-- PIN: 1234 (bcrypt hashed)
INSERT INTO users (full_name, pin_hash, role) VALUES
('Administrator', '$2b$10$tKWHEh7nlNKJKoRFBr6BXewNWkuZrEiUaeWUqNZJTQ0HdMCrMdv3K', 'ADMIN')
ON CONFLICT DO NOTHING;

-- 3. Add User Reference to Shifts Table
-- Links each shift to the user who opened it
ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shifts_user ON shifts(user_id);

-- 4. Update Audit Logs Table to Use UUID for User ID
-- Convert user_id from VARCHAR to UUID and add foreign key constraint
-- First, ensure all existing values are NULL (safe migration)
UPDATE audit_logs SET user_id = NULL WHERE user_id IS NOT NULL;

-- Change column type to UUID
ALTER TABLE audit_logs
ALTER COLUMN user_id TYPE UUID USING NULL;

-- Add foreign key constraint (with existence check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_audit_logs_user'
  ) THEN
    ALTER TABLE audit_logs
    ADD CONSTRAINT fk_audit_logs_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Update Audit Action Types
-- Ensure 'USER_LOGIN' is a valid action type
-- (The CHECK constraint already allows all action types as VARCHAR,
--  so no schema change needed - just documenting valid types)

-- 6. Create Auto-Update Trigger for Users
CREATE OR REPLACE FUNCTION update_user_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_timestamp ON users;
CREATE TRIGGER trigger_update_user_timestamp
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_user_timestamp();

-- Migration Complete
-- Default User Credentials:
--   Username: Administrator
--   PIN: 1234
--   Role: ADMIN
--
-- To create additional users, use:
-- INSERT INTO users (full_name, pin_hash, role) VALUES
-- ('<name>', '<bcrypt-hash>', '<role>');
--
-- Generate hash with: node -e "const bcrypt = require('bcrypt'); bcrypt.hash('<PIN>', 10, (err, hash) => console.log(hash))"
