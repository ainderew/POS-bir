-- =====================================================
-- Schema Verification Script
-- Verify that terminal management migration was successful
-- =====================================================

\echo '========================================='
\echo 'TERMINAL MANAGEMENT SCHEMA VERIFICATION'
\echo '========================================='
\echo ''

-- 1. Verify all required tables exist
\echo '1. Checking required tables...'
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('terminals', 'audit_logs', 'shifts')
ORDER BY tablename;

\echo ''
\echo '2. Verifying terminals table structure...'
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'terminals'
ORDER BY ordinal_position;

\echo ''
\echo '3. Verifying shifts table has new columns...'
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'shifts'
AND column_name IN (
  'theoretical_gcash', 'actual_gcash',
  'theoretical_maya', 'actual_maya',
  'theoretical_card', 'actual_card',
  'terminal_id', 'snapshot_z_counter', 'snapshot_accumulated_total'
)
ORDER BY column_name;

\echo ''
\echo '4. Verifying audit_logs table structure...'
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'audit_logs'
ORDER BY ordinal_position;

\echo ''
\echo '5. Checking for default terminal...'
SELECT id, ptu_number, serial_number, current_state,
       accumulated_grand_total, last_z_counter
FROM terminals;

\echo ''
\echo '6. Checking indexes...'
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('terminals', 'audit_logs', 'shifts')
AND indexname LIKE '%terminal%'
ORDER BY tablename, indexname;

\echo ''
\echo '7. Checking foreign key constraints...'
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
AND (tc.table_name = 'audit_logs' OR tc.table_name = 'shifts')
AND (kcu.column_name = 'terminal_id' OR ccu.column_name = 'terminal_id');

\echo ''
\echo '========================================='
\echo 'VERIFICATION COMPLETE'
\echo '========================================='
