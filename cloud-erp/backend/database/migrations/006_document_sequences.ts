import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('document_sequences'))) {
    await knex.schema.createTable('document_sequences', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      t.string('prefix', 10).notNullable();   // e.g. 'CH', 'SO', 'PO'
      t.integer('year').notNullable();         // e.g. 2026
      t.integer('last_number').notNullable().defaultTo(0);
      t.unique(['company_id', 'prefix', 'year']);
      t.timestamps(true, true);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('document_sequences');
}
