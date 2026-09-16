const { Pool } = require('pg');
const pool = new Pool({ host: process.env.DB_HOST || 'cloud-erp-db', port: 5432, database: 'cloud_erp', user: 'erp_user', password: 'erp_secure_password' });
async function col(t, c, ty) { try { await pool.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS ${c} ${ty}`); } catch (e) { console.log('warn:', e.message.slice(0,80)); } }

(async () => {
  await col('quotations','price_level','VARCHAR(50)');
  await col('purchase_orders','warehouse_id','UUID');
  await col('vendor_bills','vendor_bill_number','VARCHAR(100)');
  await col('expense_report_lines','expense_date','DATE');
  await col('expense_report_lines','receipt','VARCHAR(100)');
  await col('expense_report_lines','receipt_number','VARCHAR(100)');
  // safety: common columns that other create routes may reference
  await col('sales_orders','warehouse_id','UUID');
  await col('invoices','warehouse_id','UUID');
  await col('item_receipts','warehouse_id','UUID');
  await col('item_fulfillments','warehouse_id','UUID');
  await col('customer_payments','exchange_rate','DECIMAL(20,6) DEFAULT 1');
  await col('vendor_payments','exchange_rate','DECIMAL(20,6) DEFAULT 1');
  await col('expense_reports','title','VARCHAR(300)');
  console.log('✅ fix-columns3 applied');
  await pool.end();
})().catch(e => { console.log('ERR:', e.message); pool.end(); process.exit(1); });
