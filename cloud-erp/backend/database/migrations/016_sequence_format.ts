import { Knex } from 'knex';

// Extend transaction_sequences with the Auto-Generated Number format controls
// shown in the Setup → Auto Generated Number page (suffix, initial number, allow override).
export async function up(knex: Knex): Promise<void> {
  const cols: Array<[string, (t: Knex.AlterTableBuilder) => void]> = [
    ['suffix', t => t.string('suffix', 20).nullable()],
    ['initial_number', t => t.integer('initial_number').defaultTo(1)],
    ['allow_override', t => t.boolean('allow_override').defaultTo(false)],
    ['label', t => t.string('label', 100).nullable()], // friendly display name
  ];
  for (const [col, add] of cols) {
    if (!(await knex.schema.hasColumn('transaction_sequences', col))) {
      await knex.schema.alterTable('transaction_sequences', add);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const col of ['suffix', 'initial_number', 'allow_override', 'label']) {
    if (await knex.schema.hasColumn('transaction_sequences', col)) {
      await knex.schema.alterTable('transaction_sequences', t => t.dropColumn(col));
    }
  }
}
