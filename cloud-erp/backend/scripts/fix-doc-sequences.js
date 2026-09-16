const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || 'cloud-erp-db', port: 5432,
  database: 'cloud_erp', user: 'erp_user', password: 'erp_secure_password'
});

async function run(sql) {
  try { await pool.query(sql); } catch (e) { if (!e.message.includes('already exists')) console.log('warn:', e.message); }
}

(async () => {
  // Drop the wrong-schema table and recreate with correct columns
  await run('DROP TABLE IF EXISTS document_sequences CASCADE');
  await run(`CREATE TABLE document_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    prefix VARCHAR(10) NOT NULL,
    year INTEGER NOT NULL,
    last_number INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, prefix, year)
  )`);
  console.log('✅ document_sequences fixed (prefix, year, last_number)');
  await pool.end();
})().catch(e => { console.log('ERR:', e.message); pool.end(); process.exit(1); });
