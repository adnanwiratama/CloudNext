'use strict';
const knex = require('knex');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const db = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'host.docker.internal',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'cloud_erp',
    user: process.env.DB_USER || 'erp_user',
    password: process.env.DB_PASSWORD || 'erp_secure_password',
  },
});

async function run() {
  console.log('Creating new module tables...');

  await db.raw(`CREATE TABLE IF NOT EXISTS bank_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL, check_number VARCHAR NOT NULL, check_date DATE NOT NULL,
    pay_to VARCHAR NOT NULL, vendor_id UUID, bank_account_id UUID, expense_account_id UUID,
    amount DECIMAL(18,2) NOT NULL, memo TEXT, address TEXT, status VARCHAR DEFAULT 'issued',
    created_by UUID, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  await db.raw(`CREATE TABLE IF NOT EXISTS bank_deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL, deposit_number VARCHAR NOT NULL, deposit_date DATE NOT NULL,
    bank_account_id UUID, reference VARCHAR, memo TEXT, total_amount DECIMAL(18,2) DEFAULT 0,
    status VARCHAR DEFAULT 'posted', created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  await db.raw(`CREATE TABLE IF NOT EXISTS bank_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL, transfer_number VARCHAR NOT NULL, transfer_date DATE NOT NULL,
    from_account_id UUID, to_account_id UUID, amount DECIMAL(18,2) NOT NULL,
    reference VARCHAR, memo TEXT, status VARCHAR DEFAULT 'posted', created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  await db.raw(`CREATE TABLE IF NOT EXISTS customer_deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL, deposit_number VARCHAR NOT NULL, customer_id UUID NOT NULL,
    deposit_date DATE NOT NULL, amount DECIMAL(18,2) NOT NULL, bank_account_id UUID,
    payment_method VARCHAR DEFAULT 'bank_transfer', reference VARCHAR, sales_order_id UUID,
    memo TEXT, amount_applied DECIMAL(18,2) DEFAULT 0, status VARCHAR DEFAULT 'posted',
    created_by UUID, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  await db.raw(`CREATE TABLE IF NOT EXISTS return_authorizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL, ra_number VARCHAR NOT NULL, customer_id UUID NOT NULL,
    return_date DATE NOT NULL, original_invoice_number VARCHAR, return_reason VARCHAR,
    location_id UUID, memo TEXT, total_amount DECIMAL(18,2) DEFAULT 0, status VARCHAR DEFAULT 'open',
    created_by UUID, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  await db.raw(`CREATE TABLE IF NOT EXISTS return_authorization_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ra_id UUID NOT NULL REFERENCES return_authorizations(id),
    item_id UUID, description TEXT, qty DECIMAL(14,4) DEFAULT 0, unit_price DECIMAL(18,4) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  await db.raw(`CREATE TABLE IF NOT EXISTS credit_memo_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_memo_id UUID NOT NULL, item_id UUID, description TEXT,
    qty DECIMAL(14,4) DEFAULT 0, unit_price DECIMAL(18,4) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  await db.raw(`ALTER TABLE credit_memos ADD COLUMN IF NOT EXISTS original_invoice_number VARCHAR`);
  await db.raw(`ALTER TABLE credit_memos ADD COLUMN IF NOT EXISTS reason VARCHAR`);
  await db.raw(`ALTER TABLE credit_memos ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,2) DEFAULT 0`);
  await db.raw(`ALTER TABLE credit_memos ADD COLUMN IF NOT EXISTS subtotal DECIMAL(18,2) DEFAULT 0`);
  await db.raw(`ALTER TABLE credit_memos ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(18,2) DEFAULT 0`);

  await db.raw(`CREATE TABLE IF NOT EXISTS customer_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL, refund_number VARCHAR NOT NULL, customer_id UUID NOT NULL,
    refund_date DATE NOT NULL, amount DECIMAL(18,2) NOT NULL, bank_account_id UUID,
    payment_method VARCHAR DEFAULT 'bank_transfer', reference VARCHAR,
    credit_memo_number VARCHAR, reason VARCHAR, memo TEXT, status VARCHAR DEFAULT 'posted',
    created_by UUID, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  await db.raw(`CREATE TABLE IF NOT EXISTS vendor_prepayments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL, prepayment_number VARCHAR NOT NULL, vendor_id UUID NOT NULL,
    payment_date DATE NOT NULL, amount DECIMAL(18,2) NOT NULL, bank_account_id UUID,
    payment_method VARCHAR DEFAULT 'bank_transfer', reference VARCHAR, purchase_order_id UUID,
    memo TEXT, amount_applied DECIMAL(18,2) DEFAULT 0, status VARCHAR DEFAULT 'unapplied',
    created_by UUID, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  await db.raw(`CREATE TABLE IF NOT EXISTS vendor_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL, return_number VARCHAR NOT NULL, vendor_id UUID NOT NULL,
    return_date DATE NOT NULL, original_po_number VARCHAR, return_reason VARCHAR,
    location_id UUID, memo TEXT, total_amount DECIMAL(18,2) DEFAULT 0, status VARCHAR DEFAULT 'posted',
    created_by UUID, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  await db.raw(`CREATE TABLE IF NOT EXISTS vendor_return_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id UUID NOT NULL REFERENCES vendor_returns(id),
    item_id UUID, description TEXT, qty DECIMAL(14,4) DEFAULT 0, unit_price DECIMAL(18,4) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  await db.raw(`CREATE TABLE IF NOT EXISTS vendor_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL, credit_number VARCHAR NOT NULL, vendor_id UUID NOT NULL,
    credit_date DATE NOT NULL, vendor_credit_memo_number VARCHAR, original_bill_number VARCHAR,
    reason VARCHAR, memo TEXT, total_amount DECIMAL(18,2) DEFAULT 0,
    amount_applied DECIMAL(18,2) DEFAULT 0, status VARCHAR DEFAULT 'open',
    created_by UUID, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  await db.raw(`CREATE TABLE IF NOT EXISTS vendor_credit_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_id UUID NOT NULL REFERENCES vendor_credits(id),
    item_id UUID, description TEXT, qty DECIMAL(14,4) DEFAULT 0, unit_price DECIMAL(18,4) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  await db.raw(`CREATE TABLE IF NOT EXISTS vendor_bill_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID, item_id UUID, description TEXT, account_id UUID,
    qty DECIMAL(14,4) DEFAULT 0, unit_price DECIMAL(18,4) DEFAULT 0, amount DECIMAL(18,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  await db.raw(`CREATE TABLE IF NOT EXISTS inventory_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL, adjustment_number VARCHAR NOT NULL, adjustment_date DATE NOT NULL,
    adjustment_type VARCHAR DEFAULT 'quantity', reason VARCHAR, account_id UUID, memo TEXT,
    status VARCHAR DEFAULT 'posted', created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  await db.raw(`CREATE TABLE IF NOT EXISTS inventory_adjustment_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    adjustment_id UUID NOT NULL REFERENCES inventory_adjustments(id),
    item_id UUID NOT NULL, location_id UUID NOT NULL, adjust_qty DECIMAL(14,4) NOT NULL,
    unit_cost DECIMAL(18,4) DEFAULT 0, reason VARCHAR,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  await db.raw(`CREATE TABLE IF NOT EXISTS inventory_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL, transfer_number VARCHAR NOT NULL, transfer_date DATE NOT NULL,
    from_location_id UUID NOT NULL, to_location_id UUID NOT NULL, reference VARCHAR, memo TEXT,
    status VARCHAR DEFAULT 'posted', created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  await db.raw(`CREATE TABLE IF NOT EXISTS inventory_transfer_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID NOT NULL REFERENCES inventory_transfers(id),
    item_id UUID NOT NULL, qty DECIMAL(14,4) NOT NULL, unit_cost DECIMAL(18,4) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  await db.raw(`CREATE TABLE IF NOT EXISTS inventory_transfer_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL, transfer_order_number VARCHAR NOT NULL, order_date DATE NOT NULL,
    expected_date DATE, from_location_id UUID NOT NULL, to_location_id UUID NOT NULL,
    priority VARCHAR DEFAULT 'normal', memo TEXT, status VARCHAR DEFAULT 'pending',
    created_by UUID, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  await db.raw(`CREATE TABLE IF NOT EXISTS inventory_transfer_order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_order_id UUID NOT NULL REFERENCES inventory_transfer_orders(id),
    item_id UUID NOT NULL, qty_requested DECIMAL(14,4) NOT NULL,
    qty_transferred DECIMAL(14,4) DEFAULT 0, requested_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  await db.raw(`CREATE TABLE IF NOT EXISTS assembly_builds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL, build_number VARCHAR NOT NULL, build_date DATE NOT NULL,
    assembly_item_id UUID NOT NULL, bom_id UUID, build_qty DECIMAL(14,4) NOT NULL,
    location_id UUID NOT NULL, work_order_id UUID, memo TEXT, status VARCHAR DEFAULT 'posted',
    created_by UUID, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  await db.raw(`CREATE TABLE IF NOT EXISTS expense_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL, report_number VARCHAR NOT NULL, employee_name VARCHAR NOT NULL,
    department VARCHAR, report_period_start DATE, report_period_end DATE,
    purpose TEXT, memo TEXT, total_amount DECIMAL(18,2) DEFAULT 0,
    status VARCHAR DEFAULT 'submitted', created_by UUID, approved_by UUID, approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  await db.raw(`CREATE TABLE IF NOT EXISTS expense_report_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES expense_reports(id),
    expense_date DATE, category VARCHAR, description TEXT, account_id UUID,
    receipt_number VARCHAR, amount DECIMAL(18,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);

  await db.raw(`ALTER TABLE tax_codes ADD COLUMN IF NOT EXISTS tax_type VARCHAR DEFAULT 'vat'`);
  await db.raw(`ALTER TABLE accounting_periods ADD COLUMN IF NOT EXISTS company_id UUID`);

  // Check final count
  const result = await db.raw(`SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema='public'`);
  console.log(`Migration complete! Total tables: ${result.rows[0].cnt}`);
  await db.destroy();
}

run().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
