import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ─── Bank Checks ──────────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('bank_checks'))) {
    await knex.schema.createTable('bank_checks', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable().references('id').inTable('companies');
      t.string('check_number').notNullable();
      t.date('check_date').notNullable();
      t.string('pay_to').notNullable();
      t.uuid('vendor_id').nullable().references('id').inTable('vendors');
      t.uuid('bank_account_id').notNullable();
      t.uuid('expense_account_id').nullable();
      t.decimal('amount', 18, 2).notNullable();
      t.string('memo').nullable();
      t.text('address').nullable();
      t.string('status').defaultTo('issued');
      t.uuid('created_by').nullable();
      t.timestamps(true, true);
    });
  }

  // ─── Bank Deposits ─────────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('bank_deposits'))) {
    await knex.schema.createTable('bank_deposits', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable().references('id').inTable('companies');
      t.string('deposit_number').notNullable();
      t.date('deposit_date').notNullable();
      t.uuid('bank_account_id').notNullable();
      t.string('reference').nullable();
      t.string('memo').nullable();
      t.decimal('total_amount', 18, 2).defaultTo(0);
      t.string('status').defaultTo('posted');
      t.uuid('created_by').nullable();
      t.timestamps(true, true);
    });
  }

  // ─── Bank Transfers ────────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('bank_transfers'))) {
    await knex.schema.createTable('bank_transfers', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable().references('id').inTable('companies');
      t.string('transfer_number').notNullable();
      t.date('transfer_date').notNullable();
      t.uuid('from_account_id').notNullable();
      t.uuid('to_account_id').notNullable();
      t.decimal('amount', 18, 2).notNullable();
      t.string('reference').nullable();
      t.string('memo').nullable();
      t.string('status').defaultTo('posted');
      t.uuid('created_by').nullable();
      t.timestamps(true, true);
    });
  }

  // ─── Customer Deposits ─────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('customer_deposits'))) {
    await knex.schema.createTable('customer_deposits', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable().references('id').inTable('companies');
      t.string('deposit_number').notNullable();
      t.uuid('customer_id').notNullable().references('id').inTable('customers');
      t.date('deposit_date').notNullable();
      t.decimal('amount', 18, 2).notNullable();
      t.uuid('bank_account_id').notNullable();
      t.string('payment_method').defaultTo('bank_transfer');
      t.string('reference').nullable();
      t.uuid('sales_order_id').nullable();
      t.string('memo').nullable();
      t.decimal('amount_applied', 18, 2).defaultTo(0);
      t.string('status').defaultTo('posted');
      t.uuid('created_by').nullable();
      t.timestamps(true, true);
    });
  }

  // ─── Return Authorizations ─────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('return_authorizations'))) {
    await knex.schema.createTable('return_authorizations', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable().references('id').inTable('companies');
      t.string('ra_number').notNullable();
      t.uuid('customer_id').notNullable().references('id').inTable('customers');
      t.date('return_date').notNullable();
      t.string('original_invoice_number').nullable();
      t.string('return_reason').nullable();
      t.uuid('location_id').nullable();
      t.string('memo').nullable();
      t.decimal('total_amount', 18, 2).defaultTo(0);
      t.string('status').defaultTo('open');
      t.uuid('created_by').nullable();
      t.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('return_authorization_lines'))) {
    await knex.schema.createTable('return_authorization_lines', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('ra_id').notNullable().references('id').inTable('return_authorizations');
      t.uuid('item_id').nullable();
      t.string('description').nullable();
      t.decimal('qty', 14, 4).defaultTo(0);
      t.decimal('unit_price', 18, 4).defaultTo(0);
      t.timestamps(true, true);
    });
  }

  // ─── Credit Memo Lines ─────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('credit_memo_lines'))) {
    await knex.schema.createTable('credit_memo_lines', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('credit_memo_id').notNullable();
      t.uuid('item_id').nullable();
      t.string('description').nullable();
      t.decimal('qty', 14, 4).defaultTo(0);
      t.decimal('unit_price', 18, 4).defaultTo(0);
      t.timestamps(true, true);
    });
  }

  // ─── Customer Refunds ──────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('customer_refunds'))) {
    await knex.schema.createTable('customer_refunds', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable().references('id').inTable('companies');
      t.string('refund_number').notNullable();
      t.uuid('customer_id').notNullable().references('id').inTable('customers');
      t.date('refund_date').notNullable();
      t.decimal('amount', 18, 2).notNullable();
      t.uuid('bank_account_id').notNullable();
      t.string('payment_method').defaultTo('bank_transfer');
      t.string('reference').nullable();
      t.string('credit_memo_number').nullable();
      t.string('reason').nullable();
      t.string('memo').nullable();
      t.string('status').defaultTo('posted');
      t.uuid('created_by').nullable();
      t.timestamps(true, true);
    });
  }

  // ─── Vendor Prepayments ────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('vendor_prepayments'))) {
    await knex.schema.createTable('vendor_prepayments', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable().references('id').inTable('companies');
      t.string('prepayment_number').notNullable();
      t.uuid('vendor_id').notNullable().references('id').inTable('vendors');
      t.date('payment_date').notNullable();
      t.decimal('amount', 18, 2).notNullable();
      t.uuid('bank_account_id').notNullable();
      t.string('payment_method').defaultTo('bank_transfer');
      t.string('reference').nullable();
      t.uuid('purchase_order_id').nullable();
      t.string('memo').nullable();
      t.decimal('amount_applied', 18, 2).defaultTo(0);
      t.string('status').defaultTo('unapplied');
      t.uuid('created_by').nullable();
      t.timestamps(true, true);
    });
  }

  // ─── Vendor Returns ────────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('vendor_returns'))) {
    await knex.schema.createTable('vendor_returns', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable().references('id').inTable('companies');
      t.string('return_number').notNullable();
      t.uuid('vendor_id').notNullable().references('id').inTable('vendors');
      t.date('return_date').notNullable();
      t.string('original_po_number').nullable();
      t.string('return_reason').nullable();
      t.uuid('location_id').nullable();
      t.string('memo').nullable();
      t.decimal('total_amount', 18, 2).defaultTo(0);
      t.string('status').defaultTo('posted');
      t.uuid('created_by').nullable();
      t.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('vendor_return_lines'))) {
    await knex.schema.createTable('vendor_return_lines', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('return_id').notNullable().references('id').inTable('vendor_returns');
      t.uuid('item_id').nullable();
      t.string('description').nullable();
      t.decimal('qty', 14, 4).defaultTo(0);
      t.decimal('unit_price', 18, 4).defaultTo(0);
      t.timestamps(true, true);
    });
  }

  // ─── Vendor Credits ────────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('vendor_credits'))) {
    await knex.schema.createTable('vendor_credits', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable().references('id').inTable('companies');
      t.string('credit_number').notNullable();
      t.uuid('vendor_id').notNullable().references('id').inTable('vendors');
      t.date('credit_date').notNullable();
      t.string('vendor_credit_memo_number').nullable();
      t.string('original_bill_number').nullable();
      t.string('reason').nullable();
      t.string('memo').nullable();
      t.decimal('total_amount', 18, 2).defaultTo(0);
      t.decimal('amount_applied', 18, 2).defaultTo(0);
      t.string('status').defaultTo('open');
      t.uuid('created_by').nullable();
      t.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('vendor_credit_lines'))) {
    await knex.schema.createTable('vendor_credit_lines', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('credit_id').notNullable().references('id').inTable('vendor_credits');
      t.uuid('item_id').nullable();
      t.string('description').nullable();
      t.decimal('qty', 14, 4).defaultTo(0);
      t.decimal('unit_price', 18, 4).defaultTo(0);
      t.timestamps(true, true);
    });
  }

  // ─── Inventory Adjustments ─────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('inventory_adjustments'))) {
    await knex.schema.createTable('inventory_adjustments', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable().references('id').inTable('companies');
      t.string('adjustment_number').notNullable();
      t.date('adjustment_date').notNullable();
      t.string('adjustment_type').defaultTo('quantity');
      t.string('reason').nullable();
      t.uuid('account_id').nullable();
      t.string('memo').nullable();
      t.string('status').defaultTo('posted');
      t.uuid('created_by').nullable();
      t.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('inventory_adjustment_lines'))) {
    await knex.schema.createTable('inventory_adjustment_lines', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('adjustment_id').notNullable().references('id').inTable('inventory_adjustments');
      t.uuid('item_id').notNullable();
      t.uuid('location_id').notNullable();
      t.decimal('adjust_qty', 14, 4).notNullable();
      t.decimal('unit_cost', 18, 4).defaultTo(0);
      t.string('reason').nullable();
      t.timestamps(true, true);
    });
  }

  // ─── Inventory Transfers ───────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('inventory_transfers'))) {
    await knex.schema.createTable('inventory_transfers', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable().references('id').inTable('companies');
      t.string('transfer_number').notNullable();
      t.date('transfer_date').notNullable();
      t.uuid('from_location_id').notNullable();
      t.uuid('to_location_id').notNullable();
      t.string('reference').nullable();
      t.string('memo').nullable();
      t.string('status').defaultTo('posted');
      t.uuid('created_by').nullable();
      t.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('inventory_transfer_lines'))) {
    await knex.schema.createTable('inventory_transfer_lines', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('transfer_id').notNullable().references('id').inTable('inventory_transfers');
      t.uuid('item_id').notNullable();
      t.decimal('qty', 14, 4).notNullable();
      t.decimal('unit_cost', 18, 4).defaultTo(0);
      t.timestamps(true, true);
    });
  }

  // ─── Inventory Transfer Orders ─────────────────────────────────────────────
  if (!(await knex.schema.hasTable('inventory_transfer_orders'))) {
    await knex.schema.createTable('inventory_transfer_orders', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable().references('id').inTable('companies');
      t.string('transfer_order_number').notNullable();
      t.date('order_date').notNullable();
      t.date('expected_date').nullable();
      t.uuid('from_location_id').notNullable();
      t.uuid('to_location_id').notNullable();
      t.string('priority').defaultTo('normal');
      t.string('memo').nullable();
      t.string('status').defaultTo('pending');
      t.uuid('created_by').nullable();
      t.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('inventory_transfer_order_lines'))) {
    await knex.schema.createTable('inventory_transfer_order_lines', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('transfer_order_id').notNullable().references('id').inTable('inventory_transfer_orders');
      t.uuid('item_id').notNullable();
      t.decimal('qty_requested', 14, 4).notNullable();
      t.decimal('qty_transferred', 14, 4).defaultTo(0);
      t.date('requested_date').nullable();
      t.timestamps(true, true);
    });
  }

  // ─── Assembly Builds ───────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('assembly_builds'))) {
    await knex.schema.createTable('assembly_builds', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable().references('id').inTable('companies');
      t.string('build_number').notNullable();
      t.date('build_date').notNullable();
      t.uuid('assembly_item_id').notNullable();
      t.uuid('bom_id').nullable();
      t.decimal('build_qty', 14, 4).notNullable();
      t.uuid('location_id').notNullable();
      t.uuid('work_order_id').nullable();
      t.string('memo').nullable();
      t.string('status').defaultTo('posted');
      t.uuid('created_by').nullable();
      t.timestamps(true, true);
    });
  }

  // ─── Expense Reports ───────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('expense_reports'))) {
    await knex.schema.createTable('expense_reports', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable().references('id').inTable('companies');
      t.string('report_number').notNullable();
      t.string('employee_name').notNullable();
      t.string('department').nullable();
      t.date('report_period_start').nullable();
      t.date('report_period_end').nullable();
      t.string('purpose').nullable();
      t.string('memo').nullable();
      t.decimal('total_amount', 18, 2).defaultTo(0);
      t.string('status').defaultTo('submitted');
      t.uuid('created_by').nullable();
      t.uuid('approved_by').nullable();
      t.timestamp('approved_at').nullable();
      t.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('expense_report_lines'))) {
    await knex.schema.createTable('expense_report_lines', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('report_id').notNullable().references('id').inTable('expense_reports');
      t.date('expense_date').nullable();
      t.string('category').nullable();
      t.string('description').nullable();
      t.uuid('account_id').nullable();
      t.string('receipt_number').nullable();
      t.decimal('amount', 18, 2).defaultTo(0);
      t.timestamps(true, true);
    });
  }

  // ─── Accounting Periods (if not exists) ───────────────────────────────────
  if (!(await knex.schema.hasTable('accounting_periods'))) {
    await knex.schema.createTable('accounting_periods', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable();
      t.string('name').notNullable();
      t.integer('fiscal_year').nullable();
      t.date('start_date').notNullable();
      t.date('end_date').notNullable();
      t.string('status').defaultTo('open');
      t.timestamps(true, true);
    });
  }

  // ─── Tax Codes add new columns if missing ────────────────────────────────
  const hasTaxType = await knex.schema.hasColumn('tax_codes', 'tax_type');
  if (!hasTaxType) {
    await knex.schema.alterTable('tax_codes', t => {
      t.string('tax_type').defaultTo('vat');
    });
  }

  // ─── Vendor Bill Lines (if not exists) ───────────────────────────────────
  const hasVBLines = await knex.schema.hasTable('vendor_bill_lines');
  if (!hasVBLines) {
    await knex.schema.createTable('vendor_bill_lines', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('bill_id').notNullable().references('id').inTable('vendor_bills');
      t.uuid('item_id').nullable();
      t.string('description').nullable();
      t.uuid('account_id').nullable();
      t.decimal('qty', 14, 4).defaultTo(0);
      t.decimal('unit_price', 18, 4).defaultTo(0);
      t.decimal('amount', 18, 2).defaultTo(0);
      t.timestamps(true, true);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    'expense_report_lines', 'expense_reports',
    'assembly_builds',
    'inventory_transfer_order_lines', 'inventory_transfer_orders',
    'inventory_transfer_lines', 'inventory_transfers',
    'inventory_adjustment_lines', 'inventory_adjustments',
    'vendor_credit_lines', 'vendor_credits',
    'vendor_return_lines', 'vendor_returns',
    'vendor_prepayments',
    'customer_refunds',
    'credit_memo_lines',
    'return_authorization_lines', 'return_authorizations',
    'customer_deposits',
    'bank_transfers', 'bank_deposits', 'bank_checks',
  ];
  for (const t of tables) {
    await knex.schema.dropTableIfExists(t);
  }
}
