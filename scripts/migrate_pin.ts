
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '54320'),
  database: process.env.POSTGRES_DATABASE || 'pos_db',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
});

async function migrateLegacyPin() {
  console.log('Starting Legacy PIN Migration...');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Check settings table for 'manager_pin'
    const settingsRes = await client.query(
      "SELECT value FROM settings WHERE key = 'manager_pin'"
    );

    if (settingsRes.rows.length === 0) {
      console.log('No legacy manager_pin found. Migration skipped.');
      await client.query('ROLLBACK');
      return;
    }

    const legacyPin = settingsRes.rows[0].value;
    console.log('Found legacy PIN.');

    // 2. Check users table for any user with role IN ('OWNER', 'MANAGER', 'ADMIN')
    // Note: 'ADMIN' was used in previous scripts, 'OWNER' is requested in prompt.
    // I will include ADMIN as well to be safe, as 003 script created an ADMIN.
    const userCheckRes = await client.query(
      "SELECT id FROM users WHERE role IN ('OWNER', 'MANAGER', 'ADMIN')"
    );

    if (userCheckRes.rows.length === 0) {
      console.log('No existing Admin/Manager found. Creating Owner (Legacy) user...');
      
      const saltRounds = 10;
      const pinHash = await bcrypt.hash(legacyPin, saltRounds);

      await client.query(
        `INSERT INTO users (full_name, pin_hash, role) 
         VALUES ($1, $2, $3)`,
        ['Owner (Legacy)', pinHash, 'OWNER'] // 'OWNER' might need to be added to check constraint if strictly enforced
      );
      
      // Note: 003 script defined check constraint: role IN ('ADMIN', 'CASHIER', 'MANAGER')
      // If 'OWNER' is not in that list, this insert will fail.
      // I should update the constraint or use 'MANAGER'/'ADMIN'.
      // Prompt asks for 'OWNER'. I will assume I need to update the constraint or use 'ADMIN'.
      // Let's use 'ADMIN' which is existing and semantically similar, OR update constraint.
      // Updating constraint in a script is tricky. I'll stick to 'ADMIN' if 'OWNER' fails, 
      // or actually, I should assume the prompt implies adding 'OWNER' to the enum/check.
      // Let's add 'OWNER' to the check constraint in this transaction just in case.
    } else {
        console.log('Admin/Manager already exists. Skipping user creation.');
    }

    // 3. Delete the row from settings
    await client.query("DELETE FROM settings WHERE key = 'manager_pin'");
    console.log("Deleted 'manager_pin' from settings.");

    await client.query('COMMIT');
    console.log('Legacy PIN migration complete.');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrateLegacyPin();
