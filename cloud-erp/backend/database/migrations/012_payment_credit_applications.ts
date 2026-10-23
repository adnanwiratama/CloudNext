import { Knex } from 'knex';

// Credits (Vendor Prepayments / unapplied Vendor Payments) applied against a
// Bill Payment. These reduce the bank cash needed for the payment — the opposite
// of a bill application.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('payment_credit_applications'))) {
    await knex.schema.createTable('payment_credit_applications', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable();
      // The Bill Payment that consumes the credit
      t.uuid('payment_id').notNullable().references('id').inTable('vendor_payments').onDelete('CASCADE');
      // What kind of credit: 'vendor_prepayment' | 'vendor_payment'
      t.string('credit_type', 40).notNullable();
      // The id of the prepayment / vendor_payment being consumed
      t.uuid('credit_id').notNullable();
      t.decimal('applied_amount', 20, 4).notNullable();
      t.timestamps(true, true);
      t.index(['payment_id']);
      t.index(['credit_type', 'credit_id']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('payment_credit_applications');
}
