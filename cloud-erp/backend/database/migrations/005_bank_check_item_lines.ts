import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTableIfNotExists('bank_check_item_lines', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('check_id').notNullable().references('id').inTable('bank_checks').onDelete('CASCADE');
    t.integer('line_number').notNullable().defaultTo(1);
    t.uuid('item_id').nullable().references('id').inTable('items');
    t.text('description').nullable();
    t.decimal('quantity', 18, 4).defaultTo(1);
    t.string('unit', 50).nullable();
    t.decimal('unit_price', 18, 2).defaultTo(0);
    t.decimal('amount', 18, 2).defaultTo(0);
    t.string('tax_code', 50).nullable();
    t.decimal('tax_rate', 5, 2).defaultTo(0);
    t.decimal('tax_amt', 18, 2).defaultTo(0);
    t.decimal('gross_amt', 18, 2).defaultTo(0);
    t.text('memo').nullable();
    t.string('department', 100).nullable();
    t.uuid('location_id').nullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('bank_check_item_lines');
}
