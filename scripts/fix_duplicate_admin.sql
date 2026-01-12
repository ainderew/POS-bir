-- Fix Duplicate Administrator Entries
-- This script removes duplicate Administrator users, keeping only the oldest one

-- Step 1: View current duplicates
SELECT id, full_name, role, created_at
FROM users
WHERE full_name = 'Administrator'
ORDER BY created_at;

-- Step 2: Delete all but the first (oldest) Administrator
DELETE FROM users
WHERE full_name = 'Administrator'
  AND id NOT IN (
    SELECT id FROM users
    WHERE full_name = 'Administrator'
    ORDER BY created_at ASC
    LIMIT 1
  );

-- Step 3: Verify only one Administrator remains
SELECT id, full_name, role, created_at
FROM users
WHERE full_name = 'Administrator';

-- Step 4: Add unique constraint to prevent duplicates in future
ALTER TABLE users
ADD CONSTRAINT unique_full_name UNIQUE (full_name);
