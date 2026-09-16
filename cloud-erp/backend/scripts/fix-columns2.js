const { Pool } = require('pg');
const pool = new Pool({ host: process.env.DB_HOST || 'cloud-erp-db', port: 5432, database: 'cloud_erp', user: 'erp_user', password: 'erp_secure_password' });
async function run(sql) { try { await pool.query(sql); } catch (e) { if (!e.message.includes('already exists')) console.log('warn:', e.message.slice(0,80)); } }
async function col(t, c, ty) { await run(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS ${c} ${ty}`); }

(async () => {
  // invoices
  await col('invoices','discount_amount','DECIMAL(20,4) DEFAULT 0');
  await col('invoices','shipping_amount','DECIMAL(20,4) DEFAULT 0');
  await col('invoices','exchange_rate','DECIMAL(20,6) DEFAULT 1');

  // quotations
  await col('quotations','discount_amount','DECIMAL(20,4) DEFAULT 0');
  await col('quotations','shipping_amount','DECIMAL(20,4) DEFAULT 0');
  await col('quotations','valid_until','DATE');
  await col('quotations','tax_rate','DECIMAL(8,4) DEFAULT 0');
  await col('quotations','payment_terms','VARCHAR(50)');

  // purchase_orders
  await col('purchase_orders','pr_id','UUID');
  await col('purchase_orders','discount_amount','DECIMAL(20,4) DEFAULT 0');
  await col('purchase_orders','shipping_amount','DECIMAL(20,4) DEFAULT 0');

  // vendor_bills
  await col('vendor_bills','tax_rate','DECIMAL(8,4) DEFAULT 0');
  await col('vendor_bills','discount_amount','DECIMAL(20,4) DEFAULT 0');

  // expense_reports
  await col('expense_reports','department','VARCHAR(200)');
  await col('expense_reports','purpose','TEXT');

  // sales_order_lines
  await col('sales_order_lines','expected_ship_date','DATE');
  await col('sales_order_lines','qty_fulfilled','DECIMAL(20,6) DEFAULT 0');
  await col('sales_order_lines','qty_billed','DECIMAL(20,6) DEFAULT 0');

  // purchase_requisitions table
  await run(`CREATE TABLE IF NOT EXISTS purchase_requisitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL, subsidiary_id UUID,
    requisition_number VARCHAR(30) NOT NULL, request_date DATE NOT NULL,
    requested_by VARCHAR(200), department_id UUID, location_id UUID,
    status VARCHAR(30) DEFAULT 'pending', memo TEXT, total_amount DECIMAL(20,4) DEFAULT 0,
    created_by UUID, created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, requisition_number)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS purchase_requisition_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pr_id UUID NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
    item_id UUID, description TEXT, quantity DECIMAL(20,6), unit_price DECIMAL(20,4),
    amount DECIMAL(20,4), department_id UUID, location_id UUID, created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  console.log('✅ fix-columns2 applied');
  await pool.end();
})().catch(e => { console.log('ERR:', e.message); pool.end(); process.exit(1); });
