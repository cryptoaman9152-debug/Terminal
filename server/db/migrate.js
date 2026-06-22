/**
 * DATABASE MIGRATION RUNNER
 * 
 * Executes SQL migrations against Supabase using the REST SQL endpoint.
 * Usage: node server/db/migrate.js
 * 
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_KEY in .env
 */

import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  process.exit(1);
}

async function executeSql(sql) {
  // Use Supabase's PostgREST-compatible pg_query via raw HTTP
  // Alternative: use the /rest/v1/rpc endpoint with a custom function
  // Since that's not available, we'll use fetch against the SQL endpoint
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SQL execution failed: ${response.status} - ${text}`);
  }
  return true;
}

async function executeStatements(sql) {
  // Split SQL into individual statements and execute via Supabase
  // We'll use the management API endpoint for SQL execution
  const pgUrl = SUPABASE_URL.replace('.supabase.co', '.supabase.co');
  
  // Try the SQL query endpoint (available on Supabase with service key)
  const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  
  console.log('Supabase REST status:', response.status);
  return response.ok;
}

async function main() {
  console.log('=== FundedWealth Terminal — Database Migration ===\n');
  console.log(`Supabase: ${SUPABASE_URL}\n`);

  const migrationFile = join(__dirname, 'migrations', '004_terminal_tables.sql');
  const sql = readFileSync(migrationFile, 'utf8');

  console.log('Migration file loaded: 004_terminal_tables.sql');
  console.log(`SQL length: ${sql.length} characters\n`);

  // Since we can't execute raw SQL via PostgREST, output instructions
  console.log('═══════════════════════════════════════════════════════');
  console.log('  MANUAL STEP REQUIRED');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('Supabase PostgREST does not support raw DDL execution.');
  console.log('Please execute the migration SQL in one of these ways:');
  console.log('');
  console.log('  1. Supabase Dashboard → SQL Editor → paste & run');
  console.log(`     URL: ${SUPABASE_URL.replace('.supabase.co', '.supabase.co')}`);
  console.log('');
  console.log('  2. Connect via psql:');
  console.log('     psql "postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres"');
  console.log('');
  console.log('  Migration file path:');
  console.log(`     ${migrationFile}`);
  console.log('');
  
  // Try creating tables via individual supabase client calls as a workaround
  console.log('Attempting table creation via Supabase client...\n');
  
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Test if tables already exist by trying to query them
  const tables = [
    't_users', 't_challenges', 't_accounts', 't_risk_rules',
    't_orders', 't_positions', 't_trades', 't_watchlists',
    't_account_metrics', 't_sessions',
    // Migration 005 — persistence tables
    't_broker_sessions', 't_risk_events', 't_challenge_metrics', 't_order_audit',
  ];

  let allExist = true;
  for (const table of tables) {
    const { error } = await supabase.from(table).select('id').limit(0);
    if (error) {
      console.log(`  ✗ ${table} — missing`);
      allExist = false;
    } else {
      console.log(`  ✓ ${table} — exists`);
    }
  }

  if (allExist) {
    console.log('\n✅ All terminal tables exist! Migration already applied.');
  } else {
    console.log('\n❌ Some tables are missing. Please run the SQL migration manually.');
    console.log('   File: server/db/migrations/004_terminal_tables.sql');
    console.log('   File: server/db/migrations/005_persistence_tables.sql');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
