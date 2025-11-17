/**
 * Apply database migration for swap/trading system
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

async function applyMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/millitime',
  });

  try {
    console.log('Connecting to database...');
    const client = await pool.connect();

    console.log('Reading migration file...');
    const migrationPath = path.join(__dirname, '../database/migration_002_swap_bag_system.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('Applying migration...');
    await client.query(migrationSQL);

    console.log('✓ Migration applied successfully!');
    console.log('');
    console.log('Created tables:');
    console.log('  - portfolio (bag system)');
    console.log('  - trade_history (all trades)');
    console.log('  - token_usage (AI cost tracking)');
    console.log('  - ai_action_steps (AI-generated actions)');
    console.log('  - user_settings (preferences and balance)');

    client.release();
  } catch (error) {
    console.error('Error applying migration:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applyMigration();
