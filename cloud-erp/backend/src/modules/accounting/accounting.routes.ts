import { Router, Request, Response } from 'express';
import db from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { enforcePermissions } from '../../middleware/permissions';
import { getPaginationParams, buildPaginatedResult } from '../../utils/pagination';
import { generateTransactionNumber } from '../../utils/sequence';
import { AccountingEngine } from '../../engines/accounting/accountingEngine';
import { createAuditLog } from '../../utils/audit';

const router = Router();
router.use(authenticate);
router.use(enforcePermissions);

// ─────────────────────────────────────────────────────────────────────────────
// Account Type taxonomy (NetSuite style). `account_type` holds the detailed type
// shown/selected in the UI; the high-level `type` column (used by all financial
// reports) is derived from it so existing reports keep working unchanged.
// ─────────────────────────────────────────────────────────────────────────────
export const ACCOUNT_TYPES: { value: string; label: string; category: string }[] = [
  { value: 'bank',                 label: 'Bank',                    category: 'asset' },
  { value: 'accounts_receivable',  label: 'Accounts Receivable',     category: 'asset' },
  { value: 'other_current_asset',  label: 'Other Current Asset',     category: 'asset' },
  { value: 'inventory',            label: 'Inventory',               category: 'asset' },
  { value: 'fixed_asset',          label: 'Fixed Asset',             category: 'asset' },
  { value: 'other_asset',          label: 'Other Asset',             category: 'asset' },
  { value: 'accounts_payable',     label: 'Accounts Payable',        category: 'liability' },
  { value: 'credit_card',          label: 'Credit Card',             category: 'liability' },
  { value: 'other_current_liability', label: 'Other Current Liability', category: 'liability' },
  { value: 'long_term_liability',  label: 'Long Term Liability',     category: 'liability' },
  { value: 'deferred_revenue',     label: 'Deferred Revenue',        category: 'liability' },
  { value: 'equity',               label: 'Equity',                  category: 'equity' },
  { value: 'income',               label: 'Income',                  category: 'income' },
  { value: 'other_income',         label: 'Other Income',            category: 'income' },
  { value: 'cost_of_goods_sold',   label: 'Cost of Goods Sold',      category: 'cost_of_goods' },
  { value: 'expense',              label: 'Expense',                 category: 'expense' },
  { value: 'other_expense',        label: 'Other Expense',           category: 'expense' },
  { value: 'deferred_expense',     label: 'Deferred Expense',        category: 'asset' },
  { value: 'unbilled_receivable',  label: 'Unbilled Receivable',     category: 'asset' },
  { value: 'non_posting',          label: 'Non Posting',             category: 'other' },
];
const ACCOUNT_TYPE_CATEGORY: Record<string, string> = Object.fromEntries(ACCOUNT_TYPES.map(t => [t.value, t.category]));

// Map an old high-level `type` to a reasonable detailed `account_type` for backfill.
function defaultAccountType(type: string, isBank?: boolean): string {
  if (isBank || type === 'bank' || type === 'cash') return 'bank';
  switch (type) {
    case 'asset':         return 'other_current_asset';
    case 'liability':     return 'other_current_liability';
    case 'equity':        return 'equity';
    case 'income':
    case 'revenue':       return 'income';
    case 'cost_of_goods':
    case 'cogs':          return 'cost_of_goods_sold';
    case 'expense':       return 'expense';
    case 'other_income':  return 'other_income';
    case 'other_expense': return 'other_expense';
    default:              return 'other_current_asset';
  }
}

// Ensure accounts has account_type + is_summary; backfill account_type from type.
let _acctColsEnsured = false;
async function ensureAccountColumns(): Promise<void> {
  if (_acctColsEnsured) return;
  if (!(await db.schema.hasColumn('accounts', 'account_type'))) {
    await db.schema.alterTable('accounts', (t: any) => t.string('account_type', 50).nullable());
  }
  if (!(await db.schema.hasColumn('accounts', 'is_summary'))) {
    await db.schema.alterTable('accounts', (t: any) => t.boolean('is_summary').defaultTo(false));
  }
  // Backfill detailed account_type for any rows that don't have it yet.
  const missing = await db('accounts').whereNull('account_type').select('id', 'type', 'is_bank');
  for (const a of missing as any[]) {
    await db('accounts').where({ id: a.id }).update({ account_type: defaultAccountType(a.type, a.is_bank) });
  }
  // Backfill description = account name where description is empty/null.
  await db('accounts')
    .where((qb: any) => qb.whereNull('description').orWhere('description', ''))
    .update({ description: db.ref('name') });
  _acctColsEnsured = true;
}

// Expose the Account Type taxonomy to the UI dropdown.
router.get('/account-types', async (_req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: ACCOUNT_TYPES });
});

// ===== CHART OF ACCOUNTS =====
router.get('/accounts', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureAccountColumns();
    const companyId = req.user!.companyId;
    let query = db('accounts').where({ company_id: companyId }).orderBy('code');
    // By default only active accounts; ?showInactive=1 includes inactive ones.
    if (!['1', 'true'].includes(String(req.query.showInactive))) query = query.where({ is_active: true });
    if (req.query.accountType) query = query.where({ account_type: req.query.accountType });
    else if (req.query.type) query = query.where({ type: req.query.type });
    if (req.query.search) query = query.where((qb: any) => qb.whereILike('name', `%${req.query.search}%`).orWhereILike('code', `%${req.query.search}%`));
    const accounts = await query;

    // Calculate net balance per account from posted journal entries
    const balances = await db('journal_entry_lines as jel')
      .join('journal_entries as je', 'jel.journal_id', 'je.id')
      .where({ 'je.company_id': companyId, 'je.status': 'posted' })
      .groupBy('jel.account_id')
      .select(
        'jel.account_id',
        // Fall back to debit/credit when *_base is 0/null (system-posted lines often omit base amounts).
        db.raw('COALESCE(SUM(COALESCE(NULLIF(jel.debit_base,0), jel.debit)), 0) as total_debit'),
        db.raw('COALESCE(SUM(COALESCE(NULLIF(jel.credit_base,0), jel.credit)), 0) as total_credit'),
        db.raw('COALESCE(SUM(COALESCE(NULLIF(jel.debit_base,0), jel.debit)), 0) - COALESCE(SUM(COALESCE(NULLIF(jel.credit_base,0), jel.credit)), 0) as net_balance')
      );

    const balanceMap: Record<string, any> = {};
    for (const b of balances) balanceMap[b.account_id] = b;

    const labelMap: Record<string, string> = Object.fromEntries(ACCOUNT_TYPES.map(t => [t.value, t.label]));
    const data = accounts.map((acct: any) => {
      const bal = balanceMap[acct.id];
      return {
        ...acct,
        account_type: acct.account_type || defaultAccountType(acct.type, acct.is_bank),
        account_type_label: labelMap[acct.account_type || defaultAccountType(acct.type, acct.is_bank)] || acct.type,
        total_debit: bal ? parseFloat(bal.total_debit) : 0,
        total_credit: bal ? parseFloat(bal.total_credit) : 0,
        net_balance: bal ? parseFloat(bal.net_balance) : 0,
      };
    });

    res.json({ success: true, data });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to fetch accounts' }); }
});

// GET single account balance
router.get('/accounts/:id/balance', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const companyId = req.user!.companyId;
    const acct = await db('accounts').where({ id, company_id: companyId }).first();
    if (!acct) { res.status(404).json({ success: false, error: 'Account not found' }); return; }

    const [bal] = await db('journal_entry_lines as jel')
      .join('journal_entries as je', 'jel.journal_id', 'je.id')
      .where({ 'je.company_id': companyId, 'je.status': 'posted', 'jel.account_id': id })
      .select(
        db.raw('COALESCE(SUM(COALESCE(NULLIF(jel.debit_base,0), jel.debit)), 0) as total_debit'),
        db.raw('COALESCE(SUM(COALESCE(NULLIF(jel.credit_base,0), jel.credit)), 0) as total_credit'),
        db.raw('COALESCE(SUM(COALESCE(NULLIF(jel.debit_base,0), jel.debit)) - SUM(COALESCE(NULLIF(jel.credit_base,0), jel.credit)), 0) as net_balance')
      );

    // For asset accounts (bank), balance = debit - credit
    // For liability, balance = credit - debit
    const netBalance = bal ? parseFloat(bal.net_balance) : 0;
    const balance = ['asset', 'bank'].includes(acct.type) ? netBalance : -netBalance;

    res.json({ success: true, data: { account: acct, balance, total_debit: bal ? parseFloat(bal.total_debit) : 0, total_credit: bal ? parseFloat(bal.total_credit) : 0 } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch balance' }); }
});

// GET single account (for the edit form).
router.get('/accounts/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureAccountColumns();
    const acct = await db('accounts').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!acct) { res.status(404).json({ success: false, error: 'Account not found' }); return; }
    acct.account_type = acct.account_type || defaultAccountType(acct.type, acct.is_bank);
    res.json({ success: true, data: acct });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch account' }); }
});

router.post('/accounts', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureAccountColumns();
    const d = req.body;
    const accountType = d.accountType || d.account_type || 'other_current_asset';
    const category = ACCOUNT_TYPE_CATEGORY[accountType] || 'asset';
    const [acct] = await db('accounts').insert({
      company_id: req.user!.companyId, code: d.code, name: d.name,
      type: category, account_type: accountType,
      subtype: d.subtype, parent_id: d.parentId || null, currency: d.currency || 'IDR',
      is_summary: d.isSummary || false, is_bank: accountType === 'bank',
      bank_name: d.bankName || null, bank_account_number: d.bankAccountNumber || null,
      description: (d.description && d.description.trim()) ? d.description : d.name,
      is_active: d.isInactive ? false : true,
    }).returning('*');
    res.status(201).json({ success: true, data: acct });
  } catch (e: any) {
    if (e.code === '23505') res.status(409).json({ success: false, error: `Account code ${req.body.code} already exists.` });
    else { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to create account' }); }
  }
});

// Update an account. Changing account_type re-derives the high-level `type`.
router.put('/accounts/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureAccountColumns();
    const companyId = req.user!.companyId;
    const existing = await db('accounts').where({ id: req.params.id, company_id: companyId }).first();
    if (!existing) { res.status(404).json({ success: false, error: 'Account not found' }); return; }
    const d = req.body;
    const update: any = {};
    if (d.code !== undefined) update.code = d.code;
    if (d.name !== undefined) update.name = d.name;
    if (d.accountType || d.account_type) {
      const accountType = d.accountType || d.account_type;
      update.account_type = accountType;
      update.type = ACCOUNT_TYPE_CATEGORY[accountType] || existing.type;
      update.is_bank = accountType === 'bank';
    }
    if (d.subtype !== undefined) update.subtype = d.subtype;
    if (d.parentId !== undefined) update.parent_id = d.parentId || null;
    if (d.description !== undefined) {
      // Default description to the account name when left blank.
      const desc = (d.description && String(d.description).trim()) ? d.description : (d.name ?? existing.name);
      update.description = desc;
    }
    if (d.isSummary !== undefined) update.is_summary = d.isSummary;
    if (d.isInactive !== undefined) update.is_active = !d.isInactive;
    if (d.bankName !== undefined) update.bank_name = d.bankName || null;
    if (d.bankAccountNumber !== undefined) update.bank_account_number = d.bankAccountNumber || null;
    update.updated_at = new Date();
    const [acct] = await db('accounts').where({ id: req.params.id, company_id: companyId }).update(update).returning('*');
    res.json({ success: true, data: acct });
  } catch (e: any) {
    if (e.code === '23505') res.status(409).json({ success: false, error: `Account code ${req.body.code} already exists.` });
    else { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to update account' }); }
  }
});

// ===== JOURNAL ENTRIES =====
router.get('/journals', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    let query = db('journal_entries as je').leftJoin('users as u', 'je.created_by', 'u.id')
      .where({ 'je.company_id': companyId, 'je.is_deleted': false })
      .select('je.*', 'u.name as created_by_name');
    if (search) query = query.where((qb: any) => qb.whereILike('je.journal_number', `%${search}%`).orWhereILike('je.memo', `%${search}%`));
    if (req.query.status) query = query.where({ 'je.status': req.query.status });
    if (req.query.dateFrom) query = query.where('je.entry_date', '>=', req.query.dateFrom as string);
    if (req.query.dateTo) query = query.where('je.entry_date', '<=', req.query.dateTo as string);
    const total = parseInt((await query.clone().clearSelect().count('* as count').first() as any)?.count || '0');
    const data = await query.orderBy('je.entry_date', 'desc').limit(limit!).offset(((page || 1) - 1) * (limit || 25));

    // Sum debit/credit from the journal lines for this page (header total_debit/total_credit
    // is often 0 for system-generated entries, so derive the real totals from the lines).
    const ids = (data as any[]).map(je => je.id);
    const sums: Record<string, { debit: number; credit: number }> = {};
    if (ids.length > 0) {
      const rows = await db('journal_entry_lines')
        .whereIn('journal_id', ids)
        .groupBy('journal_id')
        .select('journal_id')
        .sum({ debit: 'debit' })
        .sum({ credit: 'credit' });
      for (const r of rows as any[]) sums[r.journal_id] = { debit: Number(r.debit || 0), credit: Number(r.credit || 0) };
    }

    // Classify type: entries created from a source document (GL Impact / system-generated) are 'system';
    // entries created manually via New Journal Entry are 'manual'.
    const classified = (data as any[]).map(je => {
      const s = sums[je.id];
      const lineDebit = s ? s.debit : 0;
      const lineCredit = s ? s.credit : 0;
      return {
        ...je,
        type: (je.source_type && String(je.source_type).trim() !== '') ? 'system' : 'manual',
        total_debit: lineDebit > 0 ? lineDebit : Number(je.total_debit || 0),
        total_credit: lineCredit > 0 ? lineCredit : Number(je.total_credit || 0),
      };
    });
    res.json({ success: true, ...buildPaginatedResult(classified, total, page, limit) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch journals' }); }
});

router.get('/journals/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const je = await db('journal_entries').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!je) { res.status(404).json({ success: false, error: 'Journal entry not found' }); return; }
    const lines = await db('journal_entry_lines as jel').join('accounts as a', 'jel.account_id', 'a.id')
      .leftJoin('customers as c', 'jel.entity_customer_id', 'c.id')
      .leftJoin('vendors as v', 'jel.entity_vendor_id', 'v.id')
      .where({ 'jel.journal_id': je.id }).orderBy('jel.line_number')
      .select('jel.*', 'a.code as account_code', 'a.name as account_name', 'a.type as account_type', 'c.name as customer_name', 'v.name as vendor_name');

    // Resolve source number + route from source_type and source_id
    let sourceNumber = null;
    let sourceRoute  = null;
    if (je.source_type && je.source_id) {
      const typeToTable: Record<string, { table: string; numCol: string; route: string }> = {
        'bank_check'        : { table: 'bank_checks',           numCol: 'check_number',      route: `/bank/checks/${je.source_id}` },
        'bank_deposit'      : { table: 'bank_deposits',         numCol: 'deposit_number',    route: '/bank/deposits-list' },
        'bank_transfer'     : { table: 'bank_transfers',        numCol: 'transfer_number',   route: '/bank/transfers-list' },
        'invoice'           : { table: 'invoices',              numCol: 'invoice_number',    route: `/sales/invoices/${je.source_id}` },
        'sales_order'       : { table: 'sales_orders',          numCol: 'order_number',      route: `/sales/orders/${je.source_id}` },
        'purchase_order'    : { table: 'purchase_orders',       numCol: 'po_number',         route: `/purchasing/orders/${je.source_id}` },
        'vendor_bill'       : { table: 'vendor_bills',          numCol: 'bill_number',       route: `/purchasing/bills/${je.source_id}` },
        'bill_payment'      : { table: 'bill_payments',         numCol: 'payment_number',    route: `/purchasing/payments/${je.source_id}` },
        'customer_payment'  : { table: 'customer_payments',     numCol: 'payment_number',    route: `/sales/payments/${je.source_id}` },
        'goods_receipt'     : { table: 'goods_receipts',        numCol: 'receipt_number',    route: `/purchasing/receipts/${je.source_id}` },
        'item_fulfillment'  : { table: 'item_fulfillments',     numCol: 'fulfillment_number',route: `/sales/fulfillments/${je.source_id}` },
        'vendor_credit'     : { table: 'vendor_credits',        numCol: 'credit_number',     route: '/purchasing/vendor-credits' },
        'customer_deposit'  : { table: 'customer_deposits',     numCol: 'deposit_number',    route: '/sales/deposits' },
        'credit_memo'       : { table: 'credit_memos',          numCol: 'memo_number',       route: '/sales/credit-memos' },
        'inventory_adjustment': { table: 'inventory_adjustments', numCol: 'adjustment_number', route: '/inventory/adjustments' },
      };
      const mapping = typeToTable[je.source_type];
      if (mapping) {
        const src = await db(mapping.table).where({ id: je.source_id }).select(mapping.numCol).first().catch(() => null);
        if (src) {
          sourceNumber = src[mapping.numCol];
          sourceRoute  = mapping.route;
        }
      }
    }

    const jeType = (je.source_type && String(je.source_type).trim() !== '') ? 'system' : 'manual';
    res.json({ success: true, data: { ...je, type: jeType, lines, source_number: sourceNumber, source_route: sourceRoute } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch journal entry' }); }
});

router.post('/journals', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    if (!d.lines || d.lines.length === 0) {
      res.status(400).json({ success: false, error: 'Journal entry requires at least one line' }); return;
    }
    await db.transaction(async (trx) => {
      const je = await AccountingEngine.createJournalEntry({
        companyId, subsidiaryId: d.subsidiaryId, date: d.entryDate,
        currency: d.currency || 'IDR', exchangeRate: d.exchangeRate || 1,
        type: 'manual', memo: d.memo,
        lines: d.lines.map((l: any) => ({
          accountId: l.accountId, debit: l.debit || 0, credit: l.credit || 0,
          entityCustomerId: l.entityCustomerId, entityVendorId: l.entityVendorId,
          departmentId: l.departmentId, locationId: l.locationId, memo: l.memo,
        })),
        createdBy: req.user!.id, trx,
      });
      res.status(201).json({ success: true, data: je });
    });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message || 'Failed to create journal entry' });
  }
});

// ===== ACCOUNTING PERIODS =====
router.get('/periods', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('accounting_periods').where({ company_id: req.user!.companyId }).orderBy('start_date');
    res.json({ success: true, data });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch periods' }); }
});

router.post('/periods/:id/close', async (req: Request, res: Response): Promise<void> => {
  try {
    const period = await db('accounting_periods').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!period) { res.status(404).json({ success: false, error: 'Period not found' }); return; }
    if (period.status === 'closed') { res.status(400).json({ success: false, error: 'Period is already closed' }); return; }
    const [updated] = await db('accounting_periods').where({ id: req.params.id })
      .update({ status: 'closed', closed_by: req.user!.id, closed_at: new Date() }).returning('*');
    await createAuditLog({ companyId: req.user!.companyId, userId: req.user!.id, action: 'close', entityType: 'accounting_period', entityId: req.params.id, entityNumber: period.name });
    res.json({ success: true, data: updated, message: `Period ${period.name} closed` });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to close period' }); }
});

router.post('/periods/:id/reopen', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user!.isAdmin) { res.status(403).json({ success: false, error: 'Only administrators can reopen periods' }); return; }
    const [updated] = await db('accounting_periods').where({ id: req.params.id }).update({ status: 'open', closed_by: null, closed_at: null }).returning('*');
    res.json({ success: true, data: updated, message: 'Period reopened' });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to reopen period' }); }
});

// ===== FINANCIAL REPORTS =====
// Trial Balance
router.get('/reports/trial-balance', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const dateFrom = req.query.dateFrom as string || '2026-01-01';
    const dateTo = req.query.dateTo as string || new Date().toISOString().split('T')[0];
    const dim = (['subsidiary', 'department', 'location', 'period', 'quarter', 'year'].includes(String(req.query.column))
      ? req.query.column : 'none') as DimKey;

    const result = await db('journal_entry_lines as jel')
      .join('journal_entries as je', 'jel.journal_id', 'je.id')
      .join('accounts as a', 'jel.account_id', 'a.id')
      .where({ 'je.company_id': companyId, 'je.status': 'posted' })
      .where('je.entry_date', '>=', dateFrom)
      .where('je.entry_date', '<=', dateTo)
      .groupBy('a.id', 'a.code', 'a.name', 'a.type', 'a.subtype', 'a.parent_id')
      .orderBy('a.code')
      .select(
        'a.id', 'a.code', 'a.name', 'a.type', 'a.subtype', 'a.parent_id',
        // Fall back to debit/credit when *_base is 0/null (system-posted lines often omit base amounts).
        db.raw('COALESCE(SUM(COALESCE(NULLIF(jel.debit_base,0), jel.debit)), 0) as total_debit'),
        db.raw('COALESCE(SUM(COALESCE(NULLIF(jel.credit_base,0), jel.credit)), 0) as total_credit'),
        db.raw('COALESCE(SUM(COALESCE(NULLIF(jel.debit_base,0), jel.debit)), 0) - COALESCE(SUM(COALESCE(NULLIF(jel.credit_base,0), jel.credit)), 0) as net_balance')
      );

    const totalDebit = result.reduce((s: number, r: any) => s + parseFloat(r.total_debit), 0);
    const totalCredit = result.reduce((s: number, r: any) => s + parseFloat(r.total_credit), 0);

    // Column pivot: spread each account's NET balance (debit - credit) across the
    // chosen dimension. `by` is keyed by column id. Default (none) → by.total only.
    const tbPivot = await pivotByAccount({ companyId, types: ['asset', 'liability', 'equity', 'income', 'revenue', 'other_income', 'expense', 'cost_of_goods', 'cogs', 'other_expense'], dim, sign: 'debit', dateFrom, dateTo });
    const byAcct: Record<string, Record<string, number>> = {};
    for (const r of tbPivot.rows as any[]) byAcct[r.id] = r.by;
    // Attach `by` map to each trial-balance line.
    const lines = (result as any[]).map((r: any) => ({ ...r, by: byAcct[r.id] || {} }));

    // Build column list. Time dims discover their columns from the data.
    let columns = await resolveColumns(companyId, dim);
    const isTime = ['period', 'quarter', 'year'].includes(dim);
    if (isTime) columns = [...tbPivot.timeColumns].sort().map(k => ({ id: k, label: k }));

    // Full chart so the UI can build the parent→child account hierarchy.
    const chart = await db('accounts').where({ company_id: companyId }).select('id', 'code', 'name', 'parent_id', 'type');

    res.json({ success: true, data: { lines, chart, totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.01, dateFrom, dateTo, column: dim, columns } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to generate trial balance' }); }
});

// P&L Report
// ─────────────────────────────────────────────────────────────────────────────
// Financial-report COLUMN dimension pivot.
// A report can be split into columns by a dimension (Department/Location/
// Subsidiary) or by a time bucket (Period=month / Quarter / Year). Journal lines
// with no value for the chosen dimension fall into an "Unassigned" column.
// ─────────────────────────────────────────────────────────────────────────────
const UNASSIGNED = '__unassigned__';
type DimKey = 'none' | 'subsidiary' | 'department' | 'location' | 'period' | 'quarter' | 'year';

// Raw SQL expression that yields the dimension key for a journal line.
function dimKeyExpr(dim: DimKey): string | null {
  switch (dim) {
    case 'department':  return 'jel.department_id';
    case 'location':    return 'jel.location_id';
    case 'subsidiary':  return 'je.subsidiary_id';
    case 'period':      return `TO_CHAR(je.entry_date, 'YYYY-MM')`;
    case 'quarter':     return `TO_CHAR(je.entry_date, 'YYYY') || '-Q' || TO_CHAR(je.entry_date, 'Q')`;
    case 'year':        return `TO_CHAR(je.entry_date, 'YYYY')`;
    default:            return null;
  }
}

// Resolve the ordered list of columns for a dimension: { id, label }.
// For entity dimensions we include ALL active rows (so empty columns still show,
// matching the NetSuite layout) plus an Unassigned column.
async function resolveColumns(companyId: string, dim: DimKey): Promise<{ id: string; label: string }[]> {
  if (dim === 'none') return [{ id: 'total', label: 'Total' }];
  let cols: { id: string; label: string }[] = [];
  if (dim === 'department') {
    const rows = await db('departments').where({ company_id: companyId, is_active: true }).orderBy('name').select('id', 'name');
    cols = rows.map((r: any) => ({ id: r.id, label: r.name }));
  } else if (dim === 'location') {
    const rows = await db('locations').where({ company_id: companyId, is_active: true }).orderBy('name').select('id', 'name');
    cols = rows.map((r: any) => ({ id: r.id, label: r.name }));
  } else if (dim === 'subsidiary') {
    const rows = await db('subsidiaries').where({ company_id: companyId }).orderBy('name').select('id', 'name');
    cols = rows.map((r: any) => ({ id: r.id, label: r.name }));
  }
  // Time buckets: columns are discovered from the data (added later), so start empty.
  const isTime = ['period', 'quarter', 'year'].includes(dim);
  if (!isTime) cols.push({ id: UNASSIGNED, label: dim === 'department' ? '- No Department -' : dim === 'location' ? '- No Location -' : '- Unassigned -' });
  return cols;
}

// Run the account-vs-dimension aggregation. Returns postings grouped by account,
// each with a `by` map { columnId: amount } and a `amount` total. `sign` flips
// debit/credit (revenue uses credit-debit, expense/asset uses debit-credit).
async function pivotByAccount(opts: {
  companyId: string; types: string[]; dim: DimKey; sign: 'credit' | 'debit';
  dateFrom?: string; dateTo?: string; dateTo2?: string;
}): Promise<{ rows: any[]; timeColumns: Set<string> }> {
  const { companyId, types, dim, sign, dateFrom, dateTo } = opts;
  const amountExpr = sign === 'credit'
    ? 'COALESCE(SUM(COALESCE(NULLIF(jel.credit_base,0), jel.credit)), 0) - COALESCE(SUM(COALESCE(NULLIF(jel.debit_base,0), jel.debit)), 0)'
    : 'COALESCE(SUM(COALESCE(NULLIF(jel.debit_base,0), jel.debit)), 0) - COALESCE(SUM(COALESCE(NULLIF(jel.credit_base,0), jel.credit)), 0)';

  const q = db('journal_entry_lines as jel')
    .join('journal_entries as je', 'jel.journal_id', 'je.id')
    .join('accounts as a', 'jel.account_id', 'a.id')
    .where({ 'je.company_id': companyId, 'je.status': 'posted' })
    .whereIn('a.type', types);
  if (dateFrom) q.where('je.entry_date', '>=', dateFrom);
  if (dateTo) q.where('je.entry_date', '<=', dateTo);

  const dimExpr = dimKeyExpr(dim);
  const selects: any[] = ['a.id', 'a.code', 'a.name', 'a.type', 'a.subtype', 'a.parent_id', db.raw(`${amountExpr} as amount`)];
  const groupCols: any[] = ['a.id', 'a.code', 'a.name', 'a.type', 'a.subtype', 'a.parent_id'];
  if (dimExpr) {
    selects.push(db.raw(`${dimExpr} as dim_key`));
    groupCols.push(db.raw(dimExpr));
  }
  q.groupBy(groupCols).orderBy('a.code').select(selects);
  const raw = await q;

  // Collapse to one row per account, with per-column amounts.
  const byAccount: Record<string, any> = {};
  const timeColumns = new Set<string>();
  const isTime = ['period', 'quarter', 'year'].includes(dim);
  for (const r of raw) {
    const amt = parseFloat(r.amount) || 0;
    if (!byAccount[r.id]) byAccount[r.id] = { id: r.id, code: r.code, name: r.name, type: r.type, subtype: r.subtype, parent_id: r.parent_id, amount: 0, by: {} };
    const acc = byAccount[r.id];
    acc.amount += amt;
    if (dim === 'none') { acc.by.total = (acc.by.total || 0) + amt; }
    else {
      const key = r.dim_key == null || r.dim_key === '' ? (isTime ? null : UNASSIGNED) : String(r.dim_key);
      if (key == null) { /* time with no date shouldn't happen */ continue; }
      acc.by[key] = (acc.by[key] || 0) + amt;
      if (isTime) timeColumns.add(key);
    }
  }
  return { rows: Object.values(byAccount), timeColumns };
}

router.get('/reports/profit-loss', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const dateFrom = req.query.dateFrom as string || '2026-01-01';
    const dateTo = req.query.dateTo as string || new Date().toISOString().split('T')[0];
    const dim = (['subsidiary', 'department', 'location', 'period', 'quarter', 'year'].includes(String(req.query.column))
      ? req.query.column : 'none') as DimKey;

    // Support both naming conventions: 'income'/'revenue' and 'cogs'/'cost_of_goods'.
    const incomeTypes = ['revenue', 'income', 'other_income'];
    const expenseTypes = ['cogs', 'cost_of_goods', 'expense', 'other_expense'];

    const rev = await pivotByAccount({ companyId, types: incomeTypes, dim, sign: 'credit', dateFrom, dateTo });
    const exp = await pivotByAccount({ companyId, types: expenseTypes, dim, sign: 'debit', dateFrom, dateTo });
    const revenue = rev.rows;
    const expenses = exp.rows;

    // Build the column list. For time dimensions, discover columns from the data.
    let columns = await resolveColumns(companyId, dim);
    const isTime = ['period', 'quarter', 'year'].includes(dim);
    if (isTime) {
      const keys = new Set<string>([...rev.timeColumns, ...exp.timeColumns]);
      columns = [...keys].sort().map(k => ({ id: k, label: k }));
    }

    const totalRevenue = revenue.reduce((s: number, r: any) => s + parseFloat(r.amount), 0);
    const totalCOGS = expenses.filter((e: any) => ['cogs', 'cost_of_goods'].includes(e.type)).reduce((s: number, r: any) => s + parseFloat(r.amount), 0);
    const totalExpenses = expenses.filter((e: any) => ['expense', 'other_expense'].includes(e.type)).reduce((s: number, r: any) => s + parseFloat(r.amount), 0);
    const grossProfit = totalRevenue - totalCOGS;
    const netIncome = grossProfit - totalExpenses;

    // Full chart so the UI can build the parent→child account hierarchy (parent
    // accounts carry no postings, so they aren't in the revenue/expense arrays).
    const chart = await db('accounts').where({ company_id: companyId })
      .select('id', 'code', 'name', 'parent_id', 'type');

    res.json({
      success: true,
      data: {
        revenue, expenses, totalRevenue, totalCOGS, totalExpenses,
        grossProfit, grossMarginPercent: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
        netIncome, dateFrom, dateTo, chart, column: dim, columns,
      },
    });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to generate P&L' }); }
});

// Balance Sheet
router.get('/reports/balance-sheet', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const asOfDate = req.query.asOfDate as string || new Date().toISOString().split('T')[0];
    const dim = (['subsidiary', 'department', 'location', 'period', 'quarter', 'year'].includes(String(req.query.column))
      ? req.query.column : 'none') as DimKey;

    // All balance-sheet accounts use the debit-credit convention for `balance`.
    const bs = await pivotByAccount({ companyId, types: ['asset', 'liability', 'equity'], dim, sign: 'debit', dateTo: asOfDate });
    // Expose `balance` alias alongside `amount` (BS UI reads `balance`).
    const balances = bs.rows.map((r: any) => ({ ...r, balance: r.amount }));

    const assets = balances.filter((b: any) => b.type === 'asset');
    const liabilities = balances.filter((b: any) => b.type === 'liability');
    const equity = balances.filter((b: any) => b.type === 'equity');

    const totalAssets = assets.reduce((s: number, a: any) => s + parseFloat(a.balance), 0);
    const totalLiabilities = liabilities.reduce((s: number, l: any) => s + Math.abs(parseFloat(l.balance)), 0);
    let totalEquity = equity.reduce((s: number, e: any) => s + Math.abs(parseFloat(e.balance)), 0);

    // Retained earnings: current net income (Revenue - Expense) must flow into equity,
    // otherwise Assets != Liabilities + Equity. Compute P&L result up to asOfDate, per column.
    const plPivot = await pivotByAccount({ companyId, types: ['income', 'revenue', 'other_income', 'expense', 'cost_of_goods', 'cogs', 'other_expense'], dim, sign: 'credit', dateTo: asOfDate });
    // Net income per column = sum of (credit-debit) across income-statement accounts.
    const netIncomeBy: Record<string, number> = {};
    let netIncome = 0;
    for (const r of plPivot.rows as any[]) {
      netIncome += parseFloat(r.amount);
      for (const k of Object.keys(r.by)) netIncomeBy[k] = (netIncomeBy[k] || 0) + r.by[k];
    }

    const retainedEarnings = { id: 'retained-earnings', code: '3900', name: 'Retained Earnings (Current Period)', type: 'equity', subtype: 'retained_earnings', balance: netIncome, amount: netIncome, parent_id: null, by: netIncomeBy };
    equity.push(retainedEarnings as any);
    totalEquity += netIncome;

    const totalLiabEquity = totalLiabilities + totalEquity;
    const balanced = Math.abs(totalAssets - totalLiabEquity) < 0.01;

    // Build the column list. For time dimensions, discover columns from the data.
    let columns = await resolveColumns(companyId, dim);
    const isTime = ['period', 'quarter', 'year'].includes(dim);
    if (isTime) {
      const keys = new Set<string>([...bs.timeColumns, ...plPivot.timeColumns]);
      columns = [...keys].sort().map(k => ({ id: k, label: k }));
    }

    // Full chart so the UI can build the parent→child account hierarchy.
    const chart = await db('accounts').where({ company_id: companyId })
      .select('id', 'code', 'name', 'parent_id', 'type');

    res.json({ success: true, data: { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity, totalLiabEquity, netIncome, netIncomeBy, balanced, asOfDate, chart, column: dim, columns } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to generate balance sheet' }); }
});

// AR Aging — returns per-invoice `lines` (detail), per-customer `summary` (the
// Summary matrix: open balance per aging bucket), and grand-total `buckets`.
router.get('/reports/ar-aging', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const asOf = (req.query.asOfDate as string) || new Date().toISOString().split('T')[0];

    const invoices = await db('invoices as i').leftJoin('customers as c', 'i.customer_id', 'c.id')
      .where({ 'i.company_id': companyId, 'i.is_deleted': false })
      .whereNotIn('i.status', ['paid', 'voided'])
      .where('i.amount_due', '>', 0)
      .select('i.invoice_number', 'i.invoice_date', 'i.due_date', 'i.amount_due', 'i.customer_id',
        db.raw('COALESCE(c.name, \'- No Customer/Project -\') as customer_name'),
        db.raw(`DATE '${asOf}' - i.due_date as days_overdue`));

    const buckets = { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0, total: 0 };
    // Per-customer summary rows (the matrix).
    const summaryMap: Record<string, any> = {};
    const bucketKey = (d: number) => d <= 0 ? 'current' : d <= 30 ? 'days_1_30' : d <= 60 ? 'days_31_60' : d <= 90 ? 'days_61_90' : 'over_90';
    const bucketLabel: Record<string, string> = { current: 'current', days_1_30: '1-30', days_31_60: '31-60', days_61_90: '61-90', over_90: '90+' };

    const agingLines = invoices.map((inv: any) => {
      const d = parseInt(inv.days_overdue);
      const amount = parseFloat(inv.amount_due);
      const bk = bucketKey(d);
      buckets[bk as keyof typeof buckets] += amount; buckets.total += amount;
      const key = inv.customer_id || 'none';
      if (!summaryMap[key]) summaryMap[key] = { entity_id: inv.customer_id || null, entity_name: inv.customer_name, current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0, total: 0 };
      summaryMap[key][bk] += amount; summaryMap[key].total += amount;
      return { ...inv, bucket: bucketLabel[bk] };
    });

    const summary = Object.values(summaryMap).sort((a: any, b: any) => String(a.entity_name).localeCompare(String(b.entity_name)));

    res.json({ success: true, data: { lines: agingLines, summary, buckets, asOf } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to generate AR aging' }); }
});

// AP Aging — per-bill `lines` (detail), per-vendor `summary` matrix, grand `buckets`.
router.get('/reports/ap-aging', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const asOf = (req.query.asOfDate as string) || new Date().toISOString().split('T')[0];

    const bills = await db('vendor_bills as b').leftJoin('vendors as v', 'b.vendor_id', 'v.id')
      .where({ 'b.company_id': companyId, 'b.is_deleted': false })
      .whereNotIn('b.status', ['paid', 'voided'])
      .where('b.amount_due', '>', 0)
      .select('b.bill_number', 'b.bill_date', 'b.due_date', 'b.amount_due', 'b.vendor_id',
        db.raw('COALESCE(v.name, \'- No Vendor -\') as vendor_name'),
        db.raw(`DATE '${asOf}' - b.due_date as days_overdue`));

    const buckets = { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0, total: 0 };
    const summaryMap: Record<string, any> = {};
    const bucketKey = (d: number) => d <= 0 ? 'current' : d <= 30 ? 'days_1_30' : d <= 60 ? 'days_31_60' : d <= 90 ? 'days_61_90' : 'over_90';
    const bucketLabel: Record<string, string> = { current: 'current', days_1_30: '1-30', days_31_60: '31-60', days_61_90: '61-90', over_90: '90+' };

    const lines = bills.map((bill: any) => {
      const d = parseInt(bill.days_overdue);
      const amount = parseFloat(bill.amount_due);
      const bk = bucketKey(d);
      buckets[bk as keyof typeof buckets] += amount; buckets.total += amount;
      const key = bill.vendor_id || 'none';
      if (!summaryMap[key]) summaryMap[key] = { entity_id: bill.vendor_id || null, entity_name: bill.vendor_name, current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0, total: 0 };
      summaryMap[key][bk] += amount; summaryMap[key].total += amount;
      return { ...bill, bucket: bucketLabel[bk] };
    });

    const summary = Object.values(summaryMap).sort((a: any, b: any) => String(a.entity_name).localeCompare(String(b.entity_name)));

    res.json({ success: true, data: { lines, summary, buckets, asOf } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to generate AP aging' }); }
});

// GL Report — grouped by account, each with opening balance, posted lines (with a
// running balance) and closing balance. Returns the chart so the UI can render the
// parent→child account hierarchy (NetSuite "General Ledger" layout).
router.get('/reports/general-ledger', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { accountId } = req.query as any;
    const dateFrom = (req.query.dateFrom as string) || `${new Date().getFullYear()}-01-01`;
    const dateTo = (req.query.dateTo as string) || new Date().toISOString().split('T')[0];
    const dim = (['subsidiary', 'department', 'location', 'period', 'quarter', 'year'].includes(String(req.query.column))
      ? req.query.column : 'none') as DimKey;

    const dr = 'COALESCE(NULLIF(jel.debit_base,0), jel.debit)';
    const cr = 'COALESCE(NULLIF(jel.credit_base,0), jel.credit)';

    // Opening balances per account (net movement before dateFrom).
    let openQ = db('journal_entry_lines as jel')
      .join('journal_entries as je', 'jel.journal_id', 'je.id')
      .where({ 'je.company_id': companyId, 'je.status': 'posted' })
      .where('je.entry_date', '<', dateFrom)
      .groupBy('jel.account_id')
      .select('jel.account_id',
        db.raw(`COALESCE(SUM(${dr}),0) as d`), db.raw(`COALESCE(SUM(${cr}),0) as c`));
    if (accountId) openQ = openQ.where('jel.account_id', accountId);
    const openRows = await openQ;
    const openingByAcct: Record<string, { d: number; c: number }> = {};
    for (const o of openRows as any[]) openingByAcct[o.account_id] = { d: parseFloat(o.d), c: parseFloat(o.c) };

    // Resolve the dimension label per journal line (shown as an extra column when a
    // dimension is selected). Entity dims join to their lookup table for a name.
    const dimExpr = dimKeyExpr(dim);
    // Build id→label maps for entity dimensions so each line can show a readable value.
    let dimLabels: Record<string, string> = {};
    if (dim === 'department' || dim === 'location' || dim === 'subsidiary') {
      const table = dim === 'department' ? 'departments' : dim === 'location' ? 'locations' : 'subsidiaries';
      const rows = await db(table).where({ company_id: companyId }).select('id', 'name');
      for (const r of rows as any[]) dimLabels[r.id] = r.name;
    }
    const dimUnassignedLabel = dim === 'department' ? '- No Department -' : dim === 'location' ? '- No Location -' : dim === 'subsidiary' ? '- No Subsidiary -' : '- Unassigned -';

    // All posted lines within the period.
    let lineQ = db('journal_entry_lines as jel')
      .join('journal_entries as je', 'jel.journal_id', 'je.id')
      .join('accounts as a', 'jel.account_id', 'a.id')
      .where({ 'je.company_id': companyId, 'je.status': 'posted' })
      .where('je.entry_date', '>=', dateFrom).where('je.entry_date', '<=', dateTo);
    if (accountId) lineQ = lineQ.where('jel.account_id', accountId);
    const lineSelects: any[] = ['jel.id', 'jel.account_id', 'jel.memo', 'a.code as account_code', 'a.name as account_name', 'a.type as account_type', 'a.parent_id',
      'je.journal_number', 'je.entry_date', 'je.id as journal_id', 'je.source_type', 'je.source_id', 'je.memo as je_memo',
      db.raw(`${dr} as debit`), db.raw(`${cr} as credit`)];
    if (dimExpr) lineSelects.push(db.raw(`${dimExpr} as dim_key`));
    const lineRows = await lineQ
      .orderBy('a.code', 'asc').orderBy('je.entry_date', 'asc').orderBy('je.journal_number', 'asc').orderBy('jel.line_number', 'asc')
      .select(lineSelects);

    // Group lines into accounts (preserve code order).
    const acctOrder: string[] = [];
    const acctMap: Record<string, any> = {};
    for (const r of lineRows as any[]) {
      if (!acctMap[r.account_id]) {
        acctOrder.push(r.account_id);
        const o = openingByAcct[r.account_id] || { d: 0, c: 0 };
        const debitPositive = ['asset', 'cost_of_goods', 'cogs', 'expense', 'other_expense'].includes(r.account_type);
        const opening = debitPositive ? (o.d - o.c) : (o.c - o.d);
        acctMap[r.account_id] = {
          account_id: r.account_id, account_code: r.account_code, account_name: r.account_name,
          account_type: r.account_type, parent_id: r.parent_id,
          debitPositive, opening_balance: opening, running: opening,
          total_debit: 0, total_credit: 0, lines: [] as any[],
        };
      }
      const acc = acctMap[r.account_id];
      const debit = parseFloat(r.debit || 0);
      const credit = parseFloat(r.credit || 0);
      acc.running += acc.debitPositive ? (debit - credit) : (credit - debit);
      acc.total_debit += debit; acc.total_credit += credit;
      // Dimension value for this line.
      let dimValue = '';
      if (dim !== 'none') {
        const key = r.dim_key == null || r.dim_key === '' ? null : String(r.dim_key);
        const isTime = ['period', 'quarter', 'year'].includes(dim);
        dimValue = key == null ? (isTime ? '' : dimUnassignedLabel) : (isTime ? key : (dimLabels[key] || key));
      }
      acc.lines.push({
        id: r.id, journal_id: r.journal_id, journal_number: r.journal_number, entry_date: r.entry_date,
        source_type: r.source_type, source_id: r.source_id, memo: r.memo || r.je_memo || '',
        debit, credit, running_balance: acc.running, dim_value: dimValue,
      });
    }
    const accounts = acctOrder.map(id => {
      const a = acctMap[id];
      return { ...a, closing_balance: a.running };
    });

    const chart = await db('accounts').where({ company_id: companyId }).select('id', 'code', 'name', 'parent_id', 'type');

    res.json({ success: true, data: { accounts, chart, dateFrom, dateTo, column: dim } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch GL' }); }
});

// Account Ledger — all posted transactions for a single account in a period, with
// a running balance. Used as the drill-down target when clicking a P&L amount.
router.get('/reports/account-ledger', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { accountId } = req.query as any;
    const dateFrom = (req.query.dateFrom as string) || '2026-01-01';
    const dateTo = (req.query.dateTo as string) || new Date().toISOString().split('T')[0];
    if (!accountId) { res.status(400).json({ success: false, error: 'accountId is required' }); return; }

    const account = await db('accounts').where({ id: accountId, company_id: companyId }).first();
    if (!account) { res.status(404).json({ success: false, error: 'Account not found' }); return; }

    // Normal-balance sign: asset/expense/cogs are debit-positive; others credit-positive.
    const debitPositive = ['asset', 'cost_of_goods', 'cogs', 'expense', 'other_expense'].includes(account.type);
    const amt = (debit: number, credit: number) => debitPositive ? (debit - credit) : (credit - debit);

    const dr = db.raw('COALESCE(NULLIF(jel.debit_base,0), jel.debit)');
    const cr = db.raw('COALESCE(NULLIF(jel.credit_base,0), jel.credit)');

    // Opening balance = net movement before dateFrom.
    const [open] = await db('journal_entry_lines as jel')
      .join('journal_entries as je', 'jel.journal_id', 'je.id')
      .where({ 'je.company_id': companyId, 'je.status': 'posted', 'jel.account_id': accountId })
      .where('je.entry_date', '<', dateFrom)
      .select(
        db.raw('COALESCE(SUM(COALESCE(NULLIF(jel.debit_base,0), jel.debit)),0) as d'),
        db.raw('COALESCE(SUM(COALESCE(NULLIF(jel.credit_base,0), jel.credit)),0) as c'));
    const openingBalance = amt(parseFloat(open?.d || 0), parseFloat(open?.c || 0));

    const rows = await db('journal_entry_lines as jel')
      .join('journal_entries as je', 'jel.journal_id', 'je.id')
      .where({ 'je.company_id': companyId, 'je.status': 'posted', 'jel.account_id': accountId })
      .where('je.entry_date', '>=', dateFrom).where('je.entry_date', '<=', dateTo)
      .orderBy('je.entry_date', 'asc').orderBy('je.journal_number', 'asc').orderBy('jel.line_number', 'asc')
      .select('jel.id', 'jel.memo', 'je.journal_number', 'je.entry_date', 'je.id as journal_id',
        'je.source_type', 'je.source_id', 'je.memo as je_memo',
        db.raw(`${(dr as any).sql} as debit`), db.raw(`${(cr as any).sql} as credit`));

    let running = openingBalance;
    const lines = (rows as any[]).map(r => {
      const debit = parseFloat(r.debit || 0);
      const credit = parseFloat(r.credit || 0);
      running += amt(debit, credit);
      return {
        id: r.id, journal_id: r.journal_id, journal_number: r.journal_number,
        entry_date: r.entry_date, source_type: r.source_type, source_id: r.source_id,
        memo: r.memo || r.je_memo || '', debit, credit, running_balance: running,
      };
    });

    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

    res.json({ success: true, data: {
      account: { id: account.id, code: account.code, name: account.name, type: account.type },
      openingBalance, closingBalance: running, totalDebit, totalCredit, lines, dateFrom, dateTo,
    } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch account ledger' }); }
});

// ─── Cash Flow Report (Indirect Method) ──────────────────────────────────────
router.get('/reports/cash-flow', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureAccountColumns();
    const companyId = req.user!.companyId;
    const from = (req.query.startDate as string) || (req.query.dateFrom as string) || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const to   = (req.query.endDate as string)   || (req.query.dateTo as string)   || new Date().toISOString().split('T')[0];
    const dim = (['subsidiary', 'department', 'location', 'period', 'quarter', 'year'].includes(String(req.query.column))
      ? req.query.column : 'none') as DimKey;

    const dr = 'COALESCE(NULLIF(jel.debit_base,0), jel.debit)';
    const cr = 'COALESCE(NULLIF(jel.credit_base,0), jel.credit)';
    const cfDimExpr = dimKeyExpr(dim);
    const cfIsTime = ['period', 'quarter', 'year'].includes(dim);
    const cfTimeKeys = new Set<string>();

    // Period movement for a set of accounts. `metric`:
    //  'credit_minus_debit' → income-like; 'debit_minus_credit' → asset/expense-like.
    const movement = async (acctIds: string[], metric: 'cd' | 'dc'): Promise<number> => {
      if (!acctIds.length) return 0;
      const expr = metric === 'cd' ? `SUM(${cr}) - SUM(${dr})` : `SUM(${dr}) - SUM(${cr})`;
      const r = await db('journal_entry_lines as jel')
        .join('journal_entries as je', 'jel.journal_id', 'je.id')
        .whereIn('jel.account_id', acctIds)
        .where('je.company_id', companyId).where('je.status', 'posted')
        .where('je.entry_date', '>=', from).where('je.entry_date', '<=', to)
        .select(db.raw(`COALESCE(${expr}, 0) as v`)).first();
      return parseFloat((r as any)?.v || 0);
    };
    // Same movement, but broken out per dimension column → { columnId: amount }.
    const movementBy = async (acctIds: string[], metric: 'cd' | 'dc'): Promise<Record<string, number>> => {
      if (dim === 'none' || !cfDimExpr) { const v = await movement(acctIds, metric); return { total: v }; }
      if (!acctIds.length) return {};
      const expr = metric === 'cd' ? `SUM(${cr}) - SUM(${dr})` : `SUM(${dr}) - SUM(${cr})`;
      const rows = await db('journal_entry_lines as jel')
        .join('journal_entries as je', 'jel.journal_id', 'je.id')
        .whereIn('jel.account_id', acctIds)
        .where('je.company_id', companyId).where('je.status', 'posted')
        .where('je.entry_date', '>=', from).where('je.entry_date', '<=', to)
        .groupBy(db.raw(cfDimExpr))
        .select(db.raw(`${cfDimExpr} as dim_key`), db.raw(`COALESCE(${expr}, 0) as v`));
      const out: Record<string, number> = {};
      for (const r of rows as any[]) {
        const key = r.dim_key == null || r.dim_key === '' ? (cfIsTime ? null : UNASSIGNED) : String(r.dim_key);
        if (key == null) continue;
        out[key] = (out[key] || 0) + parseFloat(r.v || 0);
        if (cfIsTime) cfTimeKeys.add(key);
      }
      return out;
    };
    // Merge a per-column map into an accumulator with an optional sign.
    const mergeBy = (acc: Record<string, number>, b: Record<string, number>, sign = 1) => {
      for (const k of Object.keys(b)) acc[k] = (acc[k] || 0) + b[k] * sign;
      return acc;
    };
    const balanceAsOf = async (acctIds: string[], asOf: string): Promise<number> => {
      if (!acctIds.length) return 0;
      const r = await db('journal_entry_lines as jel')
        .join('journal_entries as je', 'jel.journal_id', 'je.id')
        .whereIn('jel.account_id', acctIds)
        .where('je.company_id', companyId).where('je.status', 'posted')
        .where('je.entry_date', '<=', asOf)
        .select(db.raw(`COALESCE(SUM(${dr}) - SUM(${cr}), 0) as v`)).first();
      return parseFloat((r as any)?.v || 0);
    };

    // Resolve account groups by the detailed account_type (fallback to high-level type).
    const chart = await db('accounts').where({ company_id: companyId }).select('id', 'code', 'name', 'account_type', 'type');
    const byAccountType = (types: string[]) => chart.filter((a: any) => types.includes(a.account_type)).map((a: any) => a.id);
    const byType = (types: string[]) => chart.filter((a: any) => types.includes(a.type)).map((a: any) => a.id);

    const incomeIds  = byType(['income', 'revenue']);
    const expenseIds = byType(['expense', 'cost_of_goods', 'cogs', 'other_expense']);
    const netIncome = (await movement(incomeIds, 'cd')) + (await movement(expenseIds, 'dc')) * -1;
    // Net income per column = income(cd) - expense(dc).
    const netIncomeBy: Record<string, number> = {};
    mergeBy(netIncomeBy, await movementBy(incomeIds, 'cd'));
    mergeBy(netIncomeBy, await movementBy(expenseIds, 'dc'), -1);

    // Working-capital adjustments (indirect method). For assets: an INCREASE uses
    // cash → negative adjustment (so adj = -(Δasset)). For liabilities: an INCREASE
    // frees cash → positive adjustment (adj = +Δliability).
    const arIds        = byAccountType(['accounts_receivable']);
    const invIds       = byAccountType(['inventory']);
    const ocaIds       = byAccountType(['other_current_asset', 'unbilled_receivable', 'deferred_expense']);
    const apIds        = byAccountType(['accounts_payable']);
    const taxIds       = chart.filter((a: any) => /ppn|tax|pajak/i.test(a.name)).map((a: any) => a.id);
    const oclIds       = byAccountType(['other_current_liability', 'credit_card', 'deferred_revenue']).filter((id: string) => !taxIds.includes(id));
    const fixedIds     = byAccountType(['fixed_asset']);

    const adjAR  = -(await movement(arIds, 'dc'));
    const adjInv = -(await movement(invIds, 'dc'));
    const adjOCA = -(await movement(ocaIds, 'dc'));
    const adjAP  = (await movement(apIds, 'cd'));
    const adjTax = (await movement(taxIds, 'cd'));
    const adjOCL = (await movement(oclIds, 'cd'));

    // Per-column breakdown of each adjustment (sign matches the single-value formula above).
    const negBy = (b: Record<string, number>) => { const o: Record<string, number> = {}; mergeBy(o, b, -1); return o; };
    const adjARBy  = negBy(await movementBy(arIds, 'dc'));
    const adjInvBy = negBy(await movementBy(invIds, 'dc'));
    const adjOCABy = negBy(await movementBy(ocaIds, 'dc'));
    const adjAPBy  = await movementBy(apIds, 'cd');
    const adjTaxBy = await movementBy(taxIds, 'cd');
    const adjOCLBy = await movementBy(oclIds, 'cd');

    const totalAdjustments = adjAR + adjInv + adjOCA + adjAP + adjTax + adjOCL;
    const totalOperating = netIncome + totalAdjustments;
    // Per-column operating total = netIncome + all adjustments.
    const totalAdjustmentsBy: Record<string, number> = {};
    for (const b of [adjARBy, adjInvBy, adjOCABy, adjAPBy, adjTaxBy, adjOCLBy]) mergeBy(totalAdjustmentsBy, b);
    const totalOperatingBy: Record<string, number> = {};
    mergeBy(totalOperatingBy, netIncomeBy); mergeBy(totalOperatingBy, totalAdjustmentsBy);

    // Investing: change in fixed assets (purchase increases assets → cash out = negative).
    const investingFixed = -(await movement(fixedIds, 'dc'));
    const investingFixedBy = negBy(await movementBy(fixedIds, 'dc'));
    const totalInvesting = investingFixed;
    const totalInvestingBy: Record<string, number> = {};
    mergeBy(totalInvestingBy, investingFixedBy);

    // Cash accounts: bank + cash account_type (and legacy type).
    const cashIds = chart.filter((a: any) =>
      ['bank', 'cash'].includes(a.account_type) || ['bank', 'cash'].includes(a.type)).map((a: any) => a.id);
    const prevDay = new Date(from); prevDay.setDate(prevDay.getDate() - 1);
    const openingCash = await balanceAsOf(cashIds, prevDay.toISOString().split('T')[0]);
    const closingCash = await balanceAsOf(cashIds, to);
    const netChange = closingCash - openingCash;

    // Representative account for drill-down when a bucket maps to exactly one account.
    const one = (ids: string[]) => ids.length === 1 ? ids[0] : null;

    // Column list. For entity dims, list all active rows + Unassigned; for time dims,
    // discover from the movements we just ran.
    let columns = await resolveColumns(companyId, dim);
    if (cfIsTime) columns = [...cfTimeKeys].sort().map(k => ({ id: k, label: k }));

    res.json({
      success: true,
      data: {
        operating: {
          netIncome, netIncomeBy,
          adjustments: [
            { key: 'ar',  label: 'Accounts Receivable',      amount: adjAR,  accountId: one(arIds),  by: adjARBy },
            { key: 'inv', label: 'Inventory Asset',          amount: adjInv, accountId: one(invIds), by: adjInvBy },
            { key: 'oca', label: 'Other Current Asset',      amount: adjOCA, accountId: one(ocaIds), by: adjOCABy },
            { key: 'ap',  label: 'Accounts Payable',         amount: adjAP,  accountId: one(apIds),  by: adjAPBy },
            { key: 'tax', label: 'Sales Tax Payable',        amount: adjTax, accountId: one(taxIds), by: adjTaxBy },
            { key: 'ocl', label: 'Other Current Liabilities',amount: adjOCL, accountId: one(oclIds), by: adjOCLBy },
          ],
          totalAdjustments, totalAdjustmentsBy,
          total: totalOperating, totalBy: totalOperatingBy,
        },
        investing: {
          lines: [
            { key: 'fixed', label: 'Fixed Asset', amount: investingFixed, accountId: one(fixedIds), by: investingFixedBy },
          ],
          total: totalInvesting, totalBy: totalInvestingBy,
        },
        // Cash position (opening/closing/net change) is not dimensionalised — cash is a
        // single pool, so it stays as a single total regardless of the chosen column.
        netChange, openingCash, closingCash, dateFrom: from, dateTo: to, column: dim, columns,
      },
    });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to generate cash flow' }); }
});

export default router;

// ── Audit routes ──────────────────────────────────────────────────────────────
router.get('/journals/:id/audit', async (req: any, res: any) => {
  try { const l = await (db as any)('transaction_audit_log').where({ company_id: req.user.companyId, source_type: 'journal_entry', source_id: req.params.id }).orderBy('performed_at','desc').limit(200); res.json({ success:true, data:l }); } catch(e:any){ res.status(500).json({success:false,error:e.message}); }
});
