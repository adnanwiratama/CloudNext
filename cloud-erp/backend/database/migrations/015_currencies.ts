import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── Currencies ────────────────────────────────────────────────────────────
  await knex.schema.createTableIfNotExists('currencies', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('name', 100).notNullable();        // e.g. US Dollar
    t.string('iso_code', 10).notNullable();      // e.g. USD
    t.string('symbol', 10).nullable();           // e.g. $
    t.boolean('is_base').defaultTo(false);       // base currency flag
    t.boolean('is_active').defaultTo(true);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.unique(['company_id', 'iso_code']);
  });

  // ── Currency Exchange Rates (per effective date) ───────────────────────────
  await knex.schema.createTableIfNotExists('currency_exchange_rates', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('base_currency', 10).notNullable();   // ISO code of base
    t.string('source_currency', 10).notNullable(); // ISO code of source/foreign
    t.decimal('rate', 24, 12).notNullable();       // units of base per 1 source
    t.date('effective_date').notNullable();
    t.uuid('created_by').nullable().references('id').inTable('users');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.index(['company_id', 'base_currency', 'source_currency', 'effective_date'], 'idx_fx_lookup');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('currency_exchange_rates');
  await knex.schema.dropTableIfExists('currencies');
}
