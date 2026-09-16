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

  const newNumber = seq.last_number + seq.increment;
  await query('transaction_sequences')
    .where({ company_id: companyId, transaction_type: transactionType })
    .update({ last_number: newNumber });

  const year = seq.include_year ? `-${new Date().getFullYear()}-` : '-';
  const paddedNumber = String(newNumber).padStart(seq.min_digits, '0');
  return `${seq.prefix}${year}${paddedNumber}`;
}
