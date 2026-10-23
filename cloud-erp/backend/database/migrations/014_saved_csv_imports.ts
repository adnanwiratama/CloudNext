import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── Saved CSV Import configurations ───────────────────────────────────────
  // Stores a reusable import setup (record type, mode, delimiter, field mapping)
  // and optionally the CSV data itself so it can be re-run from "Saved CSV Import".
  await knex.schema.createTableIfNotExists('saved_csv_imports', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('name', 200).notNullable();                 // user-given label
    t.string('record_type', 100).notNullable();          // import type value (e.g. invoices)
    t.string('mode', 20).notNullable().defaultTo('add');  // add / update / addupdate
    t.string('delimiter', 20).notNullable().defaultTo('comma');
    t.string('file_name', 300).nullable();               // original uploaded file name
    t.jsonb('mapping').notNullable().defaultTo('{}');     // { fieldKey: csvColumn }
    t.jsonb('headers').notNullable().defaultTo('[]');     // detected CSV columns
    t.jsonb('rows').notNullable().defaultTo('[]');        // parsed CSV rows (reusable data)
    t.integer('row_count').notNullable().defaultTo(0);
    t.timestamp('last_run_at').nullable();
    t.uuid('created_by').nullable().references('id').inTable('users');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('saved_csv_imports');
}
