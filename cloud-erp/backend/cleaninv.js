const { Pool } = require('pg');
const p = new Pool({ host:'cloud-erp-db', port:5432, database:'cloud_erp', user:'erp_user', password:'erp_secure_password' });
(async () => {
  // remove test SOs (total 30000) + their fulfillments + inventory txns
  const so = await p.query("SELECT id FROM sales_orders WHERE total_amount=30000");
  for (const r of so.rows) {
    const ff = await p.query('SELECT id FROM item_fulfillments WHERE so_id=$1', [r.id]);
    for (const x of ff.rows) {
      await p.query("DELETE FROM journal_entry_lines WHERE journal_id IN (SELECT id FROM journal_entries WHERE source_id=$1)", [x.id]);
      await p.query("DELETE FROM journal_entries WHERE source_id=$1", [x.id]);
      await p.query("DELETE FROM inventory_transaction_lines WHERE transaction_id IN (SELECT id FROM inventory_transactions WHERE reference_id=$1)", [x.id]);
      await p.query("DELETE FROM inventory_transactions WHERE reference_id=$1", [x.id]);
      await p.query('DELETE FROM item_fulfillment_lines WHERE fulfillment_id=$1', [x.id]);
      await p.query('DELETE FROM item_fulfillments WHERE id=$1', [x.id]);
    }
    await p.query('DELETE FROM sales_order_lines WHERE so_id=$1', [r.id]);
    await p.query('DELETE FROM sales_orders WHERE id=$1', [r.id]);
  }
  // reset the test item's balances to remove test noise
  await p.query("DELETE FROM inventory_balances WHERE item_id='bde7a581-c79f-4256-a44f-7cfc9138bfb9'");
  console.log('cleaned test SOs:', so.rows.length);
  await p.end();
})().catch(e => { console.log('note', e.message); p.end(); });
