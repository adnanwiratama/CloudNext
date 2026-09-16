const knex = require('knex');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const db = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'cloud_erp',
    user: process.env.DB_USER || 'erp_user',
    password: process.env.DB_PASSWORD || 'erp_secure_password',
  },
});

async function run() {
  console.log('Running File Cabinet migration...');

  await db.raw(`CREATE TABLE IF NOT EXISTS file_cabinet (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    -- attachment context
    source_type VARCHAR(100) NOT NULL,   -- 'bank_check', 'invoice', etc
    source_id UUID NOT NULL,
    -- file metadata
    file_name VARCHAR(500) NOT NULL,
    original_name VARCHAR(500) NOT NULL,
    mime_type VARCHAR(200),
    file_size BIGINT DEFAULT 0,
    file_ext VARCHAR(20),
    -- storage
    storage_path TEXT NOT NULL,          -- relative path inside uploads dir
    -- display fields
    title VARCHAR(500),
    description TEXT,
    folder VARCHAR(200) DEFAULT 'Attachments',
    -- flags
    is_deleted BOOLEAN DEFAULT false,
    -- audit
    uploaded_by UUID,
    uploaded_by_name VARCHAR(200),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await db.raw(`CREATE INDEX IF NOT EXISTS idx_fc_source ON file_cabinet(source_type, source_id)`);
  await db.raw(`CREATE INDEX IF NOT EXISTS idx_fc_company ON file_cabinet(company_id)`);

  console.log('✓ file_cabinet table created');
  console.log('✅ File Cabinet migration done!');
  await db.destroy();
}

run().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
