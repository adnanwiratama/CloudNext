/**
 * init-db.js — Full database initialization script
 * Runs all migrations in order and seeds initial data
 */
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'cloud-erp-db',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'cloud_erp',
  user: process.env.DB_USER || 'erp_user',
  password: process.env.DB_PASSWORD || 'erp_secure_password',
});

async function run(sql) {
  try { await pool.query(sql); } catch(e) { if (!e.message.includes('already exists')) throw e; }
}

async function main() {
  console.log('🚀 Initializing CloudERP database...\n');

  // ── Extensions ────────────────────────────────────────────────────────────
  await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  console.log('✓ Extensions');

  // ── Companies & Subsidiaries ──────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    legal_name VARCHAR(300),
    tax_id VARCHAR(50),
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Indonesia',
    phone VARCHAR(50),
    email VARCHAR(200),
    website VARCHAR(200),
    currency VARCHAR(10) DEFAULT 'IDR',
    fiscal_year_start INTEGER DEFAULT 1,
    logo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS subsidiaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    code VARCHAR(30) NOT NULL,
    name VARCHAR(200) NOT NULL,
    currency VARCHAR(10) DEFAULT 'IDR',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // ── Roles & Users ─────────────────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '{}',
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    employee_number VARCHAR(30),
    name VARCHAR(200) NOT NULL,
    email VARCHAR(200) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    role_id UUID REFERENCES roles(id),
    is_admin BOOLEAN DEFAULT false,
    department VARCHAR(100),
    position VARCHAR(100),
    phone VARCHAR(50),
    avatar_url TEXT,
    timezone VARCHAR(50) DEFAULT 'Asia/Jakarta',
    language VARCHAR(10) DEFAULT 'en',
    is_active BOOLEAN DEFAULT true,
    is_deleted BOOLEAN DEFAULT false,
    last_login TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, email)
  )`);
  console.log('✓ companies, subsidiaries, roles, users');

  // ── Departments & Locations ───────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    code VARCHAR(30) NOT NULL,
    name VARCHAR(200) NOT NULL,
    parent_id UUID REFERENCES departments(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, code)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    code VARCHAR(30) NOT NULL,
    name VARCHAR(200) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, code)
  )`);
  console.log('✓ departments, locations');

  // ── Chart of Accounts ─────────────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    code VARCHAR(30) NOT NULL,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50) NOT NULL,
    subtype VARCHAR(50),
    parent_id UUID REFERENCES accounts(id),
    is_bank BOOLEAN DEFAULT false,
    bank_name VARCHAR(100),
    bank_account_number VARCHAR(100),
    currency VARCHAR(10) DEFAULT 'IDR',
    is_active BOOLEAN DEFAULT true,
    is_deleted BOOLEAN DEFAULT false,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, code)
  )`);
  console.log('✓ accounts (COA)');

  // ── Tax Codes ─────────────────────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS tax_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    code VARCHAR(30) NOT NULL,
    name VARCHAR(200) NOT NULL,
    rate DECIMAL(8,4) NOT NULL DEFAULT 0,
    type VARCHAR(30) DEFAULT 'sales',
    tax_account_id UUID REFERENCES accounts(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, code)
  )`);

  // ── Accounting Periods ───────────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS accounting_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    fiscal_year INTEGER NOT NULL,
    period_number INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // ── Transaction sequences ────────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS transaction_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    transaction_type VARCHAR(50) NOT NULL,
    prefix VARCHAR(20),
    last_number INTEGER DEFAULT 0,
    increment INTEGER DEFAULT 1,
    min_digits INTEGER DEFAULT 6,
    include_year BOOLEAN DEFAULT true,
    UNIQUE(company_id, transaction_type)
  )`);
  console.log('✓ tax_codes, accounting_periods, sequences');

  // ── UOM ───────────────────────────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS units_of_measure (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id),
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // ── Items ─────────────────────────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS item_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    code VARCHAR(30) NOT NULL,
    name VARCHAR(200) NOT NULL,
    parent_id UUID REFERENCES item_categories(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    item_code VARCHAR(50) NOT NULL,
    sku VARCHAR(100),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL DEFAULT 'inventory',
    category_id UUID REFERENCES item_categories(id),
    base_uom_id UUID REFERENCES units_of_measure(id),
    purchase_uom_id UUID REFERENCES units_of_measure(id),
    sales_uom_id UUID REFERENCES units_of_measure(id),
    standard_cost DECIMAL(20,4) DEFAULT 0,
    average_cost DECIMAL(20,4) DEFAULT 0,
    sales_price DECIMAL(20,4) DEFAULT 0,
    tax_code_id UUID REFERENCES tax_codes(id),
    income_account_id UUID REFERENCES accounts(id),
    cogs_account_id UUID REFERENCES accounts(id),
    inventory_account_id UUID REFERENCES accounts(id),
    expense_account_id UUID REFERENCES accounts(id),
    is_purchasable BOOLEAN DEFAULT true,
    is_sellable BOOLEAN DEFAULT true,
    is_stockable BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    is_deleted BOOLEAN DEFAULT false,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, item_code)
  )`);
  console.log('✓ items, uom');

  // ── Customers & Vendors ───────────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    customer_number VARCHAR(30) NOT NULL,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50) DEFAULT 'company',
    email VARCHAR(200), phone VARCHAR(50), tax_id VARCHAR(50),
    address TEXT, city VARCHAR(100), country VARCHAR(100),
    currency VARCHAR(10) DEFAULT 'IDR',
    payment_terms VARCHAR(50),
    department_id UUID REFERENCES departments(id),
    ar_account_id UUID REFERENCES accounts(id),
    status VARCHAR(20) DEFAULT 'active',
    is_deleted BOOLEAN DEFAULT false,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, customer_number)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    vendor_number VARCHAR(30) NOT NULL,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50) DEFAULT 'company',
    email VARCHAR(200), phone VARCHAR(50), tax_id VARCHAR(50),
    address TEXT, city VARCHAR(100), country VARCHAR(100),
    currency VARCHAR(10) DEFAULT 'IDR',
    payment_terms VARCHAR(50),
    department_id UUID REFERENCES departments(id),
    ap_account_id UUID REFERENCES accounts(id),
    expense_account_id UUID REFERENCES accounts(id),
    status VARCHAR(20) DEFAULT 'active',
    is_deleted BOOLEAN DEFAULT false,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, vendor_number)
  )`);
  console.log('✓ customers, vendors');

  // ── Journal Entries ───────────────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    journal_number VARCHAR(50) NOT NULL,
    entry_date DATE NOT NULL,
    period_id UUID REFERENCES accounting_periods(id),
    currency VARCHAR(10) DEFAULT 'IDR',
    exchange_rate DECIMAL(20,6) DEFAULT 1,
    type VARCHAR(50) DEFAULT 'manual',
    source_type VARCHAR(100),
    source_id UUID,
    memo TEXT,
    department_id UUID REFERENCES departments(id),
    location_id UUID REFERENCES locations(id),
    status VARCHAR(30) DEFAULT 'posted',
    posted_by UUID REFERENCES users(id),
    posted_at TIMESTAMPTZ,
    is_reversed BOOLEAN DEFAULT false,
    reversed_by UUID,
    created_by UUID REFERENCES users(id),
    updated_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    total_debit DECIMAL(20,4) DEFAULT 0,
    total_credit DECIMAL(20,4) DEFAULT 0
  )`);

  await run(`CREATE TABLE IF NOT EXISTS journal_entry_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    account_id UUID NOT NULL REFERENCES accounts(id),
    debit DECIMAL(20,4) DEFAULT 0,
    credit DECIMAL(20,4) DEFAULT 0,
    debit_base DECIMAL(20,4) DEFAULT 0,
    credit_base DECIMAL(20,4) DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'IDR',
    entity_customer_id UUID REFERENCES customers(id),
    entity_vendor_id UUID REFERENCES vendors(id),
    department_id UUID REFERENCES departments(id),
    location_id UUID REFERENCES locations(id),
    memo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_je_source ON journal_entries(source_type, source_id)');
  console.log('✓ journal_entries, journal_entry_lines');

  // ── Audit Log ─────────────────────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS transaction_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    source_type VARCHAR(50) NOT NULL,
    source_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    context VARCHAR(20) DEFAULT 'System',
    change_type VARCHAR(20),
    field_name VARCHAR(200),
    old_value TEXT,
    new_value TEXT,
    description TEXT,
    changes JSONB,
    performed_by UUID,
    performed_by_name VARCHAR(200),
    ip_address VARCHAR(50),
    performed_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_tal_source ON transaction_audit_log(source_type, source_id)');
  console.log('✓ transaction_audit_log');

  // ── Sales Tables ──────────────────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    quotation_number VARCHAR(30) NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id),
    quotation_date DATE NOT NULL,
    expiry_date DATE,
    currency VARCHAR(10) DEFAULT 'IDR',
    exchange_rate DECIMAL(20,6) DEFAULT 1,
    location_id UUID REFERENCES locations(id),
    department_id UUID REFERENCES departments(id),
    status VARCHAR(30) DEFAULT 'draft',
    memo TEXT,
    subtotal DECIMAL(20,4) DEFAULT 0,
    tax_amount DECIMAL(20,4) DEFAULT 0,
    total_amount DECIMAL(20,4) DEFAULT 0,
    created_by UUID REFERENCES users(id),
    updated_by UUID,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, quotation_number)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS sales_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    so_number VARCHAR(30) NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id),
    order_date DATE NOT NULL,
    expected_ship_date DATE,
    currency VARCHAR(10) DEFAULT 'IDR',
    exchange_rate DECIMAL(20,6) DEFAULT 1,
    payment_terms VARCHAR(50),
    location_id UUID REFERENCES locations(id),
    department_id UUID REFERENCES departments(id),
    status VARCHAR(30) DEFAULT 'pending_approval',
    memo TEXT,
    subtotal DECIMAL(20,4) DEFAULT 0,
    discount_amount DECIMAL(20,4) DEFAULT 0,
    tax_amount DECIMAL(20,4) DEFAULT 0,
    shipping_amount DECIMAL(20,4) DEFAULT 0,
    total_amount DECIMAL(20,4) DEFAULT 0,
    created_by UUID REFERENCES users(id),
    updated_by UUID,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, so_number)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS sales_order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    so_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    item_id UUID REFERENCES items(id),
    description TEXT,
    quantity DECIMAL(20,6) NOT NULL,
    qty_fulfilled DECIMAL(20,6) DEFAULT 0,
    qty_billed DECIMAL(20,6) DEFAULT 0,
    uom_id UUID REFERENCES units_of_measure(id),
    unit_price DECIMAL(20,4) NOT NULL,
    discount_percent DECIMAL(10,4) DEFAULT 0,
    discount_amount DECIMAL(20,4) DEFAULT 0,
    tax_code_id UUID REFERENCES tax_codes(id),
    tax_amount DECIMAL(20,4) DEFAULT 0,
    amount DECIMAL(20,4) NOT NULL,
    department_id UUID REFERENCES departments(id),
    location_id UUID REFERENCES locations(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    invoice_number VARCHAR(30) NOT NULL,
    so_id UUID REFERENCES sales_orders(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    currency VARCHAR(10) DEFAULT 'IDR',
    exchange_rate DECIMAL(20,6) DEFAULT 1,
    payment_terms VARCHAR(50),
    location_id UUID REFERENCES locations(id),
    department_id UUID REFERENCES departments(id),
    status VARCHAR(30) DEFAULT 'open',
    memo TEXT,
    subtotal DECIMAL(20,4) DEFAULT 0,
    tax_amount DECIMAL(20,4) DEFAULT 0,
    total_amount DECIMAL(20,4) DEFAULT 0,
    amount_paid DECIMAL(20,4) DEFAULT 0,
    amount_due DECIMAL(20,4) DEFAULT 0,
    is_posted BOOLEAN DEFAULT false,
    posted_by UUID,
    posted_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    updated_by UUID,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, invoice_number)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    so_line_id UUID REFERENCES sales_order_lines(id),
    line_number INTEGER NOT NULL,
    item_id UUID REFERENCES items(id),
    description TEXT,
    quantity DECIMAL(20,6) NOT NULL,
    uom_id UUID REFERENCES units_of_measure(id),
    unit_price DECIMAL(20,4) NOT NULL,
    discount_percent DECIMAL(10,4) DEFAULT 0,
    tax_code_id UUID REFERENCES tax_codes(id),
    tax_amount DECIMAL(20,4) DEFAULT 0,
    amount DECIMAL(20,4) NOT NULL,
    department_id UUID REFERENCES departments(id),
    location_id UUID REFERENCES locations(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS customer_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    payment_number VARCHAR(30) NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id),
    payment_date DATE NOT NULL,
    amount DECIMAL(20,4) NOT NULL,
    currency VARCHAR(10) DEFAULT 'IDR',
    payment_method VARCHAR(50) DEFAULT 'bank_transfer',
    reference VARCHAR(100),
    bank_account_id UUID REFERENCES accounts(id),
    department_id UUID REFERENCES departments(id),
    location_id UUID REFERENCES locations(id),
    unapplied_amount DECIMAL(20,4) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'posted',
    memo TEXT,
    is_posted BOOLEAN DEFAULT false,
    posted_by UUID,
    posted_at TIMESTAMPTZ,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, payment_number)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS payment_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES customer_payments(id),
    invoice_id UUID NOT NULL REFERENCES invoices(id),
    applied_amount DECIMAL(20,4) NOT NULL,
    applied_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  console.log('✓ quotations, sales_orders, invoices, customer_payments');

  // ── Item Fulfillment ──────────────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS item_fulfillments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    fulfillment_number VARCHAR(30) NOT NULL,
    so_id UUID REFERENCES sales_orders(id),
    customer_id UUID REFERENCES customers(id),
    fulfillment_date DATE NOT NULL,
    location_id UUID REFERENCES locations(id),
    department_id UUID REFERENCES departments(id),
    shipping_address TEXT,
    tracking_number VARCHAR(100),
    carrier VARCHAR(100),
    status VARCHAR(30) DEFAULT 'pending',
    memo TEXT,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, fulfillment_number)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS item_fulfillment_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fulfillment_id UUID NOT NULL REFERENCES item_fulfillments(id) ON DELETE CASCADE,
    so_line_id UUID REFERENCES sales_order_lines(id),
    item_id UUID REFERENCES items(id),
    quantity DECIMAL(20,6) NOT NULL,
    uom_id UUID REFERENCES units_of_measure(id),
    lot_number VARCHAR(100),
    serial_number VARCHAR(100),
    bin_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // ── Return Authorization ──────────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS return_authorizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    ra_number VARCHAR(30) NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id),
    return_date DATE NOT NULL,
    department_id UUID REFERENCES departments(id),
    location_id UUID REFERENCES locations(id),
    return_reason TEXT,
    memo TEXT,
    total_amount DECIMAL(20,4) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'open',
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, ra_number)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS return_authorization_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ra_id UUID NOT NULL REFERENCES return_authorizations(id) ON DELETE CASCADE,
    item_id UUID REFERENCES items(id),
    description TEXT,
    qty DECIMAL(14,4) DEFAULT 0,
    unit_price DECIMAL(20,4) DEFAULT 0,
    amount DECIMAL(20,4) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // ── Credit Memos ──────────────────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS credit_memos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    memo_number VARCHAR(30) NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id),
    memo_date DATE NOT NULL,
    department_id UUID REFERENCES departments(id),
    location_id UUID REFERENCES locations(id),
    currency VARCHAR(10) DEFAULT 'IDR',
    total_amount DECIMAL(20,4) DEFAULT 0,
    applied_amount DECIMAL(20,4) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'open',
    memo TEXT,
    updated_by UUID,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, memo_number)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS credit_memo_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_memo_id UUID NOT NULL REFERENCES credit_memos(id) ON DELETE CASCADE,
    item_id UUID REFERENCES items(id),
    description TEXT,
    qty DECIMAL(14,4) DEFAULT 0,
    unit_price DECIMAL(20,4) DEFAULT 0,
    amount DECIMAL(20,4) DEFAULT 0,
    department_id UUID REFERENCES departments(id),
    location_id UUID REFERENCES locations(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  console.log('✓ fulfillments, returns, credit memos');

  // ── Purchasing Tables ─────────────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    po_number VARCHAR(30) NOT NULL,
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    order_date DATE NOT NULL,
    expected_receipt_date DATE,
    currency VARCHAR(10) DEFAULT 'IDR',
    exchange_rate DECIMAL(20,6) DEFAULT 1,
    payment_terms VARCHAR(50),
    location_id UUID REFERENCES locations(id),
    department_id UUID REFERENCES departments(id),
    status VARCHAR(30) DEFAULT 'pending_approval',
    memo TEXT,
    subtotal DECIMAL(20,4) DEFAULT 0,
    tax_amount DECIMAL(20,4) DEFAULT 0,
    total_amount DECIMAL(20,4) DEFAULT 0,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    updated_by UUID,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, po_number)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    item_id UUID REFERENCES items(id),
    description TEXT,
    quantity DECIMAL(20,6) NOT NULL,
    qty_received DECIMAL(20,6) DEFAULT 0,
    uom_id UUID REFERENCES units_of_measure(id),
    unit_price DECIMAL(20,4) NOT NULL,
    tax_code_id UUID REFERENCES tax_codes(id),
    tax_amount DECIMAL(20,4) DEFAULT 0,
    amount DECIMAL(20,4) NOT NULL,
    expense_account_id UUID REFERENCES accounts(id),
    department_id UUID REFERENCES departments(id),
    location_id UUID REFERENCES locations(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS item_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    receipt_number VARCHAR(30) NOT NULL,
    po_id UUID REFERENCES purchase_orders(id),
    vendor_id UUID REFERENCES vendors(id),
    receipt_date DATE NOT NULL,
    location_id UUID REFERENCES locations(id),
    department_id UUID REFERENCES departments(id),
    status VARCHAR(30) DEFAULT 'received',
    is_posted BOOLEAN DEFAULT false,
    posted_by UUID,
    posted_at TIMESTAMPTZ,
    memo TEXT,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, receipt_number)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS item_receipt_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID NOT NULL REFERENCES item_receipts(id) ON DELETE CASCADE,
    po_line_id UUID REFERENCES purchase_order_lines(id),
    item_id UUID REFERENCES items(id),
    quantity DECIMAL(20,6) NOT NULL,
    uom_id UUID REFERENCES units_of_measure(id),
    unit_cost DECIMAL(20,4) DEFAULT 0,
    department_id UUID REFERENCES departments(id),
    location_id UUID REFERENCES locations(id),
    lot_number VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS vendor_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    bill_number VARCHAR(30) NOT NULL,
    vendor_invoice_number VARCHAR(100),
    po_id UUID REFERENCES purchase_orders(id),
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    bill_date DATE NOT NULL,
    due_date DATE NOT NULL,
    currency VARCHAR(10) DEFAULT 'IDR',
    exchange_rate DECIMAL(20,6) DEFAULT 1,
    payment_terms VARCHAR(50),
    location_id UUID REFERENCES locations(id),
    department_id UUID REFERENCES departments(id),
    status VARCHAR(30) DEFAULT 'open',
    memo TEXT,
    subtotal DECIMAL(20,4) DEFAULT 0,
    tax_amount DECIMAL(20,4) DEFAULT 0,
    total_amount DECIMAL(20,4) DEFAULT 0,
    amount_paid DECIMAL(20,4) DEFAULT 0,
    amount_due DECIMAL(20,4) DEFAULT 0,
    ap_account_id UUID REFERENCES accounts(id),
    is_posted BOOLEAN DEFAULT false,
    posted_by UUID,
    posted_at TIMESTAMPTZ,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, bill_number)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS vendor_bill_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID NOT NULL REFERENCES vendor_bills(id) ON DELETE CASCADE,
    po_line_id UUID REFERENCES purchase_order_lines(id),
    line_number INTEGER NOT NULL,
    item_id UUID REFERENCES items(id),
    description TEXT,
    quantity DECIMAL(20,6),
    uom_id UUID REFERENCES units_of_measure(id),
    unit_price DECIMAL(20,4) DEFAULT 0,
    tax_code_id UUID REFERENCES tax_codes(id),
    tax_amount DECIMAL(20,4) DEFAULT 0,
    amount DECIMAL(20,4) DEFAULT 0,
    expense_account_id UUID REFERENCES accounts(id),
    department_id UUID REFERENCES departments(id),
    location_id UUID REFERENCES locations(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS vendor_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    payment_number VARCHAR(30) NOT NULL,
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    payment_date DATE NOT NULL,
    amount DECIMAL(20,4) NOT NULL,
    currency VARCHAR(10) DEFAULT 'IDR',
    payment_method VARCHAR(50) DEFAULT 'bank_transfer',
    reference VARCHAR(100),
    bank_account_id UUID REFERENCES accounts(id),
    ap_account_id UUID REFERENCES accounts(id),
    subsidiary_id UUID,
    department_id UUID REFERENCES departments(id),
    location_id UUID REFERENCES locations(id),
    unapplied_amount DECIMAL(20,4) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'posted',
    is_posted BOOLEAN DEFAULT false,
    posted_by UUID,
    posted_at TIMESTAMPTZ,
    memo TEXT,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, payment_number)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS bill_payment_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES vendor_payments(id),
    bill_id UUID NOT NULL REFERENCES vendor_bills(id),
    applied_amount DECIMAL(20,4) NOT NULL,
    applied_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS vendor_prepayments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    prepayment_number VARCHAR(30) NOT NULL,
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    payment_date DATE NOT NULL,
    amount DECIMAL(20,4) NOT NULL,
    bank_account_id UUID REFERENCES accounts(id),
    payment_method VARCHAR(50) DEFAULT 'bank_transfer',
    reference VARCHAR(100),
    department_id UUID REFERENCES departments(id),
    location_id UUID REFERENCES locations(id),
    memo TEXT,
    amount_applied DECIMAL(20,4) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'unapplied',
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, prepayment_number)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS vendor_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    return_number VARCHAR(30) NOT NULL,
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    return_date DATE NOT NULL,
    po_id UUID REFERENCES purchase_orders(id),
    department_id UUID REFERENCES departments(id),
    location_id UUID REFERENCES locations(id),
    memo TEXT,
    total_amount DECIMAL(20,4) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'open',
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, return_number)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS vendor_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    credit_number VARCHAR(30) NOT NULL,
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    credit_date DATE NOT NULL,
    department_id UUID REFERENCES departments(id),
    location_id UUID REFERENCES locations(id),
    memo TEXT,
    total_amount DECIMAL(20,4) DEFAULT 0,
    applied_amount DECIMAL(20,4) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'open',
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, credit_number)
  )`);
  console.log('✓ purchase_orders, vendor_bills, vendor_payments');

  // ── Bank Tables ───────────────────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS bank_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    check_number VARCHAR(50) NOT NULL,
    check_number_manual VARCHAR(50),
    check_date DATE NOT NULL,
    pay_to VARCHAR(300) NOT NULL,
    vendor_id UUID REFERENCES vendors(id),
    bank_account_id UUID NOT NULL REFERENCES accounts(id),
    expense_account_id UUID REFERENCES accounts(id),
    amount DECIMAL(20,4) NOT NULL DEFAULT 0,
    memo TEXT,
    address TEXT,
    department_id UUID REFERENCES departments(id),
    location_id UUID REFERENCES locations(id),
    posting_period_id UUID REFERENCES accounting_periods(id),
    status VARCHAR(30) DEFAULT 'issued',
    is_posted BOOLEAN DEFAULT false,
    posted_by UUID,
    posted_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS bank_check_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_id UUID NOT NULL REFERENCES bank_checks(id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(id),
    account_code VARCHAR(30),
    account_name VARCHAR(200),
    amount DECIMAL(20,4) DEFAULT 0,
    tax_code VARCHAR(30),
    tax_rate DECIMAL(8,4) DEFAULT 0,
    tax_amt DECIMAL(20,4) DEFAULT 0,
    gross_amt DECIMAL(20,4) DEFAULT 0,
    memo TEXT,
    department_id UUID REFERENCES departments(id),
    location_id UUID REFERENCES locations(id),
    department_name VARCHAR(200),
    location_name VARCHAR(200),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS bank_check_item_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_id UUID NOT NULL REFERENCES bank_checks(id) ON DELETE CASCADE,
    item_id UUID REFERENCES items(id),
    item_code VARCHAR(50),
    item_name VARCHAR(200),
    description TEXT,
    quantity DECIMAL(20,6) DEFAULT 1,
    unit VARCHAR(30),
    unit_price DECIMAL(20,4) DEFAULT 0,
    amount DECIMAL(20,4) DEFAULT 0,
    tax_code VARCHAR(30),
    tax_rate DECIMAL(8,4) DEFAULT 0,
    tax_amt DECIMAL(20,4) DEFAULT 0,
    gross_amt DECIMAL(20,4) DEFAULT 0,
    memo TEXT,
    department_id UUID REFERENCES departments(id),
    location_id UUID REFERENCES locations(id),
    department_name VARCHAR(200),
    location_name VARCHAR(200),
    inventory_account_id UUID REFERENCES accounts(id),
    inventory_account_code VARCHAR(30),
    inventory_account_name VARCHAR(200),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS bank_deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    deposit_number VARCHAR(50) NOT NULL,
    deposit_date DATE NOT NULL,
    bank_account_id UUID REFERENCES accounts(id),
    reference VARCHAR(100),
    memo TEXT,
    total_amount DECIMAL(20,4) DEFAULT 0,
    department_id UUID REFERENCES departments(id),
    location_id UUID REFERENCES locations(id),
    status VARCHAR(30) DEFAULT 'posted',
    updated_by UUID,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS bank_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    transfer_number VARCHAR(50) NOT NULL,
    transfer_date DATE NOT NULL,
    from_account_id UUID REFERENCES accounts(id),
    to_account_id UUID REFERENCES accounts(id),
    amount DECIMAL(20,4) NOT NULL,
    reference VARCHAR(100),
    memo TEXT,
    department_id UUID REFERENCES departments(id),
    location_id UUID REFERENCES locations(id),
    status VARCHAR(30) DEFAULT 'posted',
    updated_by UUID,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  console.log('✓ bank_checks, bank_deposits, bank_transfers');

  // ── Employee / Expense ────────────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS expense_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    report_number VARCHAR(50) NOT NULL,
    employee_name VARCHAR(200) NOT NULL,
    department_id UUID REFERENCES departments(id),
    location_id UUID REFERENCES locations(id),
    report_period_start DATE,
    report_period_end DATE,
    purpose TEXT,
    memo TEXT,
    total_amount DECIMAL(20,4) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'submitted',
    updated_by UUID,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, report_number)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS expense_report_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
    date DATE,
    category VARCHAR(100),
    description TEXT,
    amount DECIMAL(20,4) DEFAULT 0,
    receipt VARCHAR(100),
    account_id UUID REFERENCES accounts(id),
    department_id UUID REFERENCES departments(id),
    location_id UUID REFERENCES locations(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  console.log('✓ expense_reports');

  // ── Manufacturing ─────────────────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS boms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    bom_number VARCHAR(30) NOT NULL,
    name VARCHAR(200) NOT NULL,
    finished_good_id UUID REFERENCES items(id),
    quantity DECIMAL(20,6) DEFAULT 1,
    uom_id UUID REFERENCES units_of_measure(id),
    status VARCHAR(30) DEFAULT 'active',
    version INTEGER DEFAULT 1,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, bom_number)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS bom_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bom_id UUID NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    item_id UUID NOT NULL REFERENCES items(id),
    quantity DECIMAL(20,6) NOT NULL,
    uom_id UUID REFERENCES units_of_measure(id),
    scrap_percent DECIMAL(8,4) DEFAULT 0,
    is_phantom BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS work_centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    code VARCHAR(30) NOT NULL,
    name VARCHAR(200) NOT NULL,
    capacity DECIMAL(20,4) DEFAULT 1,
    cost_per_hour DECIMAL(20,4) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS work_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    wo_number VARCHAR(30) NOT NULL,
    bom_id UUID REFERENCES boms(id),
    item_id UUID REFERENCES items(id),
    planned_quantity DECIMAL(20,6) NOT NULL,
    completed_quantity DECIMAL(20,6) DEFAULT 0,
    scrapped_quantity DECIMAL(20,6) DEFAULT 0,
    uom_id UUID REFERENCES units_of_measure(id),
    planned_start_date DATE,
    planned_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,
    location_id UUID REFERENCES locations(id),
    department_id UUID REFERENCES departments(id),
    priority VARCHAR(20) DEFAULT 'normal',
    status VARCHAR(30) DEFAULT 'planned',
    memo TEXT,
    estimated_material_cost DECIMAL(20,4) DEFAULT 0,
    estimated_labor_cost DECIMAL(20,4) DEFAULT 0,
    estimated_machine_cost DECIMAL(20,4) DEFAULT 0,
    estimated_overhead_cost DECIMAL(20,4) DEFAULT 0,
    actual_material_cost DECIMAL(20,4) DEFAULT 0,
    actual_labor_cost DECIMAL(20,4) DEFAULT 0,
    actual_machine_cost DECIMAL(20,4) DEFAULT 0,
    actual_overhead_cost DECIMAL(20,4) DEFAULT 0,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, wo_number)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS work_order_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wo_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id),
    planned_quantity DECIMAL(20,6) NOT NULL,
    issued_quantity DECIMAL(20,6) DEFAULT 0,
    uom_id UUID REFERENCES units_of_measure(id),
    standard_cost DECIMAL(20,4) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS assembly_builds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    build_number VARCHAR(30) NOT NULL,
    item_id UUID REFERENCES items(id),
    quantity DECIMAL(20,6) NOT NULL,
    build_date DATE,
    location_id UUID REFERENCES locations(id),
    department_id UUID REFERENCES departments(id),
    status VARCHAR(30) DEFAULT 'pending',
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, build_number)
  )`);
  console.log('✓ boms, work_orders, assembly_builds');

  // ── Inventory ─────────────────────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    location_id UUID REFERENCES locations(id),
    code VARCHAR(20) NOT NULL,
    name VARCHAR(200) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, code)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS bins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    code VARCHAR(30) NOT NULL,
    zone VARCHAR(50),
    aisle VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS inventory_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    item_id UUID NOT NULL REFERENCES items(id),
    location_id UUID REFERENCES locations(id),
    warehouse_id UUID REFERENCES warehouses(id),
    bin_id UUID REFERENCES bins(id),
    lot_number VARCHAR(100),
    serial_number VARCHAR(100),
    qty_on_hand DECIMAL(20,6) DEFAULT 0,
    qty_committed DECIMAL(20,6) DEFAULT 0,
    qty_on_order DECIMAL(20,6) DEFAULT 0,
    avg_cost DECIMAL(20,6) DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS inventory_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    adjustment_number VARCHAR(30) NOT NULL,
    adjustment_date DATE NOT NULL,
    location_id UUID REFERENCES locations(id),
    department_id UUID REFERENCES departments(id),
    memo TEXT,
    status VARCHAR(30) DEFAULT 'posted',
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, adjustment_number)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS inventory_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    subsidiary_id UUID REFERENCES subsidiaries(id),
    transfer_number VARCHAR(30) NOT NULL,
    transfer_date DATE NOT NULL,
    from_location_id UUID REFERENCES locations(id),
    to_location_id UUID REFERENCES locations(id),
    department_id UUID REFERENCES departments(id),
    memo TEXT,
    status VARCHAR(30) DEFAULT 'pending',
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, transfer_number)
  )`);
  console.log('✓ warehouses, inventory');

  // ── Document sequences ────────────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS document_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    document_type VARCHAR(50) NOT NULL,
    prefix VARCHAR(20),
    current_number INTEGER DEFAULT 0,
    pad_length INTEGER DEFAULT 6,
    include_year BOOLEAN DEFAULT true,
    UNIQUE(company_id, document_type)
  )`);

  // ── File Cabinet ──────────────────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS file_cabinet (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    source_type VARCHAR(100) NOT NULL,
    source_id UUID NOT NULL,
    file_name VARCHAR(500) NOT NULL,
    original_name VARCHAR(500) NOT NULL,
    mime_type VARCHAR(200),
    file_size BIGINT DEFAULT 0,
    file_ext VARCHAR(20),
    storage_path TEXT NOT NULL,
    title VARCHAR(500),
    description TEXT,
    folder VARCHAR(200) DEFAULT 'Attachments',
    is_deleted BOOLEAN DEFAULT false,
    uploaded_by UUID,
    uploaded_by_name VARCHAR(200),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fc_source ON file_cabinet(source_type, source_id)');

  // ── Custom Forms ──────────────────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS custom_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    code VARCHAR(100) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT, module VARCHAR(100), transaction_type VARCHAR(100),
    printing_type VARCHAR(20) DEFAULT 'basic',
    is_active BOOLEAN DEFAULT true, allow_add_multiple BOOLEAN DEFAULT false,
    store_form_with_record BOOLEAN DEFAULT true, form_is_preferred BOOLEAN DEFAULT false,
    version INTEGER DEFAULT 1, custom_script TEXT,
    created_by UUID, updated_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, code)
  )`);
  console.log('✓ file_cabinet, custom_forms');

  // ── Approval workflow ─────────────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS approval_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    name VARCHAR(200) NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    min_amount DECIMAL(20,4),
    max_amount DECIMAL(20,4),
    department_id UUID REFERENCES departments(id),
    location_id UUID REFERENCES locations(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await run(`CREATE TABLE IF NOT EXISTS approval_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES approval_workflows(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    approver_type VARCHAR(30) NOT NULL,
    approver_user_id UUID REFERENCES users(id),
    is_mandatory BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  console.log('✓ approval_workflows');

  // ── Seed initial data ─────────────────────────────────────────────────────
  console.log('\n🌱 Seeding initial data...');

  // Company
  const compResult = await pool.query(`
    INSERT INTO companies (code, name, legal_name, tax_id, address, city, country, currency)
    VALUES ('CLOUDMFG', 'Cloud Manufacturing Indonesia', 'PT Cloud Manufacturing Indonesia', '01.234.567.8-901.000', 'Jl. Industri No. 1', 'Jakarta', 'Indonesia', 'IDR')
    ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name
    RETURNING id`);
  const companyId = compResult.rows[0].id;
  console.log('  ✓ Company:', companyId);

  // Subsidiary
  const subResult = await pool.query(`
    INSERT INTO subsidiaries (company_id, code, name, currency)
    VALUES ($1, 'PC', 'Parent Company', 'IDR')
    ON CONFLICT DO NOTHING RETURNING id`, [companyId]);
  const subId = subResult.rows[0]?.id;

  // Departments
  const depts = [
    ['FIN', 'Finance & Accounting'], ['OPS', 'Operations'], ['HR', 'Human Resources'],
    ['IT', 'Information Technology'], ['MFG', 'Manufacturing'], ['PURCH', 'Purchasing'],
    ['SALES', 'Sales'], ['MGMT', 'Management'],
  ];
  for (const [code, name] of depts) {
    await pool.query(`INSERT INTO departments (company_id, code, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [companyId, code, name]);
  }

  // Locations
  const locs = [['HQ', 'Head Office - Jakarta'], ['ACP', 'ACP Facility'], ['WH1', 'Warehouse 1'], ['WH2', 'Warehouse 2']];
  for (const [code, name] of locs) {
    await pool.query(`INSERT INTO locations (company_id, code, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [companyId, code, name]);
  }
  console.log('  ✓ Departments & Locations');

  // UOM
  const uoms = [['EA', 'Each'], ['KG', 'Kilogram'], ['M', 'Meter'], ['L', 'Liter'], ['BOX', 'Box'], ['ROLL', 'Roll'], ['SET', 'Set'], ['PCS', 'Pieces']];
  for (const [code, name] of uoms) {
    await pool.query(`INSERT INTO units_of_measure (company_id, code, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [companyId, code, name]);
  }

  // COA (Chart of Accounts)
  const accounts_data = [
    // Assets
    ['1000', 'Current Assets', 'asset', 'current_assets_header'],
    ['1010', 'Kas Besar', 'asset', 'bank', true],
    ['1020', 'Kas Kecil', 'asset', 'bank', true],
    ['1025', 'Petty Cash', 'asset', 'bank', true],
    ['1030', 'Bank BCA', 'asset', 'bank', true],
    ['1035', 'Bank Mandiri', 'asset', 'bank', true],
    ['1040', 'Bank BRI', 'asset', 'bank', true],
    ['1050', 'Bank BNI', 'asset', 'bank', true],
    ['1200', 'Accounts Receivable', 'asset', 'receivable'],
    ['1210', 'Allowance for Doubtful Accounts', 'asset', 'receivable'],
    ['1300', 'Inventory - Raw Material', 'asset', 'inventory'],
    ['1310', 'Inventory - WIP', 'asset', 'inventory'],
    ['1320', 'Inventory - Finished Goods', 'asset', 'inventory'],
    ['1330', 'Inventory - Packaging', 'asset', 'inventory'],
    ['1400', 'Prepaid Expenses', 'asset', 'current_assets'],
    ['1500', 'Fixed Assets', 'asset', 'fixed_assets_header'],
    ['1510', 'Land & Building', 'asset', 'fixed_assets'],
    ['1520', 'Machinery & Equipment', 'asset', 'fixed_assets'],
    ['1530', 'Vehicles', 'asset', 'fixed_assets'],
    ['1590', 'Accumulated Depreciation', 'asset', 'fixed_assets'],
    // Liabilities
    ['2000', 'Current Liabilities', 'liability', 'current_liabilities_header'],
    ['2100', 'Accounts Payable', 'liability', 'payable'],
    ['2110', 'Accrued AP / GR-IR', 'liability', 'accrued_liabilities'],
    ['2120', 'Accrued Expenses', 'liability', 'accrued_liabilities'],
    ['2200', 'Tax Payable', 'liability', 'current_liabilities'],
    ['2210', 'PPN Keluaran', 'liability', 'tax_payable'],
    ['2220', 'PPN Masukan', 'asset', 'tax_receivable'],
    ['2300', 'PPN Payable', 'liability', 'tax_payable'],
    ['2400', 'Income Tax Payable', 'liability', 'tax_payable'],
    ['2500', 'Wages Payable', 'liability', 'current_liabilities'],
    ['2600', 'Short-term Loans', 'liability', 'current_liabilities'],
    ['3000', 'Long-term Liabilities', 'liability', 'long_term_liabilities_header'],
    ['3100', 'Long-term Bank Loans', 'liability', 'long_term_liabilities'],
    // Equity
    ['4000', 'Equity', 'equity', 'equity_header'],
    ['4100', 'Paid-in Capital', 'equity', 'equity'],
    ['4200', 'Retained Earnings', 'equity', 'equity'],
    ['4300', 'Current Year Earnings', 'equity', 'equity'],
    // Revenue
    ['5000', 'Revenue', 'income', 'income_header'],
    ['5100', 'Sales Revenue', 'income', 'income'],
    ['5200', 'Service Revenue', 'income', 'income'],
    ['5300', 'Other Income', 'income', 'other_income'],
    ['5400', 'Discount Allowed', 'income', 'income'],
    ['5450', 'Sales Discount', 'income', 'sales_discount'],
    // COGS
    ['6000', 'Cost of Goods Sold', 'cost_of_goods', 'cost_of_goods_header'],
    ['6100', 'Cost of Goods Sold - Products', 'cost_of_goods', 'cost_of_goods'],
    ['6200', 'Cost of Services', 'cost_of_goods', 'cost_of_goods'],
    ['6300', 'Material Cost', 'cost_of_goods', 'cost_of_goods'],
    ['6400', 'Labor Cost', 'cost_of_goods', 'cost_of_goods'],
    ['6500', 'Manufacturing Overhead', 'cost_of_goods', 'cost_of_goods'],
    ['6600', 'Purchase Discount', 'cost_of_goods', 'purchase_discount'],
    // Operating Expenses
    ['7000', 'Operating Expenses', 'expense', 'expense_header'],
    ['7100', 'Salaries & Wages', 'expense', 'expense'],
    ['7200', 'Rent Expense', 'expense', 'expense'],
    ['7300', 'Utilities Expense', 'expense', 'expense'],
    ['7400', 'Depreciation Expense', 'expense', 'expense'],
    ['7500', 'Transportation Expense', 'expense', 'expense'],
    ['7600', 'Communication Expense', 'expense', 'expense'],
    ['7700', 'Office Supplies Expense', 'expense', 'expense'],
    ['7800', 'Marketing & Advertising', 'expense', 'expense'],
    ['7900', 'Professional Fees', 'expense', 'expense'],
    ['8000', 'Other Expenses', 'expense', 'expense'],
    ['8100', 'Interest Expense', 'expense', 'other_expense'],
    ['8200', 'Bank Charges', 'expense', 'other_expense'],
  ];

  for (const acc of accounts_data) {
    const [code, name, type, subtype, isBank] = acc;
    await pool.query(
      `INSERT INTO accounts (company_id, code, name, type, subtype, is_bank) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [companyId, code, name, type, subtype, isBank === true]
    );
  }
  console.log('  ✓ Chart of Accounts (', accounts_data.length, 'accounts)');

  // Tax Codes
  await pool.query(`INSERT INTO tax_codes (company_id, code, name, rate, type) VALUES
    ($1, 'PPN11', 'PPN 11%', 11, 'sales'),
    ($1, 'PPN0', 'PPN 0%', 0, 'sales'),
    ($1, 'PPH23', 'PPh 23 (2%)', 2, 'withholding'),
    ($1, 'EXEMPT', 'Tax Exempt', 0, 'sales')
    ON CONFLICT DO NOTHING`, [companyId]);
  console.log('  ✓ Tax Codes');

  // Accounting periods (2025-2026)
  const years = [2025, 2026];
  for (const yr of years) {
    for (let m = 1; m <= 12; m++) {
      const startDate = `${yr}-${String(m).padStart(2,'0')}-01`;
      const lastDay = new Date(yr, m, 0).getDate();
      const endDate = `${yr}-${String(m).padStart(2,'0')}-${lastDay}`;
      const monthName = new Date(yr, m-1).toLocaleString('default', {month:'short'});
      await pool.query(
        `INSERT INTO accounting_periods (company_id, name, start_date, end_date, fiscal_year, period_number, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'open') ON CONFLICT DO NOTHING`,
        [companyId, `${monthName} ${yr}`, startDate, endDate, yr, m]
      );
    }
  }
  console.log('  ✓ Accounting Periods (2025-2026)');

  // Admin user (bcrypt hash of 'CloudERP@2026')
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('CloudERP@2026', 10);
  const userResult = await pool.query(`
    INSERT INTO users (company_id, subsidiary_id, name, email, password_hash, role, is_admin, department, position)
    VALUES ($1, $2, 'Administrator', 'admin@cloudmfg.co.id', $3, 'admin', true, 'Management', 'System Administrator')
    ON CONFLICT (company_id, email) DO UPDATE SET password_hash=$3, is_active=true, is_admin=true
    RETURNING id, email`, [companyId, subId, hash]);
  console.log('  ✓ Admin user:', userResult.rows[0].email);

  // Sample vendor
  await pool.query(`
    INSERT INTO vendors (company_id, vendor_number, name, type, currency, payment_terms)
    VALUES ($1, 'VND-001', 'PT Supplier Utama', 'company', 'IDR', 'Net30')
    ON CONFLICT DO NOTHING`, [companyId]);

  // Sample customer
  await pool.query(`
    INSERT INTO customers (company_id, customer_number, name, type, currency, payment_terms)
    VALUES ($1, 'CUS-001', 'PT Pelanggan Setia', 'company', 'IDR', 'Net30')
    ON CONFLICT DO NOTHING`, [companyId]);

  // Document sequences
  const seqTypes = [
    ['bank_check','CHK'],['bank_deposit','DEP'],['bank_transfer','TRF'],
    ['sales_order','SO'],['invoice','INV'],['quotation','QUO'],
    ['customer_payment','CPY'],['purchase_order','PO'],['vendor_bill','BILL'],
    ['purchase_requisition','PR'],['fulfillment','FF'],
    ['item_receipt','GRN'],['vendor_payment','VPY'],
    ['journal_entry','JE'],['expense_report','EXP'],['work_order','WO'],
    ['inventory_adjustment','IADJ'],['inventory_transfer','ITRF'],
    ['inventory_transfer_order','TO'],
  ];
  for (const [type, prefix] of seqTypes) {
    await pool.query(
      `INSERT INTO transaction_sequences (company_id, transaction_type, prefix, last_number, min_digits, include_year)
       VALUES ($1, $2, $3, 0, 4, true) ON CONFLICT DO NOTHING`,
      [companyId, type, prefix]
    );
    await pool.query(
      `INSERT INTO document_sequences (company_id, document_type, prefix, current_number, pad_length, include_year)
       VALUES ($1, $2, $3, 0, 4, true) ON CONFLICT DO NOTHING`,
      [companyId, type, prefix]
    );
  }
  console.log('  ✓ Document sequences');

  console.log('\n✅ Database initialization complete!');
  console.log('\n📋 Login credentials:');
  console.log('   Email:    admin@cloudmfg.co.id');
  console.log('   Password: CloudERP@2026\n');

  await pool.end();
}

main().catch(async (e) => {
  console.error('\n❌ Error:', e.message);
  await pool.end();
  process.exit(1);
});
