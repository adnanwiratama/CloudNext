import { Knex } from 'knex';

// ─────────────────────────────────────────────────────────────────────────────
// Approval fields on transaction tables.
//
// Adds approval_status + approved_by + approved_at to every transaction table that
// doesn't already have them, so the approval-gated posting flow can track them
// uniformly. approval_status default 'approved' preserves existing behavior for
// rows created before the feature (they are treated as already approved); new
// records created while a configured approver exists are set to 'pending_approval'
// by the route handlers.
// ─────────────────────────────────────────────────────────────────────────────

// Tables that participate in the approval flow (transaction headers).
const TABLES = [
  'invoices', 'vendor_bills', 'bank_checks', 'bank_deposits', 'bank_transfers',
  'customer_deposits', 'vendor_prepayments', 'inventory_adjustments', 'inventory_transfers',
  'inventory_transfer_orders', 'return_authorizations', 'credit_memos', 'work_orders',
  'item_receipts', 'item_fulfillments', 'sales_orders', 'purchase_orders',
  'purchase_requisitions', 'quotations', 'expense_reports',
];

export async function up(knex: Knex): Promise<void> {
  for (const table of TABLES) {
    if (!(await knex.schema.hasTable(table))) continue;
    if (!(await knex.schema.hasColumn(table, 'approval_status'))) {
      await knex.schema.alterTable(table, (t) => t.string('approval_status', 30).defaultTo('approved'));
    }
    if (!(await knex.schema.hasColumn(table, 'approved_by'))) {
      await knex.schema.alterTable(table, (t) => t.uuid('approved_by').nullable());
    }
    if (!(await knex.schema.hasColumn(table, 'approved_at'))) {
      await knex.schema.alterTable(table, (t) => t.timestamp('approved_at').nullable());
    }
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Non-destructive: leave the approval columns in place on rollback.
}
