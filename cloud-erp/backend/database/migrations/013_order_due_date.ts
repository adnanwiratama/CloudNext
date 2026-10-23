import { Knex } from 'knex';

// Due Date on Purchase Orders and Sales Orders (Order Date + Payment Terms).
// Copied to Vendor Bill / Customer Invoice when created from the order.
export async function up(knex: Knex): Promise<void> {
  const soHas = await knex.schema.hasColumn('sales_orders', 'due_date');
  if (!soHas) await knex.schema.alterTable('sales_orders', t => { t.date('due_date').nullable(); });
  const poHas = await knex.schema.hasColumn('purchase_orders', 'due_date');
  if (!poHas) await knex.schema.alterTable('purchase_orders', t => { t.date('due_date').nullable(); });
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('sales_orders', 'due_date')) await knex.schema.alterTable('sales_orders', t => { t.dropColumn('due_date'); });
  if (await knex.schema.hasColumn('purchase_orders', 'due_date')) await knex.schema.alterTable('purchase_orders', t => { t.dropColumn('due_date'); });
}
