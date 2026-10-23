import db from '../config/database';

export async function generateTransactionNumber(
  companyId: string,
  transactionType: string,
  trx?: any
): Promise<string> {
  const query = trx ? trx : db;

  const seq = await query('transaction_sequences')
    .where({ company_id: companyId, transaction_type: transactionType })
    .first();

  if (!seq) {
    throw new Error(`No sequence configured for transaction type: ${transactionType}`);
  }

  // Honor the configured Initial Number: the first generated value should be at
  // least `initial_number`. If the counter hasn't reached it yet, jump to it.
  const increment = seq.increment || 1;
  const initial = seq.initial_number != null ? Number(seq.initial_number) : 1;
  const candidate = (seq.last_number || 0) + increment;
  const newNumber = candidate < initial ? initial : candidate;

  await query('transaction_sequences')
    .where({ company_id: companyId, transaction_type: transactionType })
    .update({ last_number: newNumber });

  const year = seq.include_year ? `-${new Date().getFullYear()}-` : '';
  const paddedNumber = String(newNumber).padStart(seq.min_digits || 1, '0');
  const suffix = seq.suffix || '';
  return `${seq.prefix || ''}${year}${paddedNumber}${suffix}`;
}

/**
 * Resolve the number to use for a transaction, honoring the Auto-Generated Number
 * setup (transaction_sequences):
 *  - If the sequence allows override AND a non-empty manual number is supplied,
 *    use the manual number as-is (counter is NOT advanced).
 *  - Otherwise auto-generate via generateTransactionNumber (counter advances).
 * Falls back to auto-generate if the type has no sequence row.
 */
export async function resolveTransactionNumber(
  companyId: string,
  transactionType: string,
  manualNumber: string | null | undefined,
  trx?: any
): Promise<string> {
  const query = trx ? trx : db;
  const seq = await query('transaction_sequences')
    .where({ company_id: companyId, transaction_type: transactionType })
    .first();
  const manual = (manualNumber ?? '').toString().trim();
  if (seq && seq.allow_override && manual) return manual;
  return generateTransactionNumber(companyId, transactionType, trx);
}

/** Preview the next number for a type WITHOUT advancing the counter. */
export async function peekTransactionNumber(
  companyId: string,
  transactionType: string,
  trx?: any
): Promise<string | null> {
  const query = trx ? trx : db;
  const seq = await query('transaction_sequences')
    .where({ company_id: companyId, transaction_type: transactionType })
    .first();
  if (!seq) return null;
  const increment = seq.increment || 1;
  const initial = seq.initial_number != null ? Number(seq.initial_number) : 1;
  const candidate = (seq.last_number || 0) + increment;
  const next = candidate < initial ? initial : candidate;
  const year = seq.include_year ? `-${new Date().getFullYear()}-` : '';
  const padded = String(next).padStart(seq.min_digits || 1, '0');
  return `${seq.prefix || ''}${year}${padded}${seq.suffix || ''}`;
}
