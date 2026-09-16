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
  console.log('Running Custom Form Builder migration...');

  // ── Add columns to transaction_audit_log ──────────────────────────────
  await db.raw(`ALTER TABLE transaction_audit_log ADD COLUMN IF NOT EXISTS context VARCHAR(20) DEFAULT 'System'`);
  await db.raw(`ALTER TABLE transaction_audit_log ADD COLUMN IF NOT EXISTS change_type VARCHAR(20)`);
  await db.raw(`ALTER TABLE transaction_audit_log ADD COLUMN IF NOT EXISTS field_name VARCHAR(200)`);
  await db.raw(`ALTER TABLE transaction_audit_log ADD COLUMN IF NOT EXISTS old_value TEXT`);
  await db.raw(`ALTER TABLE transaction_audit_log ADD COLUMN IF NOT EXISTS new_value TEXT`);
  console.log('✓ transaction_audit_log updated');

  // ── custom_forms ──────────────────────────────────────────────────────
  await db.raw(`CREATE TABLE IF NOT EXISTS custom_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    module VARCHAR(100),
    transaction_type VARCHAR(100),
    printing_type VARCHAR(20) DEFAULT 'basic',
    is_active BOOLEAN DEFAULT true,
    allow_add_multiple BOOLEAN DEFAULT false,
    store_form_with_record BOOLEAN DEFAULT true,
    form_is_preferred BOOLEAN DEFAULT false,
    version INTEGER DEFAULT 1,
    custom_script TEXT,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, code)
  )`);
  console.log('✓ custom_forms');

  // ── custom_form_tabs ─────────────────────────────────────────────────
  await db.raw(`CREATE TABLE IF NOT EXISTS custom_form_tabs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID NOT NULL REFERENCES custom_forms(id) ON DELETE CASCADE,
    tab_id VARCHAR(100) NOT NULL,
    label VARCHAR(200) NOT NULL,
    sequence INTEGER DEFAULT 0,
    is_visible BOOLEAN DEFAULT true,
    is_system BOOLEAN DEFAULT false
  )`);
  console.log('✓ custom_form_tabs');

  // ── custom_form_field_groups ──────────────────────────────────────────
  await db.raw(`CREATE TABLE IF NOT EXISTS custom_form_field_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID NOT NULL REFERENCES custom_forms(id) ON DELETE CASCADE,
    tab_id UUID REFERENCES custom_form_tabs(id) ON DELETE SET NULL,
    group_id VARCHAR(100) NOT NULL,
    label VARCHAR(200) NOT NULL,
    columns INTEGER DEFAULT 2,
    sequence INTEGER DEFAULT 0,
    is_collapsible BOOLEAN DEFAULT false,
    is_collapsed BOOLEAN DEFAULT false
  )`);
  console.log('✓ custom_form_field_groups');

  // ── custom_form_fields ────────────────────────────────────────────────
  await db.raw(`CREATE TABLE IF NOT EXISTS custom_form_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID NOT NULL REFERENCES custom_forms(id) ON DELETE CASCADE,
    tab_id UUID REFERENCES custom_form_tabs(id) ON DELETE SET NULL,
    group_id UUID REFERENCES custom_form_field_groups(id) ON DELETE SET NULL,
    field_id VARCHAR(100) NOT NULL,
    label VARCHAR(200) NOT NULL,
    field_type VARCHAR(50) NOT NULL,
    subtype VARCHAR(50),
    section VARCHAR(20) DEFAULT 'header',
    is_visible BOOLEAN DEFAULT true,
    is_mandatory BOOLEAN DEFAULT false,
    is_readonly BOOLEAN DEFAULT false,
    display_type VARCHAR(30) DEFAULT 'Normal',
    placeholder VARCHAR(200),
    help_text TEXT,
    width INTEGER,
    sequence INTEGER DEFAULT 0,
    column_break BOOLEAN DEFAULT false,
    space_before BOOLEAN DEFAULT false,
    same_row_as_previous BOOLEAN DEFAULT false,
    checkbox_default VARCHAR(20),
    default_value TEXT,
    formula TEXT,
    validation_rules JSONB,
    datasource VARCHAR(100),
    datasource_filter TEXT,
    options JSONB,
    is_searchable BOOLEAN DEFAULT false,
    is_printable BOOLEAN DEFAULT true,
    audit_trail BOOLEAN DEFAULT true,
    conditions JSONB,
    permissions JSONB,
    is_system BOOLEAN DEFAULT false,
    is_custom BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await db.raw(`CREATE INDEX IF NOT EXISTS idx_cffields_form ON custom_form_fields(form_id)`);
  console.log('✓ custom_form_fields');

  // ── custom_form_sublists ──────────────────────────────────────────────
  await db.raw(`CREATE TABLE IF NOT EXISTS custom_form_sublists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID NOT NULL REFERENCES custom_forms(id) ON DELETE CASCADE,
    tab_id UUID REFERENCES custom_form_tabs(id) ON DELETE SET NULL,
    sublist_id VARCHAR(100) NOT NULL,
    label VARCHAR(200) NOT NULL,
    sublist_type VARCHAR(50) DEFAULT 'list',
    sequence INTEGER DEFAULT 0,
    is_visible BOOLEAN DEFAULT true,
    is_system BOOLEAN DEFAULT false
  )`);
  console.log('✓ custom_form_sublists');

  // ── custom_form_sublist_fields ────────────────────────────────────────
  await db.raw(`CREATE TABLE IF NOT EXISTS custom_form_sublist_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sublist_id UUID NOT NULL REFERENCES custom_form_sublists(id) ON DELETE CASCADE,
    field_id VARCHAR(100) NOT NULL,
    label VARCHAR(200) NOT NULL,
    field_type VARCHAR(50) DEFAULT 'text',
    is_visible BOOLEAN DEFAULT true,
    is_mandatory BOOLEAN DEFAULT false,
    sequence INTEGER DEFAULT 0,
    datasource VARCHAR(100),
    options JSONB,
    is_system BOOLEAN DEFAULT false,
    is_custom BOOLEAN DEFAULT false
  )`);
  console.log('✓ custom_form_sublist_fields');

  // ── transaction_field_values (EAV) ────────────────────────────────────
  await db.raw(`CREATE TABLE IF NOT EXISTS transaction_field_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    transaction_type VARCHAR(100) NOT NULL,
    transaction_id UUID NOT NULL,
    form_id UUID REFERENCES custom_forms(id) ON DELETE SET NULL,
    field_id UUID REFERENCES custom_form_fields(id) ON DELETE CASCADE,
    field_key VARCHAR(100) NOT NULL,
    value TEXT,
    value_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await db.raw(`CREATE INDEX IF NOT EXISTS idx_tfv_txn ON transaction_field_values(transaction_type, transaction_id)`);
  console.log('✓ transaction_field_values');

  // ── custom_form_roles ─────────────────────────────────────────────────
  await db.raw(`CREATE TABLE IF NOT EXISTS custom_form_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID NOT NULL REFERENCES custom_forms(id) ON DELETE CASCADE,
    role_id VARCHAR(100) NOT NULL,
    role_name VARCHAR(200),
    can_view BOOLEAN DEFAULT true,
    can_create BOOLEAN DEFAULT false,
    can_edit BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false
  )`);
  console.log('✓ custom_form_roles');

  // ── custom_form_history ───────────────────────────────────────────────
  await db.raw(`CREATE TABLE IF NOT EXISTS custom_form_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID NOT NULL REFERENCES custom_forms(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    snapshot JSONB,
    performed_by UUID,
    performed_by_name VARCHAR(200),
    performed_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  console.log('✓ custom_form_history');

  console.log('\n✅ All custom form tables created successfully!');
  await db.destroy();
}

run().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
