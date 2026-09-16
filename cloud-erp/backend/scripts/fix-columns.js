const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || 'cloud-erp-db', port: 5432,
  database: 'cloud_erp', user: 'erp_user', password: 'erp_secure_password'
});

async function run(sql) {
  try { await pool.query(sql); } catch (e) { if (!e.message.includes('already exists')) console.log('warn:', e.message); }
}
async function addCol(table, col, type) {
  await run(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${type}`);
}

(async () => {
  // ── Sales rep on sales docs ──
  for (const t of ['sales_orders','quotations','invoices']) await addCol(t, 'sales_rep_id', 'UUID');

  // ── Shipping fields on sales_orders ──
  await addCol('sales_orders', 'shipping_address', 'TEXT');
  await addCol('sales_orders', 'shipping_method', 'VARCHAR(100)');
  await addCol('quotations', 'shipping_address', 'TEXT');
  await addCol('invoices', 'shipping_address', 'TEXT');
  await addCol('invoices', 'so_id', 'UUID');

  // ── is_deleted on all transaction tables ──
  const isDeletedTables = [
    'journal_entries','vendor_bills','work_orders','item_receipts','item_fulfillments',
    'customer_payments','vendor_payments','bank_deposits','bank_transfers','expense_reports',
    'return_authorizations','credit_memos','vendor_prepayments','vendor_returns','vendor_credits',
    'assembly_builds','inventory_adjustments','inventory_transfers','boms','bank_checks',
  ];
  for (const t of isDeletedTables) await addCol(t, 'is_deleted', 'BOOLEAN DEFAULT false');

  // ── Department/Location/Subsidiary on ALL header transaction tables ──
  const deptLocTables = [
    'bank_checks','bank_deposits','bank_transfers','sales_orders','quotations','invoices',
    'customer_payments','item_fulfillments','return_authorizations','credit_memos',
    'purchase_orders','vendor_bills','item_receipts','vendor_payments','vendor_prepayments',
    'vendor_returns','vendor_credits','expense_reports','work_orders','assembly_builds',
    'inventory_adjustments','inventory_transfers','journal_entries',
  ];
  for (const t of deptLocTables) {
    await addCol(t, 'department_id', 'UUID');
    await addCol(t, 'location_id', 'UUID');
    await addCol(t, 'subsidiary_id', 'UUID');
    await addCol(t, 'updated_by', 'UUID');
  }

  // ── Line-level dept/location ──
  const lineTables = [
    'sales_order_lines','quotation_lines','invoice_lines','purchase_order_lines',
    'vendor_bill_lines','item_receipt_lines','credit_memo_lines','expense_report_lines',
    'journal_entry_lines','bank_check_lines','bank_check_item_lines',
  ];
  for (const t of lineTables) {
    await addCol(t, 'department_id', 'UUID');
    await addCol(t, 'location_id', 'UUID');
  }

  // ── Bank checks: extra columns ──
  await addCol('bank_checks', 'document_number', 'VARCHAR(50)');
  await addCol('bank_checks', 'check_number_manual', 'VARCHAR(50)');
  await addCol('bank_checks', 'posting_period_id', 'UUID');

  // ── Bank check lines: extra columns ──
  await addCol('bank_check_lines', 'line_number', 'INTEGER DEFAULT 1');
  await addCol('bank_check_lines', 'department', 'VARCHAR(200)');
  await addCol('bank_check_lines', 'customer', 'VARCHAR(200)');
  await addCol('bank_check_lines', 'billable', 'BOOLEAN DEFAULT false');

  // ── Items: reorder / tracking / vendor / pricing ──
  await addCol('items', 'reorder_point', 'DECIMAL(20,4) DEFAULT 0');
  await addCol('items', 'safety_stock', 'DECIMAL(20,4) DEFAULT 0');
  await addCol('items', 'lead_time_days', 'INTEGER DEFAULT 0');
  await addCol('items', 'is_lot_tracked', 'BOOLEAN DEFAULT false');
  await addCol('items', 'is_serial_tracked', 'BOOLEAN DEFAULT false');
  await addCol('items', 'preferred_vendor_id', 'UUID');
  await addCol('items', 'last_purchase_price', 'DECIMAL(20,4) DEFAULT 0');
  await addCol('items', 'purchase_price', 'DECIMAL(20,4) DEFAULT 0');
  await addCol('items', 'sale_price', 'DECIMAL(20,4) DEFAULT 0');
  await addCol('items', 'is_deleted', 'BOOLEAN DEFAULT false');

  // ── Customers: sales rep, subsidiary ──
  await addCol('customers', 'sales_rep_id', 'UUID');
  await addCol('customers', 'subsidiary_id', 'UUID');

  // ── Vendors already has subsidiary_id ──
  await addCol('vendors', 'subsidiary_id', 'UUID');

  // ── inventory_balances total qty ──
  await addCol('inventory_balances', 'qty_available', 'DECIMAL(20,6) DEFAULT 0');

  // ── Notifications table ──
  await run(`CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID, user_id UUID,
    type VARCHAR(50), title VARCHAR(300), message TEXT,
    link VARCHAR(500), is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // ── audit_logs table ──
  await run(`CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID, user_id UUID,
    action VARCHAR(100), entity_type VARCHAR(100), entity_id UUID, entity_number VARCHAR(200),
    old_values JSONB, new_values JSONB, ip_address VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  console.log('✅ All schema fixes applied');
  await pool.end();
})().catch(e => { console.log('ERR:', e.message); pool.end(); process.exit(1); });
