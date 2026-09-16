import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {

  // ── Audit log: add context & type columns ────────────────────────────────
  const hasContext = await knex.schema.hasColumn('transaction_audit_log', 'context');
  if (!hasContext) {
    await knex.schema.alterTable('transaction_audit_log', t => {
      t.string('context', 20).nullable().defaultTo('System'); // UI / System / API
      t.string('change_type', 20).nullable();                  // Set / Change / Delete
      t.string('field_name', 200).nullable();
      t.text('old_value').nullable();
      t.text('new_value').nullable();
    });
  }

  // ── forms ────────────────────────────────────────────────────────────────
  await knex.schema.createTableIfNotExists('custom_forms', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('code', 100).notNullable();
    t.string('name', 200).notNullable();
    t.text('description').nullable();
    t.string('module', 100).nullable();          // bank_check, invoice, etc
    t.string('transaction_type', 100).nullable();// Check, Invoice, etc
    t.string('printing_type', 20).defaultTo('basic'); // basic / advanced
    t.boolean('is_active').defaultTo(true);
    t.boolean('allow_add_multiple').defaultTo(false);
    t.boolean('store_form_with_record').defaultTo(true);
    t.boolean('form_is_preferred').defaultTo(false);
    t.integer('version').defaultTo(1);
    t.text('custom_script').nullable();
    t.uuid('created_by').nullable();
    t.uuid('updated_by').nullable();
    t.timestamps(true, true);
    t.unique(['company_id','code']);
  });

  // ── form_tabs ────────────────────────────────────────────────────────────
  await knex.schema.createTableIfNotExists('custom_form_tabs', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('form_id').notNullable().references('id').inTable('custom_forms').onDelete('CASCADE');
    t.string('tab_id', 100).notNullable();
    t.string('label', 200).notNullable();
    t.integer('sequence').defaultTo(0);
    t.boolean('is_visible').defaultTo(true);
    t.boolean('is_system').defaultTo(false);    // system tabs can't be deleted
  });

  // ── form_field_groups ────────────────────────────────────────────────────
  await knex.schema.createTableIfNotExists('custom_form_field_groups', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('form_id').notNullable().references('id').inTable('custom_forms').onDelete('CASCADE');
    t.uuid('tab_id').nullable().references('id').inTable('custom_form_tabs').onDelete('SET NULL');
    t.string('group_id', 100).notNullable();
    t.string('label', 200).notNullable();
    t.integer('columns').defaultTo(2);          // 1,2,3,4
    t.integer('sequence').defaultTo(0);
    t.boolean('is_collapsible').defaultTo(false);
    t.boolean('is_collapsed').defaultTo(false);
  });

  // ── form_fields ──────────────────────────────────────────────────────────
  await knex.schema.createTableIfNotExists('custom_form_fields', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('form_id').notNullable().references('id').inTable('custom_forms').onDelete('CASCADE');
    t.uuid('tab_id').nullable().references('id').inTable('custom_form_tabs').onDelete('SET NULL');
    t.uuid('group_id').nullable().references('id').inTable('custom_form_field_groups').onDelete('SET NULL');

    t.string('field_id', 100).notNullable();    // unique within form
    t.string('label', 200).notNullable();
    t.string('field_type', 50).notNullable();   // text,number,date,select,reference,file,formula,autonumber...
    t.string('subtype', 50).nullable();         // free_text,email,currency,dropdown,multiselect...
    t.string('section', 20).defaultTo('header');// header / line

    // Display
    t.boolean('is_visible').defaultTo(true);
    t.boolean('is_mandatory').defaultTo(false);
    t.boolean('is_readonly').defaultTo(false);
    t.string('display_type', 30).defaultTo('Normal'); // Normal / Inline Text / Disabled
    t.string('placeholder', 200).nullable();
    t.text('help_text').nullable();
    t.integer('width').nullable();
    t.integer('sequence').defaultTo(0);

    // Layout
    t.boolean('column_break').defaultTo(false);
    t.boolean('space_before').defaultTo(false);
    t.boolean('same_row_as_previous').defaultTo(false);

    // Checkbox default
    t.string('checkbox_default', 20).nullable(); // checked / unchecked

    // Value
    t.text('default_value').nullable();
    t.text('formula').nullable();

    // Validation
    t.jsonb('validation_rules').nullable(); // {min,max,min_length,max_length,regex,message}

    // Reference type
    t.string('datasource', 100).nullable(); // customers, vendors, items, accounts, departments...
    t.text('datasource_filter').nullable(); // JSON filter conditions

    // Options (for dropdown, radio, multiselect, checkbox)
    t.jsonb('options').nullable(); // [{label,value}]

    // Features
    t.boolean('is_searchable').defaultTo(false);
    t.boolean('is_printable').defaultTo(true);
    t.boolean('audit_trail').defaultTo(true);

    // Conditional logic
    t.jsonb('conditions').nullable(); // [{field_id, operator, value, action: show/hide/require/readonly}]

    // Permissions
    t.jsonb('permissions').nullable(); // [{role_id, can_view, can_create, can_edit}]

    // System
    t.boolean('is_system').defaultTo(false);   // built-in fields
    t.boolean('is_custom').defaultTo(true);    // user-created
    t.uuid('created_by').nullable();
    t.timestamps(true, true);
  });

  // ── form_sublists ────────────────────────────────────────────────────────
  await knex.schema.createTableIfNotExists('custom_form_sublists', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('form_id').notNullable().references('id').inTable('custom_forms').onDelete('CASCADE');
    t.uuid('tab_id').nullable().references('id').inTable('custom_form_tabs').onDelete('SET NULL');
    t.string('sublist_id', 100).notNullable();
    t.string('label', 200).notNullable();
    t.string('sublist_type', 50).defaultTo('list'); // list / editor
    t.integer('sequence').defaultTo(0);
    t.boolean('is_visible').defaultTo(true);
    t.boolean('is_system').defaultTo(false);
  });

  // ── form_sublist_fields ──────────────────────────────────────────────────
  await knex.schema.createTableIfNotExists('custom_form_sublist_fields', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('sublist_id').notNullable().references('id').inTable('custom_form_sublists').onDelete('CASCADE');
    t.string('field_id', 100).notNullable();
    t.string('label', 200).notNullable();
    t.string('field_type', 50).defaultTo('text');
    t.boolean('is_visible').defaultTo(true);
    t.boolean('is_mandatory').defaultTo(false);
    t.integer('sequence').defaultTo(0);
    t.string('datasource', 100).nullable();
    t.jsonb('options').nullable();
    t.boolean('is_system').defaultTo(false);
    t.boolean('is_custom').defaultTo(false);
  });

  // ── transaction_field_values (EAV) ───────────────────────────────────────
  await knex.schema.createTableIfNotExists('transaction_field_values', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('company_id').notNullable();
    t.string('transaction_type', 100).notNullable(); // bank_check, invoice, etc
    t.uuid('transaction_id').notNullable();
    t.uuid('form_id').nullable().references('id').inTable('custom_forms').onDelete('SET NULL');
    t.uuid('field_id').nullable().references('id').inTable('custom_form_fields').onDelete('CASCADE');
    t.string('field_key', 100).notNullable();        // field_id string for lookups
    t.text('value').nullable();                       // stored as text
    t.jsonb('value_json').nullable();                 // for complex types
    t.timestamps(true, true);
    t.index(['transaction_type','transaction_id']);
    t.index(['company_id','transaction_type','field_key']);
  });

  // ── form_roles ───────────────────────────────────────────────────────────
  await knex.schema.createTableIfNotExists('custom_form_roles', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('form_id').notNullable().references('id').inTable('custom_forms').onDelete('CASCADE');
    t.string('role_id', 100).notNullable();
    t.string('role_name', 200).nullable();
    t.boolean('can_view').defaultTo(true);
    t.boolean('can_create').defaultTo(false);
    t.boolean('can_edit').defaultTo(false);
    t.boolean('can_delete').defaultTo(false);
  });

  // ── form_history ─────────────────────────────────────────────────────────
  await knex.schema.createTableIfNotExists('custom_form_history', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('form_id').notNullable().references('id').inTable('custom_forms').onDelete('CASCADE');
    t.string('action', 50).notNullable();
    t.text('description').nullable();
    t.jsonb('snapshot').nullable();   // full form snapshot at this point
    t.uuid('performed_by').nullable();
    t.string('performed_by_name', 200).nullable();
    t.timestamp('performed_at').defaultTo(knex.fn.now());
  });

  // indexes
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_cffields_form ON custom_form_fields(form_id)');
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_tfv_txn ON transaction_field_values(transaction_type, transaction_id)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('custom_form_history');
  await knex.schema.dropTableIfExists('custom_form_roles');
  await knex.schema.dropTableIfExists('transaction_field_values');
  await knex.schema.dropTableIfExists('custom_form_sublist_fields');
  await knex.schema.dropTableIfExists('custom_form_sublists');
  await knex.schema.dropTableIfExists('custom_form_fields');
  await knex.schema.dropTableIfExists('custom_form_field_groups');
  await knex.schema.dropTableIfExists('custom_form_tabs');
  await knex.schema.dropTableIfExists('custom_forms');
}
