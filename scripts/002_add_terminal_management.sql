-- =====================================================
-- Terminal Management & Visual Audit Schema Migration
-- BIR RMO 24-2023 Compliance
-- =====================================================

-- 1. Create Terminals Table
-- Tracks PTU (Permit to Use) terminals with BIR-compliant counters
CREATE TABLE IF NOT EXISTS terminals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pos_id UUID NOT NULL,
  ptu_number VARCHAR(50) NOT NULL UNIQUE,
  serial_number VARCHAR(100) NOT NULL UNIQUE,
  current_state VARCHAR(20) DEFAULT 'CLOSED' CHECK (current_state IN ('OPEN', 'CLOSED')),

  -- BIR Compliance Counters
  accumulated_grand_total DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
  last_z_counter INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_synced BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_terminals_pos_id ON terminals(pos_id);
CREATE INDEX IF NOT EXISTS idx_terminals_ptu ON terminals(ptu_number);

-- 2. Create Audit Logs Table
-- Visual audit trail with optimized image storage (<4KB target)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(100),
  shift_id UUID REFERENCES shifts(id) ON DELETE CASCADE,
  terminal_id UUID REFERENCES terminals(id) ON DELETE SET NULL,

  -- Action Tracking
  action_type VARCHAR(50) NOT NULL CHECK (action_type IN (
    'SHIFT_OPEN', 'SHIFT_CLOSE', 'CASH_IN', 'CASH_OUT', 'SAFE_DROP',
    'Z_READING', 'MANUAL_AUDIT'
  )),

  -- Visual Audit (BYTEA for binary storage, <4KB to avoid TOAST overhead)
  audit_image BYTEA,
  audit_metadata JSONB,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_synced BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_shift ON audit_logs(shift_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_terminal ON audit_logs(terminal_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- 3. Alter Shifts Table - Add Missing Payment Method Columns
-- Fixes bug in app/api/shifts/close/route.ts where these columns are referenced but don't exist
ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS theoretical_gcash DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS actual_gcash DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS theoretical_maya DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS actual_maya DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS theoretical_card DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS actual_card DECIMAL(10, 2) DEFAULT 0;

-- 4. Alter Shifts Table - Add Terminal Reference and BIR Snapshots
ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS terminal_id UUID REFERENCES terminals(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS snapshot_z_counter INTEGER,
ADD COLUMN IF NOT EXISTS snapshot_accumulated_total DECIMAL(20, 2);

CREATE INDEX IF NOT EXISTS idx_shifts_terminal ON shifts(terminal_id);

-- 5. Create Auto-Update Trigger for Terminals (like existing tables)
CREATE OR REPLACE FUNCTION update_terminal_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_terminal_timestamp ON terminals;
CREATE TRIGGER trigger_update_terminal_timestamp
  BEFORE UPDATE ON terminals
  FOR EACH ROW
  EXECUTE FUNCTION update_terminal_timestamp();

-- Migration Complete
-- Next Step: Insert default terminal record
-- Example:
-- INSERT INTO terminals (pos_id, ptu_number, serial_number)
-- VALUES ('<YOUR_POS_ID>', 'PTU-001-2026', 'TERMINAL-001')
-- ON CONFLICT (ptu_number) DO NOTHING;
