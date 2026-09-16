import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('bank_checks', t => {
    t.uuid('department_id').nullable().references('id').inTable('departments').onDelete('SET NULL');
    t.uuid('location_id').nullable().references('id').inTable('locations').onDelete('SET NULL');
    t.uuid('subsidiary_id').nullable().references('id').inTable('subsidiaries').onDelete('SET NULL');
    t.uuid('posting_period_id').nullable().references('id').inTable('accounting_periods').onDelete('SET NULL');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('bank_checks', t => {
    t.dropColumn('department_id');
    t.dropColumn('location_id');
    t.dropColumn('subsidiary_id');
    t.dropColumn('posting_period_id');
  });
}
