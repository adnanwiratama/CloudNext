import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ============================================================
  // EXTENSIONS
  // ============================================================
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pg_trgm"');

  // ============================================================
  // COMPANIES / TENANTS
  // ============================================================
  await knex.schema.createTable('companies', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('code', 20).notNullable().unique();
    t.string('name', 200).notNullable();
    t.string('legal_name', 200);
    t.string('tax_id', 50);
    t.string('email', 200);
    t.string('phone', 50);
    t.string('website', 200);
    t.text('address');
    t.string('city', 100);
    t.string('state', 100);
    t.string('country', 100).defaultTo('Indonesia');
    t.string('postal_code', 20);
    t.string('base_currency', 10).defaultTo('IDR');
    t.string('logo_url', 500);
    t.string('timezone', 100).defaultTo('Asia/Jakarta');
    t.string('fiscal_year_start', 5).defaultTo('01-01');
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('subsidiaries', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('code', 20).notNullable();
    t.string('name', 200).notNullable();
    t.string('currency', 10).defaultTo('IDR');
    t.string('country', 100).defaultTo('Indonesia');
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
    t.unique(['company_id', 'code']);
  });

  // ============================================================
  // USERS & ROLES
  // ============================================================
  await knex.schema.createTable('roles', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('name', 100).notNullable();
    t.string('description', 500);
    t.boolean('is_system').defaultTo(false);
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
    t.unique(['company_id', 'name']);
  });

  await knex.schema.createTable('permissions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('module', 50).notNullable();
    t.string('resource', 100).notNullable();
    t.string('action', 50).notNullable();
    t.string('description', 500);
    t.unique(['module', 'resource', 'action']);
  });

  await knex.schema.createTable('role_permissions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('role_id').notNullable().references('id').inTable('roles').onDelete('CASCADE');
    t.uuid('permission_id').notNullable().references('id').inTable('permissions').onDelete('CASCADE');
    t.unique(['role_id', 'permission_id']);
  });

  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('employee_id', 50);
    t.string('name', 200).notNullable();
    t.string('email', 200).notNullable();
    t.string('password_hash', 500).notNullable();
    t.string('phone', 50);
    t.string('avatar_url', 500);
    t.uuid('role_id').references('id').inTable('roles');
    t.uuid('subsidiary_id').references('id').inTable('subsidiaries');
    t.string('timezone', 100).defaultTo('Asia/Jakarta');
    t.string('language', 10).defaultTo('id');
    t.boolean('is_active').defaultTo(true);
    t.boolean('is_admin').defaultTo(false);
    t.timestamp('last_login_at');
    t.string('password_reset_token', 200);
    t.timestamp('password_reset_expires');
    t.timestamps(true, true);
    t.unique(['company_id', 'email']);
  });

  await knex.schema.createTable('user_subsidiaries', (t) => {
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('subsidiary_id').notNullable().references('id').inTable('subsidiaries').onDelete('CASCADE');
    t.primary(['user_id', 'subsidiary_id']);
  });

  // ============================================================
  // ORGANIZATIONAL STRUCTURE
  // ============================================================
  await knex.schema.createTable('locations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.uuid('subsidiary_id').references('id').inTable('subsidiaries');
    t.string('code', 20).notNullable();
    t.string('name', 200).notNullable();
    t.string('type', 50).defaultTo('warehouse'); // warehouse, office, plant
    t.text('address');
    t.string('city', 100);
    t.string('country', 100);
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
    t.unique(['company_id', 'code']);
  });

  await knex.schema.createTable('departments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('code', 20).notNullable();
    t.string('name', 200).notNullable();
    t.uuid('parent_id').references('id').inTable('departments');
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
    t.unique(['company_id', 'code']);
  });

  await knex.schema.createTable('classes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('code', 20).notNullable();
    t.string('name', 200).notNullable();
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
  });

  // ============================================================
  // CURRENCIES & EXCHANGE RATES
  // ============================================================
  await knex.schema.createTable('currencies', (t) => {
    t.string('code', 10).primary();
    t.string('name', 100).notNullable();
    t.string('symbol', 10);
    t.integer('decimal_places').defaultTo(2);
    t.boolean('is_active').defaultTo(true);
  });

  await knex.schema.createTable('exchange_rates', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('from_currency', 10).notNullable().references('code').inTable('currencies');
    t.string('to_currency', 10).notNullable().references('code').inTable('currencies');
    t.decimal('rate', 20, 6).notNullable();
    t.date('effective_date').notNullable();
    t.uuid('created_by').references('id').inTable('users');
    t.timestamps(true, true);
  });

  // ============================================================
  // UNIT OF MEASURE
  // ============================================================
  await knex.schema.createTable('units_of_measure', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('code', 20).notNullable();
    t.string('name', 100).notNullable();
    t.string('type', 50); // weight, volume, length, quantity, time
    t.boolean('is_base').defaultTo(false);
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
    t.unique(['company_id', 'code']);
  });

  await knex.schema.createTable('uom_conversions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.uuid('from_uom_id').notNullable().references('id').inTable('units_of_measure');
    t.uuid('to_uom_id').notNullable().references('id').inTable('units_of_measure');
    t.decimal('conversion_factor', 20, 6).notNullable();
    t.timestamps(true, true);
  });

  // ============================================================
  // TAX
  // ============================================================
  await knex.schema.createTable('tax_codes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('code', 20).notNullable();
    t.string('name', 200).notNullable();
    t.decimal('rate', 10, 4).notNullable().defaultTo(0);
    t.string('type', 50).defaultTo('exclusive'); // inclusive, exclusive
    t.string('tax_account', 50);
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
    t.unique(['company_id', 'code']);
  });

  // ============================================================
  // CHART OF ACCOUNTS
  // ============================================================
  await knex.schema.createTable('accounts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.uuid('subsidiary_id').references('id').inTable('subsidiaries');
    t.string('code', 30).notNullable();
    t.string('name', 200).notNullable();
    t.string('type', 50).notNullable(); // asset, liability, equity, revenue, cogs, expense, other_income, other_expense
    t.string('subtype', 100); // current_asset, fixed_asset, current_liability, etc.
    t.uuid('parent_id').references('id').inTable('accounts');
    t.string('currency', 10).defaultTo('IDR');
    t.boolean('is_summary').defaultTo(false);
    t.boolean('is_bank').defaultTo(false);
    t.boolean('eliminate_intercompany').defaultTo(false);
    t.text('description');
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
    t.unique(['company_id', 'code']);
  });

  // ============================================================
  // ACCOUNTING PERIODS
  // ============================================================
  await knex.schema.createTable('fiscal_years', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('name', 100).notNullable();
    t.date('start_date').notNullable();
    t.date('end_date').notNullable();
    t.string('status', 20).defaultTo('open'); // open, closed
    t.timestamps(true, true);
  });

  await knex.schema.createTable('accounting_periods', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.uuid('fiscal_year_id').notNullable().references('id').inTable('fiscal_years');
    t.string('name', 100).notNullable();
    t.integer('period_number').notNullable();
    t.date('start_date').notNullable();
    t.date('end_date').notNullable();
    t.string('status', 20).defaultTo('open'); // open, closed, locked
    t.uuid('closed_by').references('id').inTable('users');
    t.timestamp('closed_at');
    t.timestamps(true, true);
  });

  // ============================================================
  // CUSTOMERS
  // ============================================================
  await knex.schema.createTable('customers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.uuid('subsidiary_id').references('id').inTable('subsidiaries');
    t.string('customer_number', 30).notNullable();
    t.string('name', 200).notNullable();
    t.string('company_name', 200);
    t.string('type', 50).defaultTo('company'); // company, individual
    t.string('email', 200);
    t.string('phone', 50);
    t.string('mobile', 50);
    t.string('website', 200);
    t.string('tax_id', 50);
    t.text('billing_address');
    t.string('billing_city', 100);
    t.string('billing_state', 100);
    t.string('billing_country', 100);
    t.string('billing_postal', 20);
    t.text('shipping_address');
    t.string('shipping_city', 100);
    t.string('shipping_state', 100);
    t.string('shipping_country', 100);
    t.string('shipping_postal', 20);
    t.string('currency', 10).defaultTo('IDR');
    t.string('payment_terms', 50);
    t.decimal('credit_limit', 20, 4).defaultTo(0);
    t.uuid('sales_rep_id').references('id').inTable('users');
    t.string('price_level', 50);
    t.string('territory', 100);
    t.uuid('ar_account_id').references('id').inTable('accounts');
    t.uuid('department_id').references('id').inTable('departments');
    t.string('status', 20).defaultTo('active'); // active, inactive, suspended
    t.text('notes');
    t.boolean('is_deleted').defaultTo(false);
    t.uuid('created_by').references('id').inTable('users');
    t.uuid('updated_by').references('id').inTable('users');
    t.timestamps(true, true);
    t.unique(['company_id', 'customer_number']);
  });

  await knex.schema.createTable('customer_contacts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('customer_id').notNullable().references('id').inTable('customers').onDelete('CASCADE');
    t.string('name', 200).notNullable();
    t.string('title', 100);
    t.string('email', 200);
    t.string('phone', 50);
    t.boolean('is_primary').defaultTo(false);
    t.timestamps(true, true);
  });

  // ============================================================
  // VENDORS
  // ============================================================
  await knex.schema.createTable('vendors', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.uuid('subsidiary_id').references('id').inTable('subsidiaries');
    t.string('vendor_number', 30).notNullable();
    t.string('name', 200).notNullable();
    t.string('type', 50).defaultTo('company');
    t.string('email', 200);
    t.string('phone', 50);
    t.string('tax_id', 50);
    t.text('address');
    t.string('city', 100);
    t.string('state', 100);
    t.string('country', 100);
    t.string('postal_code', 20);
    t.string('currency', 10).defaultTo('IDR');
    t.string('payment_terms', 50);
    t.decimal('credit_limit', 20, 4).defaultTo(0);
    t.uuid('ap_account_id').references('id').inTable('accounts');
    t.uuid('expense_account_id').references('id').inTable('accounts');
    t.uuid('department_id').references('id').inTable('departments');
    t.string('status', 20).defaultTo('active');
    t.text('notes');
    t.boolean('is_deleted').defaultTo(false);
    t.uuid('created_by').references('id').inTable('users');
    t.uuid('updated_by').references('id').inTable('users');
    t.timestamps(true, true);
    t.unique(['company_id', 'vendor_number']);
  });

  await knex.schema.createTable('vendor_contacts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('vendor_id').notNullable().references('id').inTable('vendors').onDelete('CASCADE');
    t.string('name', 200).notNullable();
    t.string('title', 100);
    t.string('email', 200);
    t.string('phone', 50);
    t.boolean('is_primary').defaultTo(false);
    t.timestamps(true, true);
  });

  // ============================================================
  // ITEM MASTER
  // ============================================================
  await knex.schema.createTable('item_categories', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('code', 30).notNullable();
    t.string('name', 200).notNullable();
    t.uuid('parent_id').references('id').inTable('item_categories');
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('item_code', 50).notNullable();
    t.string('sku', 100);
    t.string('name', 200).notNullable();
    t.text('description');
    t.string('type', 50).notNullable(); // inventory, non_inventory, service, assembly, raw_material, finished_goods, semi_finished, consumable, packaging, other_charge
    t.uuid('category_id').references('id').inTable('item_categories');
    t.string('brand', 100);
    t.string('manufacturer', 100);
    t.uuid('base_uom_id').references('id').inTable('units_of_measure');
    t.uuid('purchase_uom_id').references('id').inTable('units_of_measure');
    t.uuid('sales_uom_id').references('id').inTable('units_of_measure');
    t.uuid('stock_uom_id').references('id').inTable('units_of_measure');
    t.decimal('standard_cost', 20, 4).defaultTo(0);
    t.decimal('average_cost', 20, 4).defaultTo(0);
    t.decimal('last_purchase_price', 20, 4).defaultTo(0);
    t.decimal('sales_price', 20, 4).defaultTo(0);
    t.uuid('tax_code_id').references('id').inTable('tax_codes');
    t.uuid('income_account_id').references('id').inTable('accounts');
    t.uuid('cogs_account_id').references('id').inTable('accounts');
    t.uuid('inventory_account_id').references('id').inTable('accounts');
    t.uuid('asset_account_id').references('id').inTable('accounts');
    t.uuid('expense_account_id').references('id').inTable('accounts');
    t.uuid('preferred_vendor_id').references('id').inTable('vendors');
    t.decimal('reorder_point', 20, 4).defaultTo(0);
    t.decimal('safety_stock', 20, 4).defaultTo(0);
    t.integer('lead_time_days').defaultTo(0);
    t.boolean('is_lot_tracked').defaultTo(false);
    t.boolean('is_serial_tracked').defaultTo(false);
    t.boolean('is_bin_tracked').defaultTo(false);
    t.boolean('is_expiry_tracked').defaultTo(false);
    t.string('valuation_method', 20).defaultTo('average'); // average, fifo, standard
    t.boolean('is_purchasable').defaultTo(true);
    t.boolean('is_sellable').defaultTo(true);
    t.boolean('is_stockable').defaultTo(true);
    t.boolean('is_active').defaultTo(true);
    t.boolean('is_deleted').defaultTo(false);
    t.uuid('created_by').references('id').inTable('users');
    t.uuid('updated_by').references('id').inTable('users');
    t.timestamps(true, true);
    t.unique(['company_id', 'item_code']);
  });

  await knex.schema.createTable('item_prices', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('item_id').notNullable().references('id').inTable('items').onDelete('CASCADE');
    t.string('price_level', 50).notNullable();
    t.string('currency', 10).defaultTo('IDR');
    t.decimal('price', 20, 4).notNullable();
    t.date('effective_date');
    t.date('expiry_date');
    t.timestamps(true, true);
  });

  // ============================================================
  // WAREHOUSES & BINS
  // ============================================================
  await knex.schema.createTable('warehouses', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.uuid('location_id').references('id').inTable('locations');
    t.string('code', 20).notNullable();
    t.string('name', 200).notNullable();
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
    t.unique(['company_id', 'code']);
  });

  await knex.schema.createTable('bins', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('warehouse_id').notNullable().references('id').inTable('warehouses').onDelete('CASCADE');
    t.string('code', 30).notNullable();
    t.string('zone', 50);
    t.string('aisle', 20);
    t.string('rack', 20);
    t.string('level', 20);
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
    t.unique(['warehouse_id', 'code']);
  });

  // ============================================================
  // INVENTORY BALANCE
  // ============================================================
  await knex.schema.createTable('inventory_balances', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.uuid('item_id').notNullable().references('id').inTable('items');
    t.uuid('location_id').references('id').inTable('locations');
    t.uuid('warehouse_id').references('id').inTable('warehouses');
    t.uuid('bin_id').references('id').inTable('bins');
    t.string('lot_number', 100);
    t.string('serial_number', 100);
    t.date('expiry_date');
    t.decimal('qty_on_hand', 20, 6).defaultTo(0);
    t.decimal('qty_committed', 20, 6).defaultTo(0);
    t.decimal('qty_on_order', 20, 6).defaultTo(0);
    t.decimal('qty_in_transit', 20, 6).defaultTo(0);
    t.decimal('qty_wip', 20, 6).defaultTo(0);
    t.decimal('avg_cost', 20, 6).defaultTo(0);
    t.timestamp('last_updated').defaultTo(knex.fn.now());
    t.unique(['company_id', 'item_id', 'location_id', 'warehouse_id', 'bin_id', 'lot_number', 'serial_number']);
  });

  // ============================================================
  // TRANSACTION NUMBERING
  // ============================================================
  await knex.schema.createTable('transaction_sequences', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('transaction_type', 50).notNullable();
    t.string('prefix', 20);
    t.integer('last_number').defaultTo(0);
    t.integer('increment').defaultTo(1);
    t.integer('min_digits').defaultTo(6);
    t.boolean('include_year').defaultTo(true);
    t.unique(['company_id', 'transaction_type']);
  });

  // ============================================================
  // APPROVAL WORKFLOWS
  // ============================================================
  await knex.schema.createTable('approval_workflows', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('name', 200).notNullable();
    t.string('transaction_type', 50).notNullable();
    t.decimal('min_amount', 20, 4);
    t.decimal('max_amount', 20, 4);
    t.uuid('department_id').references('id').inTable('departments');
    t.uuid('location_id').references('id').inTable('locations');
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('approval_steps', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('workflow_id').notNullable().references('id').inTable('approval_workflows').onDelete('CASCADE');
    t.integer('step_order').notNullable();
    t.string('approver_type', 30).notNullable(); // user, role
    t.uuid('approver_user_id').references('id').inTable('users');
    t.uuid('approver_role_id').references('id').inTable('roles');
    t.boolean('is_mandatory').defaultTo(true);
    t.timestamps(true, true);
  });

  // ============================================================
  // SALES MODULE
  // ============================================================
  await knex.schema.createTable('quotations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.uuid('subsidiary_id').references('id').inTable('subsidiaries');
    t.string('quotation_number', 30).notNullable();
    t.uuid('customer_id').notNullable().references('id').inTable('customers');
    t.date('quotation_date').notNullable();
    t.date('expiry_date');
    t.string('currency', 10).defaultTo('IDR');
    t.decimal('exchange_rate', 20, 6).defaultTo(1);
    t.string('price_level', 50);
    t.uuid('sales_rep_id').references('id').inTable('users');
    t.uuid('location_id').references('id').inTable('locations');
    t.uuid('department_id').references('id').inTable('departments');
    t.string('status', 30).defaultTo('draft'); // draft, submitted, approved, rejected, converted, closed
    t.text('memo');
    t.decimal('subtotal', 20, 4).defaultTo(0);
    t.decimal('discount_amount', 20, 4).defaultTo(0);
    t.decimal('tax_amount', 20, 4).defaultTo(0);
    t.decimal('shipping_amount', 20, 4).defaultTo(0);
    t.decimal('total_amount', 20, 4).defaultTo(0);
    t.uuid('converted_to_so_id').references('id').inTable('quotations'); // will update after SO table
    t.uuid('created_by').references('id').inTable('users');
    t.uuid('updated_by').references('id').inTable('users');
    t.uuid('approved_by').references('id').inTable('users');
    t.timestamp('approved_at');
    t.boolean('is_deleted').defaultTo(false);
    t.timestamps(true, true);
    t.unique(['company_id', 'quotation_number']);
  });

  await knex.schema.createTable('quotation_lines', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('quotation_id').notNullable().references('id').inTable('quotations').onDelete('CASCADE');
    t.integer('line_number').notNullable();
    t.uuid('item_id').notNullable().references('id').inTable('items');
    t.text('description');
    t.decimal('quantity', 20, 6).notNullable();
    t.uuid('uom_id').references('id').inTable('units_of_measure');
    t.decimal('unit_price', 20, 4).notNullable();
    t.decimal('discount_percent', 10, 4).defaultTo(0);
    t.decimal('discount_amount', 20, 4).defaultTo(0);
    t.uuid('tax_code_id').references('id').inTable('tax_codes');
    t.decimal('tax_amount', 20, 4).defaultTo(0);
    t.decimal('amount', 20, 4).notNullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('sales_orders', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.uuid('subsidiary_id').references('id').inTable('subsidiaries');
    t.string('so_number', 30).notNullable();
    t.uuid('quotation_id').references('id').inTable('quotations');
    t.uuid('customer_id').notNullable().references('id').inTable('customers');
    t.date('order_date').notNullable();
    t.date('expected_ship_date');
    t.string('currency', 10).defaultTo('IDR');
    t.decimal('exchange_rate', 20, 6).defaultTo(1);
    t.string('payment_terms', 50);
    t.uuid('sales_rep_id').references('id').inTable('users');
    t.uuid('location_id').references('id').inTable('locations');
    t.uuid('department_id').references('id').inTable('departments');
    t.text('shipping_address');
    t.string('shipping_method', 100);
    t.string('status', 30).defaultTo('pending_approval'); // pending_approval, pending_fulfillment, partially_fulfilled, pending_billing, partially_billed, billed, closed, cancelled
    t.text('memo');
    t.decimal('subtotal', 20, 4).defaultTo(0);
    t.decimal('discount_amount', 20, 4).defaultTo(0);
    t.decimal('tax_amount', 20, 4).defaultTo(0);
    t.decimal('shipping_amount', 20, 4).defaultTo(0);
    t.decimal('total_amount', 20, 4).defaultTo(0);
    t.uuid('created_by').references('id').inTable('users');
    t.uuid('updated_by').references('id').inTable('users');
    t.uuid('approved_by').references('id').inTable('users');
    t.timestamp('approved_at');
    t.boolean('is_deleted').defaultTo(false);
    t.timestamps(true, true);
    t.unique(['company_id', 'so_number']);
  });

  await knex.schema.createTable('sales_order_lines', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('so_id').notNullable().references('id').inTable('sales_orders').onDelete('CASCADE');
    t.integer('line_number').notNullable();
    t.uuid('item_id').notNullable().references('id').inTable('items');
    t.text('description');
    t.decimal('quantity', 20, 6).notNullable();
    t.decimal('qty_fulfilled', 20, 6).defaultTo(0);
    t.decimal('qty_billed', 20, 6).defaultTo(0);
    t.uuid('uom_id').references('id').inTable('units_of_measure');
    t.decimal('unit_price', 20, 4).notNullable();
    t.decimal('discount_percent', 10, 4).defaultTo(0);
    t.decimal('discount_amount', 20, 4).defaultTo(0);
    t.uuid('tax_code_id').references('id').inTable('tax_codes');
    t.decimal('tax_amount', 20, 4).defaultTo(0);
    t.decimal('amount', 20, 4).notNullable();
    t.date('expected_ship_date');
    t.timestamps(true, true);
  });

  // ============================================================
  // ITEM FULFILLMENT
  // ============================================================
  await knex.schema.createTable('item_fulfillments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('fulfillment_number', 30).notNullable();
    t.uuid('so_id').notNullable().references('id').inTable('sales_orders');
    t.uuid('customer_id').notNullable().references('id').inTable('customers');
    t.date('fulfillment_date').notNullable();
    t.uuid('location_id').references('id').inTable('locations');
    t.uuid('warehouse_id').references('id').inTable('warehouses');
    t.text('shipping_address');
    t.string('tracking_number', 100);
    t.string('carrier', 100);
    t.string('status', 30).defaultTo('pending'); // pending, picked, packed, shipped, cancelled
    t.text('memo');
    t.uuid('created_by').references('id').inTable('users');
    t.timestamps(true, true);
    t.unique(['company_id', 'fulfillment_number']);
  });

  await knex.schema.createTable('item_fulfillment_lines', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('fulfillment_id').notNullable().references('id').inTable('item_fulfillments').onDelete('CASCADE');
    t.uuid('so_line_id').notNullable().references('id').inTable('sales_order_lines');
    t.uuid('item_id').notNullable().references('id').inTable('items');
    t.decimal('quantity', 20, 6).notNullable();
    t.uuid('uom_id').references('id').inTable('units_of_measure');
    t.uuid('bin_id').references('id').inTable('bins');
    t.string('lot_number', 100);
    t.string('serial_number', 100);
    t.timestamps(true, true);
  });

  // ============================================================
  // INVOICES
  // ============================================================
  await knex.schema.createTable('invoices', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.uuid('subsidiary_id').references('id').inTable('subsidiaries');
    t.string('invoice_number', 30).notNullable();
    t.uuid('so_id').references('id').inTable('sales_orders');
    t.uuid('customer_id').notNullable().references('id').inTable('customers');
    t.date('invoice_date').notNullable();
    t.date('due_date').notNullable();
    t.string('currency', 10).defaultTo('IDR');
    t.decimal('exchange_rate', 20, 6).defaultTo(1);
    t.string('payment_terms', 50);
    t.uuid('location_id').references('id').inTable('locations');
    t.uuid('department_id').references('id').inTable('departments');
    t.string('status', 30).defaultTo('open'); // open, partially_paid, paid, voided, overdue
    t.text('memo');
    t.decimal('subtotal', 20, 4).defaultTo(0);
    t.decimal('discount_amount', 20, 4).defaultTo(0);
    t.decimal('tax_amount', 20, 4).defaultTo(0);
    t.decimal('shipping_amount', 20, 4).defaultTo(0);
    t.decimal('total_amount', 20, 4).defaultTo(0);
    t.decimal('amount_paid', 20, 4).defaultTo(0);
    t.decimal('amount_due', 20, 4).defaultTo(0);
    t.uuid('ar_account_id').references('id').inTable('accounts');
    t.boolean('is_posted').defaultTo(false);
    t.uuid('posted_by').references('id').inTable('users');
    t.timestamp('posted_at');
    t.uuid('created_by').references('id').inTable('users');
    t.uuid('updated_by').references('id').inTable('users');
    t.boolean('is_deleted').defaultTo(false);
    t.timestamps(true, true);
    t.unique(['company_id', 'invoice_number']);
  });

  await knex.schema.createTable('invoice_lines', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('invoice_id').notNullable().references('id').inTable('invoices').onDelete('CASCADE');
    t.uuid('so_line_id').references('id').inTable('sales_order_lines');
    t.integer('line_number').notNullable();
    t.uuid('item_id').notNullable().references('id').inTable('items');
    t.text('description');
    t.decimal('quantity', 20, 6).notNullable();
    t.uuid('uom_id').references('id').inTable('units_of_measure');
    t.decimal('unit_price', 20, 4).notNullable();
    t.decimal('discount_percent', 10, 4).defaultTo(0);
    t.decimal('discount_amount', 20, 4).defaultTo(0);
    t.uuid('tax_code_id').references('id').inTable('tax_codes');
    t.decimal('tax_amount', 20, 4).defaultTo(0);
    t.decimal('amount', 20, 4).notNullable();
    t.uuid('income_account_id').references('id').inTable('accounts');
    t.uuid('cogs_account_id').references('id').inTable('accounts');
    t.decimal('cogs_amount', 20, 4).defaultTo(0);
    t.timestamps(true, true);
  });

  // ============================================================
  // CUSTOMER PAYMENTS
  // ============================================================
  await knex.schema.createTable('customer_payments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('payment_number', 30).notNullable();
    t.uuid('customer_id').notNullable().references('id').inTable('customers');
    t.date('payment_date').notNullable();
    t.string('payment_method', 50);
    t.string('reference', 100);
    t.string('currency', 10).defaultTo('IDR');
    t.decimal('exchange_rate', 20, 6).defaultTo(1);
    t.decimal('amount', 20, 4).notNullable();
    t.decimal('unapplied_amount', 20, 4).defaultTo(0);
    t.uuid('bank_account_id').references('id').inTable('accounts');
    t.uuid('ar_account_id').references('id').inTable('accounts');
    t.string('status', 30).defaultTo('open'); // open, applied, voided
    t.text('memo');
    t.boolean('is_posted').defaultTo(false);
    t.uuid('created_by').references('id').inTable('users');
    t.boolean('is_deleted').defaultTo(false);
    t.timestamps(true, true);
    t.unique(['company_id', 'payment_number']);
  });

  await knex.schema.createTable('payment_applications', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('payment_id').notNullable().references('id').inTable('customer_payments').onDelete('CASCADE');
    t.uuid('invoice_id').notNullable().references('id').inTable('invoices');
    t.decimal('applied_amount', 20, 4).notNullable();
    t.timestamps(true, true);
  });

  // ============================================================
  // CREDIT MEMOS
  // ============================================================
  await knex.schema.createTable('credit_memos', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('memo_number', 30).notNullable();
    t.uuid('customer_id').notNullable().references('id').inTable('customers');
    t.uuid('invoice_id').references('id').inTable('invoices');
    t.date('memo_date').notNullable();
    t.string('currency', 10).defaultTo('IDR');
    t.decimal('total_amount', 20, 4).defaultTo(0);
    t.string('status', 30).defaultTo('open');
    t.text('memo');
    t.boolean('is_posted').defaultTo(false);
    t.uuid('created_by').references('id').inTable('users');
    t.timestamps(true, true);
    t.unique(['company_id', 'memo_number']);
  });

  // ============================================================
  // PURCHASING MODULE
  // ============================================================
  await knex.schema.createTable('purchase_requisitions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('pr_number', 30).notNullable();
    t.date('request_date').notNullable();
    t.date('required_date');
    t.uuid('requested_by').notNullable().references('id').inTable('users');
    t.uuid('department_id').references('id').inTable('departments');
    t.uuid('location_id').references('id').inTable('locations');
    t.string('status', 30).defaultTo('draft'); // draft, submitted, approved, rejected, converted, closed
    t.text('reason');
    t.decimal('total_amount', 20, 4).defaultTo(0);
    t.uuid('approved_by').references('id').inTable('users');
    t.timestamp('approved_at');
    t.boolean('is_deleted').defaultTo(false);
    t.timestamps(true, true);
    t.unique(['company_id', 'pr_number']);
  });

  await knex.schema.createTable('purchase_requisition_lines', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('pr_id').notNullable().references('id').inTable('purchase_requisitions').onDelete('CASCADE');
    t.integer('line_number').notNullable();
    t.uuid('item_id').notNullable().references('id').inTable('items');
    t.text('description');
    t.decimal('quantity', 20, 6).notNullable();
    t.uuid('uom_id').references('id').inTable('units_of_measure');
    t.decimal('estimated_price', 20, 4).defaultTo(0);
    t.uuid('preferred_vendor_id').references('id').inTable('vendors');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('purchase_orders', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.uuid('subsidiary_id').references('id').inTable('subsidiaries');
    t.string('po_number', 30).notNullable();
    t.uuid('pr_id').references('id').inTable('purchase_requisitions');
    t.uuid('vendor_id').notNullable().references('id').inTable('vendors');
    t.date('order_date').notNullable();
    t.date('expected_receipt_date');
    t.string('currency', 10).defaultTo('IDR');
    t.decimal('exchange_rate', 20, 6).defaultTo(1);
    t.string('payment_terms', 50);
    t.uuid('location_id').references('id').inTable('locations');
    t.uuid('warehouse_id').references('id').inTable('warehouses');
    t.uuid('department_id').references('id').inTable('departments');
    t.string('status', 30).defaultTo('pending_approval'); // pending_approval, pending_receipt, partially_received, fully_received, pending_billing, closed, cancelled
    t.text('memo');
    t.decimal('subtotal', 20, 4).defaultTo(0);
    t.decimal('tax_amount', 20, 4).defaultTo(0);
    t.decimal('total_amount', 20, 4).defaultTo(0);
    t.uuid('created_by').references('id').inTable('users');
    t.uuid('updated_by').references('id').inTable('users');
    t.uuid('approved_by').references('id').inTable('users');
    t.timestamp('approved_at');
    t.boolean('is_deleted').defaultTo(false);
    t.timestamps(true, true);
    t.unique(['company_id', 'po_number']);
  });

  await knex.schema.createTable('purchase_order_lines', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('po_id').notNullable().references('id').inTable('purchase_orders').onDelete('CASCADE');
    t.integer('line_number').notNullable();
    t.uuid('item_id').notNullable().references('id').inTable('items');
    t.text('description');
    t.decimal('quantity', 20, 6).notNullable();
    t.decimal('qty_received', 20, 6).defaultTo(0);
    t.decimal('qty_billed', 20, 6).defaultTo(0);
    t.uuid('uom_id').references('id').inTable('units_of_measure');
    t.decimal('unit_price', 20, 4).notNullable();
    t.uuid('tax_code_id').references('id').inTable('tax_codes');
    t.decimal('tax_amount', 20, 4).defaultTo(0);
    t.decimal('amount', 20, 4).notNullable();
    t.uuid('expense_account_id').references('id').inTable('accounts');
    t.date('expected_receipt_date');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('item_receipts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('receipt_number', 30).notNullable();
    t.uuid('po_id').notNullable().references('id').inTable('purchase_orders');
    t.uuid('vendor_id').notNullable().references('id').inTable('vendors');
    t.date('receipt_date').notNullable();
    t.uuid('location_id').references('id').inTable('locations');
    t.uuid('warehouse_id').references('id').inTable('warehouses');
    t.string('status', 30).defaultTo('received'); // received, voided
    t.text('memo');
    t.uuid('created_by').references('id').inTable('users');
    t.timestamps(true, true);
    t.unique(['company_id', 'receipt_number']);
  });

  await knex.schema.createTable('item_receipt_lines', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('receipt_id').notNullable().references('id').inTable('item_receipts').onDelete('CASCADE');
    t.uuid('po_line_id').notNullable().references('id').inTable('purchase_order_lines');
    t.uuid('item_id').notNullable().references('id').inTable('items');
    t.decimal('quantity', 20, 6).notNullable();
    t.uuid('uom_id').references('id').inTable('units_of_measure');
    t.uuid('bin_id').references('id').inTable('bins');
    t.string('lot_number', 100);
    t.string('serial_number', 100);
    t.date('expiry_date');
    t.decimal('unit_cost', 20, 4).notNullable();
    t.decimal('amount', 20, 4).notNullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('vendor_bills', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.uuid('subsidiary_id').references('id').inTable('subsidiaries');
    t.string('bill_number', 30).notNullable();
    t.string('vendor_invoice_number', 100);
    t.uuid('po_id').references('id').inTable('purchase_orders');
    t.uuid('vendor_id').notNullable().references('id').inTable('vendors');
    t.date('bill_date').notNullable();
    t.date('due_date').notNullable();
    t.string('currency', 10).defaultTo('IDR');
    t.decimal('exchange_rate', 20, 6).defaultTo(1);
    t.string('payment_terms', 50);
    t.uuid('location_id').references('id').inTable('locations');
    t.uuid('department_id').references('id').inTable('departments');
    t.string('status', 30).defaultTo('open'); // open, partially_paid, paid, voided
    t.text('memo');
    t.decimal('subtotal', 20, 4).defaultTo(0);
    t.decimal('tax_amount', 20, 4).defaultTo(0);
    t.decimal('total_amount', 20, 4).defaultTo(0);
    t.decimal('amount_paid', 20, 4).defaultTo(0);
    t.decimal('amount_due', 20, 4).defaultTo(0);
    t.uuid('ap_account_id').references('id').inTable('accounts');
    t.boolean('is_posted').defaultTo(false);
    t.uuid('created_by').references('id').inTable('users');
    t.boolean('is_deleted').defaultTo(false);
    t.timestamps(true, true);
    t.unique(['company_id', 'bill_number']);
  });

  await knex.schema.createTable('vendor_bill_lines', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('bill_id').notNullable().references('id').inTable('vendor_bills').onDelete('CASCADE');
    t.uuid('po_line_id').references('id').inTable('purchase_order_lines');
    t.integer('line_number').notNullable();
    t.uuid('item_id').references('id').inTable('items');
    t.text('description');
    t.decimal('quantity', 20, 6).notNullable();
    t.uuid('uom_id').references('id').inTable('units_of_measure');
    t.decimal('unit_price', 20, 4).notNullable();
    t.uuid('tax_code_id').references('id').inTable('tax_codes');
    t.decimal('tax_amount', 20, 4).defaultTo(0);
    t.decimal('amount', 20, 4).notNullable();
    t.uuid('expense_account_id').references('id').inTable('accounts');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('vendor_payments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('payment_number', 30).notNullable();
    t.uuid('vendor_id').notNullable().references('id').inTable('vendors');
    t.date('payment_date').notNullable();
    t.string('payment_method', 50);
    t.string('reference', 100);
    t.string('currency', 10).defaultTo('IDR');
    t.decimal('exchange_rate', 20, 6).defaultTo(1);
    t.decimal('amount', 20, 4).notNullable();
    t.decimal('unapplied_amount', 20, 4).defaultTo(0);
    t.uuid('bank_account_id').references('id').inTable('accounts');
    t.uuid('ap_account_id').references('id').inTable('accounts');
    t.string('status', 30).defaultTo('open');
    t.text('memo');
    t.boolean('is_posted').defaultTo(false);
    t.uuid('created_by').references('id').inTable('users');
    t.boolean('is_deleted').defaultTo(false);
    t.timestamps(true, true);
    t.unique(['company_id', 'payment_number']);
  });

  await knex.schema.createTable('bill_payment_applications', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('payment_id').notNullable().references('id').inTable('vendor_payments').onDelete('CASCADE');
    t.uuid('bill_id').notNullable().references('id').inTable('vendor_bills');
    t.decimal('applied_amount', 20, 4).notNullable();
    t.timestamps(true, true);
  });

  // ============================================================
  // INVENTORY TRANSACTIONS
  // ============================================================
  await knex.schema.createTable('inventory_transactions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('transaction_number', 30).notNullable();
    t.string('transaction_type', 50).notNullable(); // adjustment, transfer, receipt, fulfillment, issue, return, count, reclassification, wo_issue, wo_return, wo_completion
    t.string('reference_type', 50); // so, po, wo, adjustment, etc.
    t.uuid('reference_id'); // generic reference to source transaction
    t.date('transaction_date').notNullable();
    t.uuid('location_id').references('id').inTable('locations');
    t.uuid('warehouse_id').references('id').inTable('warehouses');
    t.uuid('to_location_id').references('id').inTable('locations');
    t.uuid('to_warehouse_id').references('id').inTable('warehouses');
    t.string('status', 30).defaultTo('completed');
    t.text('memo');
    t.uuid('created_by').references('id').inTable('users');
    t.boolean('is_reversed').defaultTo(false);
    t.uuid('reversal_of').references('id').inTable('inventory_transactions');
    t.timestamps(true, true);
    t.unique(['company_id', 'transaction_number']);
  });

  await knex.schema.createTable('inventory_transaction_lines', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('transaction_id').notNullable().references('id').inTable('inventory_transactions').onDelete('CASCADE');
    t.uuid('item_id').notNullable().references('id').inTable('items');
    t.decimal('quantity', 20, 6).notNullable();
    t.string('direction', 5).notNullable(); // in, out
    t.uuid('uom_id').references('id').inTable('units_of_measure');
    t.uuid('bin_id').references('id').inTable('bins');
    t.string('lot_number', 100);
    t.string('serial_number', 100);
    t.date('expiry_date');
    t.decimal('unit_cost', 20, 4);
    t.decimal('total_cost', 20, 4);
    t.timestamps(true, true);
  });

  // ============================================================
  // GENERAL LEDGER
  // ============================================================
  await knex.schema.createTable('journal_entries', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.uuid('subsidiary_id').references('id').inTable('subsidiaries');
    t.string('journal_number', 30).notNullable();
    t.date('entry_date').notNullable();
    t.uuid('period_id').references('id').inTable('accounting_periods');
    t.string('currency', 10).defaultTo('IDR');
    t.decimal('exchange_rate', 20, 6).defaultTo(1);
    t.string('type', 50).defaultTo('manual'); // manual, system, auto_reverse
    t.string('source_type', 50); // invoice, bill, payment, wo_completion, etc.
    t.uuid('source_id'); // generic FK
    t.text('memo');
    t.string('status', 30).defaultTo('draft'); // draft, posted, reversed
    t.boolean('is_reversing').defaultTo(false);
    t.uuid('reversal_of').references('id').inTable('journal_entries');
    t.uuid('reversed_by').references('id').inTable('journal_entries');
    t.uuid('department_id').references('id').inTable('departments');
    t.uuid('location_id').references('id').inTable('locations');
    t.uuid('class_id').references('id').inTable('classes');
    t.uuid('created_by').references('id').inTable('users');
    t.uuid('posted_by').references('id').inTable('users');
    t.timestamp('posted_at');
    t.boolean('is_deleted').defaultTo(false);
    t.timestamps(true, true);
    t.unique(['company_id', 'journal_number']);
  });

  await knex.schema.createTable('journal_entry_lines', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('journal_id').notNullable().references('id').inTable('journal_entries').onDelete('CASCADE');
    t.integer('line_number').notNullable();
    t.uuid('account_id').notNullable().references('id').inTable('accounts');
    t.decimal('debit', 20, 4).defaultTo(0);
    t.decimal('credit', 20, 4).defaultTo(0);
    t.decimal('debit_base', 20, 4).defaultTo(0);
    t.decimal('credit_base', 20, 4).defaultTo(0);
    t.string('currency', 10).defaultTo('IDR');
    t.uuid('entity_customer_id').references('id').inTable('customers');
    t.uuid('entity_vendor_id').references('id').inTable('vendors');
    t.uuid('department_id').references('id').inTable('departments');
    t.uuid('location_id').references('id').inTable('locations');
    t.uuid('class_id').references('id').inTable('classes');
    t.text('memo');
    t.timestamps(true, true);
  });

  // ============================================================
  // MANUFACTURING MODULE
  // ============================================================
  await knex.schema.createTable('work_centers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('code', 30).notNullable();
    t.string('name', 200).notNullable();
    t.uuid('location_id').references('id').inTable('locations');
    t.decimal('capacity', 20, 4).defaultTo(8); // hours per day
    t.string('machine_description', 200);
    t.decimal('labor_rate', 20, 4).defaultTo(0);
    t.decimal('machine_rate', 20, 4).defaultTo(0);
    t.decimal('overhead_rate', 20, 4).defaultTo(0);
    t.decimal('efficiency_percent', 10, 4).defaultTo(100);
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
    t.unique(['company_id', 'code']);
  });

  await knex.schema.createTable('boms', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('bom_number', 30).notNullable();
    t.string('name', 200).notNullable();
    t.uuid('finished_good_id').notNullable().references('id').inTable('items');
    t.string('revision', 20).defaultTo('1');
    t.date('effective_date');
    t.date('expiry_date');
    t.decimal('quantity', 20, 6).defaultTo(1);
    t.uuid('uom_id').references('id').inTable('units_of_measure');
    t.decimal('yield_percent', 10, 4).defaultTo(100);
    t.string('status', 20).defaultTo('active'); // draft, active, obsolete
    t.text('description');
    t.uuid('created_by').references('id').inTable('users');
    t.boolean('is_deleted').defaultTo(false);
    t.timestamps(true, true);
    t.unique(['company_id', 'bom_number']);
  });

  await knex.schema.createTable('bom_components', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('bom_id').notNullable().references('id').inTable('boms').onDelete('CASCADE');
    t.integer('sequence').notNullable();
    t.uuid('item_id').notNullable().references('id').inTable('items');
    t.decimal('quantity', 20, 6).notNullable();
    t.uuid('uom_id').references('id').inTable('units_of_measure');
    t.decimal('scrap_percent', 10, 4).defaultTo(0);
    t.string('supply_type', 30).defaultTo('pull'); // pull, push, phantom
    t.text('notes');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('routings', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('routing_number', 30).notNullable();
    t.string('name', 200).notNullable();
    t.uuid('item_id').references('id').inTable('items');
    t.string('status', 20).defaultTo('active');
    t.timestamps(true, true);
    t.unique(['company_id', 'routing_number']);
  });

  await knex.schema.createTable('routing_operations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('routing_id').notNullable().references('id').inTable('routings').onDelete('CASCADE');
    t.integer('sequence').notNullable();
    t.string('operation_name', 200).notNullable();
    t.uuid('work_center_id').notNullable().references('id').inTable('work_centers');
    t.decimal('setup_time', 10, 4).defaultTo(0); // hours
    t.decimal('run_time_per_unit', 10, 6).defaultTo(0); // hours per unit
    t.decimal('labor_cost_per_hour', 20, 4).defaultTo(0);
    t.decimal('machine_cost_per_hour', 20, 4).defaultTo(0);
    t.decimal('overhead_cost_per_hour', 20, 4).defaultTo(0);
    t.text('description');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('work_orders', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.uuid('subsidiary_id').references('id').inTable('subsidiaries');
    t.string('wo_number', 30).notNullable();
    t.uuid('item_id').notNullable().references('id').inTable('items');
    t.decimal('planned_quantity', 20, 6).notNullable();
    t.decimal('completed_quantity', 20, 6).defaultTo(0);
    t.decimal('scrapped_quantity', 20, 6).defaultTo(0);
    t.uuid('uom_id').references('id').inTable('units_of_measure');
    t.uuid('bom_id').notNullable().references('id').inTable('boms');
    t.uuid('routing_id').references('id').inTable('routings');
    t.uuid('location_id').references('id').inTable('locations');
    t.uuid('warehouse_id').references('id').inTable('warehouses');
    t.date('planned_start_date').notNullable();
    t.date('planned_end_date').notNullable();
    t.date('actual_start_date');
    t.date('actual_end_date');
    t.string('status', 30).defaultTo('planned'); // planned, released, in_progress, completed, closed, cancelled
    t.text('memo');
    t.decimal('estimated_material_cost', 20, 4).defaultTo(0);
    t.decimal('estimated_labor_cost', 20, 4).defaultTo(0);
    t.decimal('estimated_machine_cost', 20, 4).defaultTo(0);
    t.decimal('estimated_overhead_cost', 20, 4).defaultTo(0);
    t.decimal('actual_material_cost', 20, 4).defaultTo(0);
    t.decimal('actual_labor_cost', 20, 4).defaultTo(0);
    t.decimal('actual_machine_cost', 20, 4).defaultTo(0);
    t.decimal('actual_overhead_cost', 20, 4).defaultTo(0);
    t.decimal('variance_amount', 20, 4).defaultTo(0);
    t.uuid('sales_order_id').references('id').inTable('sales_orders');
    t.uuid('created_by').references('id').inTable('users');
    t.uuid('updated_by').references('id').inTable('users');
    t.boolean('is_deleted').defaultTo(false);
    t.timestamps(true, true);
    t.unique(['company_id', 'wo_number']);
  });

  await knex.schema.createTable('work_order_materials', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('wo_id').notNullable().references('id').inTable('work_orders').onDelete('CASCADE');
    t.uuid('item_id').notNullable().references('id').inTable('items');
    t.decimal('planned_quantity', 20, 6).notNullable();
    t.decimal('issued_quantity', 20, 6).defaultTo(0);
    t.decimal('returned_quantity', 20, 6).defaultTo(0);
    t.uuid('uom_id').references('id').inTable('units_of_measure');
    t.decimal('standard_cost', 20, 4).defaultTo(0);
    t.decimal('actual_cost', 20, 4).defaultTo(0);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('work_order_operations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('wo_id').notNullable().references('id').inTable('work_orders').onDelete('CASCADE');
    t.uuid('routing_op_id').references('id').inTable('routing_operations');
    t.integer('sequence').notNullable();
    t.string('operation_name', 200).notNullable();
    t.uuid('work_center_id').notNullable().references('id').inTable('work_centers');
    t.decimal('planned_setup_hours', 10, 4).defaultTo(0);
    t.decimal('planned_run_hours', 10, 4).defaultTo(0);
    t.decimal('actual_setup_hours', 10, 4).defaultTo(0);
    t.decimal('actual_run_hours', 10, 4).defaultTo(0);
    t.decimal('planned_labor_cost', 20, 4).defaultTo(0);
    t.decimal('actual_labor_cost', 20, 4).defaultTo(0);
    t.string('status', 30).defaultTo('pending'); // pending, in_progress, completed
    t.timestamps(true, true);
  });

  await knex.schema.createTable('material_issues', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('issue_number', 30).notNullable();
    t.uuid('wo_id').notNullable().references('id').inTable('work_orders');
    t.date('issue_date').notNullable();
    t.uuid('from_warehouse_id').references('id').inTable('warehouses');
    t.string('status', 30).defaultTo('issued');
    t.text('memo');
    t.uuid('created_by').references('id').inTable('users');
    t.timestamps(true, true);
    t.unique(['company_id', 'issue_number']);
  });

  await knex.schema.createTable('material_issue_lines', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('issue_id').notNullable().references('id').inTable('material_issues').onDelete('CASCADE');
    t.uuid('wo_material_id').references('id').inTable('work_order_materials');
    t.uuid('item_id').notNullable().references('id').inTable('items');
    t.decimal('quantity', 20, 6).notNullable();
    t.uuid('uom_id').references('id').inTable('units_of_measure');
    t.uuid('bin_id').references('id').inTable('bins');
    t.string('lot_number', 100);
    t.string('serial_number', 100);
    t.decimal('unit_cost', 20, 4);
    t.decimal('total_cost', 20, 4);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('work_order_completions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('completion_number', 30).notNullable();
    t.uuid('wo_id').notNullable().references('id').inTable('work_orders');
    t.date('completion_date').notNullable();
    t.decimal('completed_quantity', 20, 6).notNullable();
    t.decimal('scrapped_quantity', 20, 6).defaultTo(0);
    t.uuid('to_warehouse_id').references('id').inTable('warehouses');
    t.uuid('bin_id').references('id').inTable('bins');
    t.string('lot_number', 100);
    t.decimal('actual_material_cost', 20, 4).defaultTo(0);
    t.decimal('actual_labor_cost', 20, 4).defaultTo(0);
    t.decimal('actual_machine_cost', 20, 4).defaultTo(0);
    t.decimal('actual_overhead_cost', 20, 4).defaultTo(0);
    t.decimal('total_cost', 20, 4).defaultTo(0);
    t.decimal('unit_cost', 20, 4).defaultTo(0);
    t.text('memo');
    t.uuid('created_by').references('id').inTable('users');
    t.timestamps(true, true);
    t.unique(['company_id', 'completion_number']);
  });

  // ============================================================
  // MRP
  // ============================================================
  await knex.schema.createTable('mrp_plans', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('plan_number', 30).notNullable();
    t.string('name', 200).notNullable();
    t.date('plan_date').notNullable();
    t.date('horizon_start');
    t.date('horizon_end');
    t.string('status', 30).defaultTo('draft'); // draft, running, completed, cancelled
    t.uuid('created_by').references('id').inTable('users');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('mrp_recommendations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('plan_id').notNullable().references('id').inTable('mrp_plans').onDelete('CASCADE');
    t.uuid('item_id').notNullable().references('id').inTable('items');
    t.string('recommendation_type', 30).notNullable(); // purchase, work_order, transfer
    t.decimal('demand_quantity', 20, 6).notNullable();
    t.decimal('available_quantity', 20, 6).defaultTo(0);
    t.decimal('on_order_quantity', 20, 6).defaultTo(0);
    t.decimal('recommended_quantity', 20, 6).notNullable();
    t.date('required_date').notNullable();
    t.date('suggested_date').notNullable();
    t.uuid('preferred_vendor_id').references('id').inTable('vendors');
    t.string('status', 30).defaultTo('open'); // open, converted, cancelled
    t.uuid('converted_to_id'); // po_id or wo_id
    t.timestamps(true, true);
  });

  // ============================================================
  // FIXED ASSETS
  // ============================================================
  await knex.schema.createTable('asset_categories', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('code', 20).notNullable();
    t.string('name', 200).notNullable();
    t.string('depreciation_method', 30).defaultTo('straight_line');
    t.integer('useful_life_years').defaultTo(5);
    t.decimal('salvage_value_percent', 10, 4).defaultTo(0);
    t.uuid('asset_account_id').references('id').inTable('accounts');
    t.uuid('depreciation_account_id').references('id').inTable('accounts');
    t.uuid('accumulated_dep_account_id').references('id').inTable('accounts');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('fixed_assets', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('asset_number', 30).notNullable();
    t.string('name', 200).notNullable();
    t.uuid('category_id').references('id').inTable('asset_categories');
    t.date('acquisition_date').notNullable();
    t.decimal('original_cost', 20, 4).notNullable();
    t.decimal('salvage_value', 20, 4).defaultTo(0);
    t.decimal('accumulated_depreciation', 20, 4).defaultTo(0);
    t.decimal('book_value', 20, 4);
    t.uuid('location_id').references('id').inTable('locations');
    t.uuid('department_id').references('id').inTable('departments');
    t.string('serial_number', 100);
    t.string('status', 30).defaultTo('active'); // active, disposed, fully_depreciated
    t.timestamps(true, true);
    t.unique(['company_id', 'asset_number']);
  });

  // ============================================================
  // BANKING
  // ============================================================
  await knex.schema.createTable('bank_accounts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('account_name', 200).notNullable();
    t.string('bank_name', 200).notNullable();
    t.string('account_number', 100).notNullable();
    t.string('currency', 10).defaultTo('IDR');
    t.uuid('gl_account_id').references('id').inTable('accounts');
    t.decimal('current_balance', 20, 4).defaultTo(0);
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
  });

  // ============================================================
  // CRM
  // ============================================================
  await knex.schema.createTable('leads', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('lead_number', 30).notNullable();
    t.string('name', 200).notNullable();
    t.string('company_name', 200);
    t.string('email', 200);
    t.string('phone', 50);
    t.string('source', 100);
    t.string('status', 30).defaultTo('new'); // new, qualified, converted, lost
    t.uuid('assigned_to').references('id').inTable('users');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('opportunities', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('opportunity_number', 30).notNullable();
    t.string('name', 200).notNullable();
    t.uuid('customer_id').references('id').inTable('customers');
    t.decimal('expected_amount', 20, 4).defaultTo(0);
    t.date('expected_close_date');
    t.string('stage', 50).defaultTo('lead'); // lead, qualified, proposal, negotiation, won, lost
    t.integer('probability_percent').defaultTo(0);
    t.uuid('assigned_to').references('id').inTable('users');
    t.text('description');
    t.timestamps(true, true);
  });

  // ============================================================
  // ACTIVITIES / NOTES / ATTACHMENTS / AUDIT
  // ============================================================
  await knex.schema.createTable('activities', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('entity_type', 50).notNullable(); // customer, vendor, so, invoice, etc.
    t.uuid('entity_id').notNullable();
    t.string('type', 50).notNullable(); // note, call, email, meeting, task
    t.text('content').notNullable();
    t.timestamp('activity_date').defaultTo(knex.fn.now());
    t.uuid('created_by').references('id').inTable('users');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('attachments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('entity_type', 50).notNullable();
    t.uuid('entity_id').notNullable();
    t.string('file_name', 500).notNullable();
    t.string('file_type', 100);
    t.integer('file_size');
    t.string('file_path', 1000);
    t.uuid('uploaded_by').references('id').inTable('users');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('audit_logs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').references('id').inTable('companies');
    t.uuid('user_id').references('id').inTable('users');
    t.string('action', 50).notNullable(); // create, update, delete, approve, post, void
    t.string('entity_type', 50).notNullable();
    t.uuid('entity_id').notNullable();
    t.string('entity_number', 100);
    t.jsonb('old_values');
    t.jsonb('new_values');
    t.string('ip_address', 50);
    t.string('user_agent', 500);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('approval_history', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('entity_type', 50).notNullable();
    t.uuid('entity_id').notNullable();
    t.uuid('workflow_id').references('id').inTable('approval_workflows');
    t.integer('step_order').notNullable();
    t.string('action', 30).notNullable(); // submitted, approved, rejected
    t.text('comments');
    t.uuid('action_by').references('id').inTable('users');
    t.timestamp('action_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('notifications', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('type', 50).notNullable();
    t.string('title', 200).notNullable();
    t.text('message');
    t.string('entity_type', 50);
    t.uuid('entity_id');
    t.boolean('is_read').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('saved_searches', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('name', 200).notNullable();
    t.string('module', 50).notNullable();
    t.jsonb('filters').defaultTo('{}');
    t.jsonb('columns').defaultTo('[]');
    t.jsonb('sort_by').defaultTo('{}');
    t.boolean('is_public').defaultTo(false);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('projects', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('project_number', 30).notNullable();
    t.string('name', 200).notNullable();
    t.uuid('customer_id').references('id').inTable('customers');
    t.date('start_date');
    t.date('end_date');
    t.decimal('budget', 20, 4).defaultTo(0);
    t.decimal('actual_cost', 20, 4).defaultTo(0);
    t.string('status', 30).defaultTo('active');
    t.uuid('manager_id').references('id').inTable('users');
    t.timestamps(true, true);
  });

  // ============================================================
  // INDEXES
  // ============================================================
  await knex.raw('CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id)');
  await knex.raw('CREATE INDEX idx_audit_logs_user ON audit_logs(user_id)');
  await knex.raw('CREATE INDEX idx_activities_entity ON activities(entity_type, entity_id)');
  await knex.raw('CREATE INDEX idx_attachments_entity ON attachments(entity_type, entity_id)');
  await knex.raw('CREATE INDEX idx_inv_bal_item ON inventory_balances(company_id, item_id)');
  await knex.raw('CREATE INDEX idx_inv_bal_warehouse ON inventory_balances(warehouse_id)');
  await knex.raw('CREATE INDEX idx_inv_txn_company ON inventory_transactions(company_id, transaction_date)');
  await knex.raw('CREATE INDEX idx_je_lines_account ON journal_entry_lines(account_id)');
  await knex.raw('CREATE INDEX idx_je_date ON journal_entries(company_id, entry_date)');
  await knex.raw('CREATE INDEX idx_invoices_customer ON invoices(customer_id, status)');
  await knex.raw('CREATE INDEX idx_bills_vendor ON vendor_bills(vendor_id, status)');
  await knex.raw('CREATE INDEX idx_so_customer ON sales_orders(customer_id, status)');
  await knex.raw('CREATE INDEX idx_po_vendor ON purchase_orders(vendor_id, status)');
  await knex.raw('CREATE INDEX idx_wo_item ON work_orders(company_id, item_id, status)');
  await knex.raw('CREATE INDEX idx_items_code ON items(company_id, item_code)');
  await knex.raw('CREATE INDEX idx_customers_number ON customers(company_id, customer_number)');
  await knex.raw('CREATE INDEX idx_vendors_number ON vendors(company_id, vendor_number)');
  await knex.raw('CREATE INDEX idx_notifications_user ON notifications(user_id, is_read)');
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    'notifications', 'saved_searches', 'approval_history', 'audit_logs',
    'attachments', 'activities', 'projects', 'opportunities', 'leads',
    'bank_accounts', 'fixed_assets', 'asset_categories',
    'mrp_recommendations', 'mrp_plans',
    'work_order_completions', 'material_issue_lines', 'material_issues',
    'work_order_operations', 'work_order_materials', 'work_orders',
    'routing_operations', 'routings', 'bom_components', 'boms', 'work_centers',
    'journal_entry_lines', 'journal_entries',
    'inventory_transaction_lines', 'inventory_transactions',
    'bill_payment_applications', 'vendor_payments',
    'vendor_bill_lines', 'vendor_bills',
    'item_receipt_lines', 'item_receipts',
    'purchase_order_lines', 'purchase_orders', 'purchase_requisition_lines', 'purchase_requisitions',
    'credit_memos', 'payment_applications', 'customer_payments',
    'invoice_lines', 'invoices',
    'item_fulfillment_lines', 'item_fulfillments',
    'sales_order_lines', 'sales_orders', 'quotation_lines', 'quotations',
    'approval_steps', 'approval_workflows',
    'transaction_sequences', 'inventory_balances',
    'bins', 'warehouses', 'item_prices', 'items', 'item_categories',
    'vendor_contacts', 'vendors', 'customer_contacts', 'customers',
    'accounting_periods', 'fiscal_years', 'accounts',
    'tax_codes', 'uom_conversions', 'units_of_measure',
    'exchange_rates', 'currencies',
    'classes', 'departments', 'locations',
    'user_subsidiaries', 'users', 'role_permissions', 'permissions', 'roles',
    'subsidiaries', 'companies'
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
}
