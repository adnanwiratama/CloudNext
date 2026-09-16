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

// Add department_id + location_id to tables that are missing them
// Also add subsidiary_id where missing
const tableAdditions = [
  // Sales
  { table: 'sales_orders',      cols: ['department_id','location_id','subsidiary_id'] },
  { table: 'sales_order_lines', cols: ['department_id','location_id'] },
  { table: 'quotations',        cols: ['subsidiary_id'] },
  { table: 'quotation_lines',   cols: ['department_id','location_id'] },
  { table: 'invoices',          cols: ['subsidiary_id'] },
  { table: 'invoice_lines',     cols: ['department_id','location_id'] },
  { table: 'customer_payments', cols: ['department_id','location_id','subsidiary_id'] },
  { table: 'item_fulfillments', cols: ['department_id','subsidiary_id'] },
  { table: 'return_authorizations', cols: ['department_id','subsidiary_id'] },
  { table: 'credit_memos',      cols: ['department_id','location_id','subsidiary_id'] },
  { table: 'credit_memo_lines', cols: ['department_id','location_id'] },
  // Purchasing
  { table: 'purchase_orders',   cols: ['department_id','subsidiary_id'] },
  { table: 'purchase_order_lines', cols: ['department_id','location_id'] },
  { table: 'vendor_bills',      cols: ['department_id','location_id','subsidiary_id'] },
  { table: 'vendor_bill_lines', cols: ['department_id','location_id'] },
  { table: 'item_receipts',     cols: ['department_id','subsidiary_id'] },
  { table: 'item_receipt_lines',cols: ['department_id','location_id'] },
  { table: 'vendor_payments',   cols: ['department_id','location_id','subsidiary_id'] },
  { table: 'vendor_prepayments',cols: ['department_id','location_id','subsidiary_id'] },
  { table: 'vendor_returns',    cols: ['department_id','location_id','subsidiary_id'] },
  { table: 'vendor_credits',    cols: ['department_id','location_id','subsidiary_id'] },
  // Bank
  { table: 'bank_deposits',     cols: ['department_id','location_id','subsidiary_id'] },
  { table: 'bank_transfers',    cols: ['department_id','location_id','subsidiary_id'] },
  // Employee
  { table: 'expense_reports',   cols: ['location_id','subsidiary_id'] },
  { table: 'expense_report_lines', cols: ['department_id','location_id'] },
  // Manufacturing
  { table: 'work_orders',       cols: ['department_id','location_id','subsidiary_id'] },
  { table: 'assembly_builds',   cols: ['department_id','location_id','subsidiary_id'] },
  // Inventory
  { table: 'inventory_adjustments', cols: ['department_id','subsidiary_id'] },
  { table: 'inventory_transfers',   cols: ['department_id','subsidiary_id'] },
  // Accounting
  { table: 'journal_entries',   cols: ['department_id','location_id','subsidiary_id'] },
  { table: 'journal_entry_lines', cols: ['department_id','location_id'] },
];

async function run() {
  console.log('Running Department/Location migration for all transaction tables...\n');
  let added = 0;

  for (const { table, cols } of tableAdditions) {
    // Check if table exists
    const exists = await db.schema.hasTable(table);
    if (!exists) { console.log(`  ⚠ Table "${table}" not found — skip`); continue; }

    for (const col of cols) {
      const hasCol = await db.schema.hasColumn(table, col);
      if (!hasCol) {
        await db.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} UUID`);
        console.log(`  ✓ ${table}.${col}`);
        added++;
      }
    }
  }

  // Also add audit log columns to transaction tables for sysinfo tab
  const auditTables = [
    'sales_orders','invoices','purchase_orders','vendor_bills','item_receipts',
    'item_fulfillments','customer_payments','vendor_payments','bank_deposits',
    'bank_transfers','expense_reports','work_orders','journal_entries',
    'quotations','return_authorizations','credit_memos','vendor_prepayments',
  ];

  for (const table of auditTables) {
    const exists = await db.schema.hasTable(table);
    if (!exists) continue;
    const hasUpdatedBy = await db.schema.hasColumn(table, 'updated_by');
    if (!hasUpdatedBy) {
      await db.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS updated_by UUID`);
      console.log(`  ✓ ${table}.updated_by`);
      added++;
    }
  }

  console.log(`\n✅ Done! ${added} columns added.`);
  await db.destroy();
}

run().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
