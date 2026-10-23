import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── UOM Types (conversion groups, e.g. Weight, Length) ────────────────────
  if (!(await knex.schema.hasTable('uom_types'))) {
    await knex.schema.createTable('uom_types', t => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable().references('id').inTable('companies');
      t.string('name', 100).notNullable();       // Type Name (e.g. Weight)
      t.text('description').nullable();
      t.boolean('is_active').defaultTo(true);
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  // ── Extend units_of_measure with conversion metadata ──────────────────────
  const cols: Array<[string, (t: Knex.AlterTableBuilder) => void]> = [
    ['uom_type_id', t => t.uuid('uom_type_id').nullable().references('id').inTable('uom_types')],
    ['abbreviation', t => t.string('abbreviation', 30).nullable()],
    ['plural_name', t => t.string('plural_name', 100).nullable()],
    ['plural_abbreviation', t => t.string('plural_abbreviation', 30).nullable()],
    ['conversion_rate_to_base', t => t.decimal('conversion_rate_to_base', 20, 8).defaultTo(1)],
    ['is_base_unit', t => t.boolean('is_base_unit').defaultTo(false)],
  ];
  for (const [col, add] of cols) {
    const has = await knex.schema.hasColumn('units_of_measure', col);
    if (!has) await knex.schema.alterTable('units_of_measure', add);
  }
}

export async function down(knex: Knex): Promise<void> {
  const drop = ['uom_type_id', 'abbreviation', 'plural_name', 'plural_abbreviation', 'conversion_rate_to_base', 'is_base_unit'];
  for (const col of drop) {
    const has = await knex.schema.hasColumn('units_of_measure', col);
    if (has) await knex.schema.alterTable('units_of_measure', t => t.dropColumn(col));
  }
  await knex.schema.dropTableIfExists('uom_types');
}
