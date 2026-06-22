import { config } from 'dotenv';
import pg from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

config();
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRef = 'nysrxvpjdlvzvcawysvh';
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

// Try every known Supabase connection pattern
const attempts = [
  { host: `db.${projectRef}.supabase.co`, port: 5432, user: 'postgres', password: serviceKey },
  { host: `db.${projectRef}.supabase.co`, port: 5432, user: 'postgres.nysrxvpjdlvzvcawysvh', password: serviceKey },
  { host: `aws-0-ap-south-1.pooler.supabase.com`, port: 6543, user: `postgres.${projectRef}`, password: serviceKey },
  { host: `aws-0-ap-south-1.pooler.supabase.com`, port: 5432, user: `postgres.${projectRef}`, password: serviceKey },
  { host: `${projectRef}.pooler.supabase.com`, port: 6543, user: 'postgres', password: serviceKey },
  { host: `${projectRef}.supabase.co`, port: 5432, user: 'postgres', password: serviceKey },
  // Try with password as the raw key without sb_secret_ prefix
  { host: `db.${projectRef}.supabase.co`, port: 5432, user: 'postgres', password: 'pXxBClMpDcs5czNf37mHpg_5gbkOhfX' },
];

async function main() {
  for (let i = 0; i < attempts.length; i++) {
    const { host, port, user, password } = attempts[i];
    console.log(`[${i+1}/${attempts.length}] ${user}@${host}:${port}...`);
    const pool = new pg.Pool({
      host, port, user, password, database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    });
    try {
      const client = await pool.connect();
      console.log(`  ✓ CONNECTED!`);
      
      // Run migration
      const sql = readFileSync(join(__dirname, 'FULL_MIGRATION.sql'), 'utf8');
      await client.query(sql);
      console.log('  ✓ MIGRATION COMPLETE');
      
      // Seed
      client.release();
      await pool.end();
      console.log('\nNow run: node db/setup.js');
      process.exit(0);
    } catch (e) {
      const msg = e.message.length > 80 ? e.message.substring(0, 80) : e.message;
      console.log(`  ✗ ${msg}`);
      await pool.end().catch(() => {});
    }
  }
  console.log('\n❌ All connection attempts failed.');
  console.log('Need SUPABASE_DB_PASSWORD. Find it at:');
  console.log(`https://supabase.com/dashboard/project/${projectRef}/settings/database`);
  process.exit(1);
}
main();
