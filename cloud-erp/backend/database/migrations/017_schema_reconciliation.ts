import { Knex } from 'knex';

// ─────────────────────────────────────────────────────────────────────────────
// Schema reconciliation.
//
// During development the local database drifted from the official migrations via
// manual scripts (scripts/fix-columns*.js, migrate-dept-location.js,
// migrate-file-cabinet.js). A freshly-migrated production DB was therefore missing
// many columns/tables the app writes to (e.g. users.employee_number, file_cabinet,
// bank_deposit_lines, dept/location/subsidiary on most transaction tables), which
// made features that work on localhost fail in production.
//
// This migration replays all of those changes idempotently (ADD COLUMN IF NOT
// EXISTS / CREATE TABLE IF NOT EXISTS), so it is safe to run on both a fresh DB and
// an already-patched one. It brings every environment to the same schema.
// ─────────────────────────────────────────────────────────────────────────────

export async function up(knex: Knex): Promise<void> {
  const col = (table: string, name: string, type: string) =>
    knex.raw(`ALTER TABLE IF EXISTS ${table} ADD COLUMN IF NOT EXISTS ${name} ${type}`);

  // ── Department / Location / Subsidiary / updated_by on header transaction tables ──
  const deptLocTables = [
    'bank_checks', 'bank_deposits', 'bank_transfers', 'sales_orders', 'quotations', 'invoices',
    'customer_payments', 'item_fulfillments', 'return_authorizations', 'credit_memos',
    'purchase_orders', 'vendor_bills', 'item_receipts', 'vendor_payments', 'vendor_prepayments',
    'vendor_returns', 'vendor_credits', 'expense_reports', 'work_orders', 'assembly_builds',
    'inventory_adjustments', 'inventory_transfers', 'journal_entries',
  ];
  for (const t of deptLocTables) {
    await col(t, 'department_id', 'UUID');
    await col(t, 'location_id', 'UUID');
    await col(t, 'subsidiary_id', 'UUID');
    await col(t, 'updated_by', 'UUID');
  }

  // ── Line-level dept / location ──
  const lineTables = [
    'sales_order_lines', 'quotation_lines', 'invoice_lines', 'purchase_order_lines',
    'vendor_bill_lines', 'item_receipt_lines', 'credit_memo_lines', 'expense_report_lines',
    'journal_entry_lines', 'bank_check_lines', 'bank_check_item_lines',
    'vendor_return_lines', 'vendor_credit_lines',
  ];
  for (const t of lineTables) {
    await col(t, 'department_id', 'UUID');
    await col(t, 'location_id', 'UUID');
  }

  // ── is_deleted on transaction tables ──
  const isDeletedTables = [
    'journal_entries', 'vendor_bills', 'work_orders', 'item_receipts', 'item_fulfillments',
    'customer_payments', 'vendor_payments', 'bank_deposits', 'bank_transfers', 'expense_reports',
    'return_authorizations', 'credit_memos', 'vendor_prepayments', 'vendor_returns', 'vendor_credits',
    'assembly_builds', 'inventory_adjustments', 'inventory_transfers', 'boms', 'bank_checks',
  ];
  for (const t of isDeletedTables) await col(t, 'is_deleted', 'BOOLEAN DEFAULT false');

  // ── users: employee-record columns referenced by create/update employee ──
  await col('users', 'department_id', 'UUID');
  await col('users', 'location_id', 'UUID');
  await col('users', 'employee_number', 'VARCHAR(50)');
  await col('users', 'department', 'VARCHAR(200)');
  await col('users', 'position', 'VARCHAR(200)');

  // ── subsidiaries: NetSuite-style fields written by create/update subsidiary ──
  await col('subsidiaries', 'legal_name', 'VARCHAR(300)');
  await col('subsidiaries', 'parent_id', 'UUID');
  await col('subsidiaries', 'state', 'VARCHAR(100)');
  await col('subsidiaries', 'address', 'TEXT');
  await col('subsidiaries', 'web_site', 'VARCHAR(300)');
  await col('subsidiaries', 'document_number_prefix', 'VARCHAR(50)');
  await col('subsidiaries', 'return_email', 'VARCHAR(200)');
  await col('subsidiaries', 'fax', 'VARCHAR(50)');
  await col('subsidiaries', 'elimination', 'BOOLEAN DEFAULT false');

  // ── roles: permissions JSON (code reads/writes role.permissions) ──
  await col('roles', 'permissions', 'JSONB');
  await col('roles', 'is_active', 'BOOLEAN DEFAULT true');

  // ── journal_entries header totals ──
  await col('journal_entries', 'total_debit', 'DECIMAL(20,4) DEFAULT 0');
  await col('journal_entries', 'total_credit', 'DECIMAL(20,4) DEFAULT 0');

  // ── inventory line UOM ──
  await col('inventory_adjustment_lines', 'uom_id', 'UUID');
  await col('inventory_transfer_lines', 'uom_id', 'UUID');

  // ── Sales rep + shipping on sales docs ──
  for (const t of ['sales_orders', 'quotations', 'invoices']) await col(t, 'sales_rep_id', 'UUID');
  await col('sales_orders', 'shipping_address', 'TEXT');
  await col('sales_orders', 'shipping_method', 'VARCHAR(100)');
  await col('sales_orders', 'warehouse_id', 'UUID');
  await col('quotations', 'shipping_address', 'TEXT');
  await col('invoices', 'shipping_address', 'TEXT');
  await col('invoices', 'so_id', 'UUID');
  await col('invoices', 'warehouse_id', 'UUID');
  await col('item_receipts', 'warehouse_id', 'UUID');
  await col('item_fulfillments', 'warehouse_id', 'UUID');

  // ── Amounts / misc columns referenced by create routes ──
  await col('invoices', 'discount_amount', 'DECIMAL(20,4) DEFAULT 0');
  await col('invoices', 'shipping_amount', 'DECIMAL(20,4) DEFAULT 0');
  await col('invoices', 'exchange_rate', 'DECIMAL(20,6) DEFAULT 1');
  await col('quotations', 'discount_amount', 'DECIMAL(20,4) DEFAULT 0');
  await col('quotations', 'shipping_amount', 'DECIMAL(20,4) DEFAULT 0');
  await col('quotations', 'valid_until', 'DATE');
  await col('quotations', 'tax_rate', 'DECIMAL(8,4) DEFAULT 0');
  await col('quotations', 'payment_terms', 'VARCHAR(50)');
  await col('quotations', 'price_level', 'VARCHAR(50)');
  await col('purchase_orders', 'pr_id', 'UUID');
  await col('purchase_orders', 'warehouse_id', 'UUID');
  await col('purchase_orders', 'discount_amount', 'DECIMAL(20,4) DEFAULT 0');
  await col('purchase_orders', 'shipping_amount', 'DECIMAL(20,4) DEFAULT 0');
  await col('vendor_bills', 'tax_rate', 'DECIMAL(8,4) DEFAULT 0');
  await col('vendor_bills', 'discount_amount', 'DECIMAL(20,4) DEFAULT 0');
  await col('vendor_bills', 'vendor_bill_number', 'VARCHAR(100)');
  await col('customer_payments', 'exchange_rate', 'DECIMAL(20,6) DEFAULT 1');
  await col('vendor_payments', 'exchange_rate', 'DECIMAL(20,6) DEFAULT 1');
  await col('expense_reports', 'title', 'VARCHAR(300)');
  await col('expense_reports', 'department', 'VARCHAR(200)');
  await col('expense_reports', 'purpose', 'TEXT');
  await col('expense_report_lines', 'expense_date', 'DATE');
  await col('expense_report_lines', 'receipt', 'VARCHAR(100)');
  await col('expense_report_lines', 'receipt_number', 'VARCHAR(100)');
  await col('sales_order_lines', 'expected_ship_date', 'DATE');
  await col('sales_order_lines', 'qty_fulfilled', 'DECIMAL(20,6) DEFAULT 0');
  await col('sales_order_lines', 'qty_billed', 'DECIMAL(20,6) DEFAULT 0');

  // ── Bank check extras ──
  await col('bank_checks', 'document_number', 'VARCHAR(50)');
  await col('bank_checks', 'check_number_manual', 'VARCHAR(50)');
  await col('bank_checks', 'posting_period_id', 'UUID');
  await col('bank_check_lines', 'line_number', 'INTEGER DEFAULT 1');
  await col('bank_check_lines', 'department', 'VARCHAR(200)');
  await col('bank_check_lines', 'customer', 'VARCHAR(200)');
  await col('bank_check_lines', 'billable', 'BOOLEAN DEFAULT false');

  // ── Items ──
  await col('items', 'reorder_point', 'DECIMAL(20,4) DEFAULT 0');
  await col('items', 'safety_stock', 'DECIMAL(20,4) DEFAULT 0');
  await col('items', 'lead_time_days', 'INTEGER DEFAULT 0');
  await col('items', 'is_lot_tracked', 'BOOLEAN DEFAULT false');
  await col('items', 'is_serial_tracked', 'BOOLEAN DEFAULT false');
  await col('items', 'preferred_vendor_id', 'UUID');
  await col('items', 'last_purchase_price', 'DECIMAL(20,4) DEFAULT 0');
  await col('items', 'purchase_price', 'DECIMAL(20,4) DEFAULT 0');
  await col('items', 'sale_price', 'DECIMAL(20,4) DEFAULT 0');
  await col('items', 'is_deleted', 'BOOLEAN DEFAULT false');

  // ── Customers / Vendors ──
  await col('customers', 'sales_rep_id', 'UUID');
  await col('customers', 'subsidiary_id', 'UUID');
  await col('vendors', 'subsidiary_id', 'UUID');

  // ── inventory_balances ──
  await col('inventory_balances', 'qty_available', 'DECIMAL(20,6) DEFAULT 0');

  // ── currencies: reconcile the two historical shapes ──
  // Migration 001 made `currencies` with a string PK `code`; migration 015 (skipped
  // on fresh DBs because of its hasTable guard) used id/company_id/iso_code. The
  // currency CRUD code expects the 015 shape, so ensure those columns exist on
  // whichever table is present. (gen_random_uuid default lets existing rows get ids.)
  await col('currencies', 'id', 'UUID DEFAULT gen_random_uuid()');
  await col('currencies', 'company_id', 'UUID');
  await col('currencies', 'iso_code', 'VARCHAR(10)');
  await col('currencies', 'symbol', 'VARCHAR(10)');
  await col('currencies', 'is_base', 'BOOLEAN DEFAULT false');
  await col('currencies', 'is_active', 'BOOLEAN DEFAULT true');
  await col('currencies', 'created_at', 'TIMESTAMPTZ DEFAULT NOW()');
  await col('currencies', 'updated_at', 'TIMESTAMPTZ DEFAULT NOW()');
  await knex.raw(`CREATE TABLE IF NOT EXISTS currency_exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    base_currency VARCHAR(10) NOT NULL,
    source_currency VARCHAR(10) NOT NULL,
    rate DECIMAL(24,12) NOT NULL,
    effective_date DATE NOT NULL,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // ── Tables created only by manual scripts ──
  // bank_deposit_lines (bank deposits detail)
  await knex.raw(`CREATE TABLE IF NOT EXISTS bank_deposit_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deposit_id UUID NOT NULL,
    line_number INTEGER DEFAULT 1,
    account_id UUID,
    memo TEXT,
    amount DECIMAL(20,4) DEFAULT 0,
    department_id UUID,
    location_id UUID,
    entity_customer_id UUID,
    entity_vendor_id UUID,
    entity_employee_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // file_cabinet (attachments for every record type)
  await knex.raw(`CREATE TABLE IF NOT EXISTS file_cabinet (
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
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_fc_source ON file_cabinet(source_type, source_id)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_fc_company ON file_cabinet(company_id)`);

  // purchase_requisitions (+ lines)
  await knex.raw(`CREATE TABLE IF NOT EXISTS purchase_requisitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL, subsidiary_id UUID,
    requisition_number VARCHAR(30) NOT NULL, request_date DATE NOT NULL,
    requested_by VARCHAR(200), department_id UUID, location_id UUID,
    status VARCHAR(30) DEFAULT 'pending', memo TEXT, total_amount DECIMAL(20,4) DEFAULT 0,
    created_by UUID, created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, requisition_number)
  )`);
  await knex.raw(`CREATE TABLE IF NOT EXISTS purchase_requisition_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pr_id UUID NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
    item_id UUID, description TEXT, quantity DECIMAL(20,6), unit_price DECIMAL(20,4),
    amount DECIMAL(20,4), department_id UUID, location_id UUID, created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // notifications
  await knex.raw(`CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID, user_id UUID,
    type VARCHAR(50), title VARCHAR(300), message TEXT,
    link VARCHAR(500), is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // audit_logs
  await knex.raw(`CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID, user_id UUID,
    action VARCHAR(100), entity_type VARCHAR(100), entity_id UUID, entity_number VARCHAR(200),
    old_values JSONB, new_values JSONB, ip_address VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
}

export async function down(_knex: Knex): Promise<void> {
  // Non-destructive reconciliation; intentionally no-op on rollback so we never
  // drop columns/tables that other environments may already depend on.
}
