import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function migrate() {
  try {
    console.log('Connecting to database...');
    const client = await pool.connect();
    console.log('✓ Connected');

    console.log('Adding accountId column...');
    await client.query('ALTER TABLE mdp_production_orders ADD COLUMN IF NOT EXISTS account_id INTEGER;');
    console.log('✓ Column added successfully');

    client.release();
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('✗ Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
