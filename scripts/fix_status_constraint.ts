
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '54320'),
  database: process.env.POSTGRES_DATABASE || 'pos_db',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
});

async function fixStatusConstraint() {
  console.log('Fixing transaction status constraint...');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Drop the old constraint
    await client.query('ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check');
    console.log('Dropped old constraint.');

    // 2. Add the new constraint including 'REFUND'
    await client.query("ALTER TABLE transactions ADD CONSTRAINT transactions_status_check CHECK (status IN ('PAID', 'VOIDED', 'REFUND'))");
    console.log('Added new constraint with REFUND support.');

    await client.query('COMMIT');
    console.log('Migration successful.');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

fixStatusConstraint();
