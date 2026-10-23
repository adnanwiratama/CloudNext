import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('transaction_audit_log'))) {
    await knex.schema.createTable('transaction_audit_log', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable();
      t.string('source_type', 50).notNullable();   // 'bank_check', 'invoice', etc
      t.uuid('source_id').notNullable();
      t.string('action', 50).notNullable();        // 'created', 'updated', 'voided'
      t.text('description').nullable();
      t.jsonb('changes').nullable();               // {field, old_value, new_value}
      t.uuid('performed_by').nullable().references('id').inTable('users');
      t.string('performed_by_name', 200).nullable();
      t.string('ip_address', 50).nullable();
      t.timestamp('performed_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_tal_source ON transaction_audit_log(source_type, source_id)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('transaction_audit_log');
}
