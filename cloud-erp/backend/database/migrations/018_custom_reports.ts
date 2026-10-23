import { Knex } from 'knex';

// ─────────────────────────────────────────────────────────────────────────────
// Custom Reports (NetSuite-style "Saved Search").
//
// A saved report definition: the record type to query, the selected columns, the
// filter rows, and a visibility flag. `public` reports are visible to everyone in
// the company; `private` reports only to their creator. Idempotent create so it is
// safe on both fresh and existing databases.
// ─────────────────────────────────────────────────────────────────────────────

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('custom_reports'))) {
    await knex.schema.createTable('custom_reports', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable();
      t.string('name', 300).notNullable();
      t.string('record_type', 100).notNullable();      // e.g. 'sales_orders'
      t.jsonb('columns').notNullable().defaultTo('[]'); // ordered column keys/defs
      t.jsonb('filters').notNullable().defaultTo('[]'); // [{ field, op, value }]
      t.jsonb('sort').notNullable().defaultTo('[]');    // [{ field, desc }]
      t.string('visibility', 20).notNullable().defaultTo('private'); // 'public' | 'private'
      t.text('description').nullable();
      t.uuid('created_by').nullable();
      t.string('created_by_name', 200).nullable();
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
      t.index(['company_id', 'visibility'], 'idx_custom_reports_scope');
      t.index(['company_id', 'created_by'], 'idx_custom_reports_owner');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('custom_reports');
}
