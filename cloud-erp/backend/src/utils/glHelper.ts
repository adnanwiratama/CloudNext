import db from '../config/database';

/**
 * Post a balanced journal entry.
 * lines: [{ accountId, debit, credit, memo? }]
 * All debits must equal all credits (enforced here).
 */
export async function postJournal(params: {
  companyId: string;
  sourceType: string;
  sourceId: string;
  entryDate: string | Date;
  memo: string;
  createdBy: string;
  lines: { accountId: string; debit: number; credit: number; memo?: string }[];
}): Promise<string> {
  const { companyId, sourceType, sourceId, entryDate, memo, createdBy, lines } = params;

  const totalDebit  = lines.reduce((s, l) => s + Number(l.debit  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Journal not balanced: debit ${totalDebit} ≠ credit ${totalCredit}`);
  }

  const journalNumber = `JE-${sourceType.toUpperCase().replace(/_/g,'-')}-${String(Date.now()).slice(-8)}`;

  const [je] = await db('journal_entries').insert({
    company_id:  companyId,
    journal_number: journalNumber,
    entry_date:  entryDate,
    memo,
    source_type: sourceType,
    source_id:   sourceId,
    status:      'posted',
    created_by:  createdBy,
  }).returning('id');

  const jeId = je?.id || je;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    await db('journal_entry_lines').insert({
      journal_id:  jeId,
      line_number: i + 1,
      account_id:  line.accountId,
      debit:       Number(line.debit  || 0),
      credit:      Number(line.credit || 0),
      memo:        line.memo || memo,
    });
  }

  return journalNumber;
}

/** Get account ID by code for a company */
export async function getAccountByCode(companyId: string, code: string): Promise<string | null> {
  const acc = await db('accounts').where({ company_id: companyId, code, is_active: true }).first();
  return acc?.id || null;
}

/** Get or create account by code/name/type */
export async function getOrCreateAccount(companyId: string, code: string, name: string, type: string, subtype: string): Promise<string> {
  let acc = await db('accounts').where({ company_id: companyId, code }).first();
  if (!acc) {
    const [newAcc] = await db('accounts').insert({
      company_id: companyId, code, name, type, subtype, is_active: true,
    }).returning('*');
    acc = newAcc;
  }
  return acc.id;
}
