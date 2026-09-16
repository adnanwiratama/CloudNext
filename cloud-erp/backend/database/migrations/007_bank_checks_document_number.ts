import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn('bank_checks', 'document_number');
  if (!hasCol) {
    await knex.schema.alterTable('bank_checks', t => {
      t.string('document_number', 50).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('bank_checks', t => {
    t.dropColumn('document_number');
  });
}
