import { Knex } from 'knex';

// ─────────────────────────────────────────────────────────────────────────────
// Approval settings — a default approver ("Approved By") per transaction type.
// One row per (company, record_type). Used to pre-fill the approver on related
// transactions. Idempotent create so it's safe on fresh and existing DBs.
// ─────────────────────────────────────────────────────────────────────────────

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('approval_settings'))) {
    await knex.schema.createTable('approval_settings', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable();
      t.string('record_type', 100).notNullable();   // e.g. 'sales_orders'
      t.uuid('approver_user_id').nullable();         // the default approver (a user)
      t.timestamp('updated_at').defaultTo(knex.fn.now());
      t.unique(['company_id', 'record_type']);
    });
  }

  // Supervisor on users (employee's supervisor — a specific user).
  if (!(await knex.schema.hasColumn('users', 'supervisor_id'))) {
    await knex.schema.alterTable('users', (t) => t.uuid('supervisor_id').nullable());
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('approval_settings');
}
