import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasManual = await knex.schema.hasColumn('bank_checks', 'check_number_manual');
  if (!hasManual) {
    await knex.schema.alterTable('bank_checks', t => {
      t.string('check_number_manual', 100).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('bank_checks', t => {
    t.dropColumn('check_number_manual');
  });
}
