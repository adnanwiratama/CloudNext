import { Router, Request, Response } from 'express';
import db from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { getPaginationParams, buildPaginatedResult } from '../../utils/pagination';
import { generateTransactionNumber } from '../../utils/sequence';
import { AccountingEngine } from '../../engines/accounting/accountingEngine';
import { createAuditLog } from '../../utils/audit';

const router = Router();
router.use(authenticate);

// ===== CHART OF ACCOUNTS =====
router.get('/accounts', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    let query = db('accounts').where({ company_id: companyId, is_active: true }).orderBy('code');
    if (req.query.type) query = query.where({ type: req.query.type });
    if (req.query.search) query = query.where((qb: any) => qb.whereILike('name', `%${req.query.search}%`).orWhereILike('code', `%${req.query.search}%`));
    const accounts = await query;

    // Calculate net balance per account from posted journal entries
    const balances = await db('journal_entry_lines as jel')
      .join('journal_entries as je', 'jel.journal_id', 'je.id')
      .where({ 'je.company_id': companyId, 'je.status': 'posted' })
      .groupBy('jel.account_id')
      .select(
        'jel.account_id',
        db.raw('COALESCE(SUM(jel.debit_base), 0) as total_debit'),
        db.raw('COALESCE(SUM(jel.credit_base), 0) as total_credit'),
        db.raw('COALESCE(SUM(jel.debit_base), 0) - COALESCE(SUM(jel.credit_base), 0) as net_balance')
      );

    const balanceMap: Record<string, any> = {};
    for (const b of balances) balanceMap[b.account_id] = b;

    const data = accounts.map((acct: any) => {
      const bal = balanceMap[acct.id];
      return {
        ...acct,
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
        db.raw('COALESCE(SUM(jel.debit_base), 0) as total_debit'),
        db.raw('COALESCE(SUM(jel.credit_base), 0) as total_credit'),
        db.raw('COALESCE(SUM(jel.debit_base), 0) - COALESCE(SUM(jel.credit_base), 0) as net_balance')
      );

    // For asset accounts (bank), balance = debit - credit
    // For liability, balance = credit - debit
    const netBalance = bal ? parseFloat(bal.net_balance) : 0;
    const balance = ['asset', 'bank'].includes(acct.type) ? netBalance : -netBalance;

    res.json({ success: true, data: { account: acct, balance, total_debit: bal ? parseFloat(bal.total_debit) : 0, total_credit: bal ? parseFloat(bal.total_credit) : 0 } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch balance' }); }
});

router.post('/accounts', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const [acct] = await db('accounts').insert({
      company_id: req.user!.companyId, code: d.code, name: d.name, type: d.type,
      subtype: d.subtype, parent_id: d.parentId || null, currency: d.currency || 'IDR',
      is_summary: d.isSummary || false, is_bank: d.isBank || false,
      description: d.description, is_active: true,
    }).returning('*');
    res.status(201).json({ success: true, data: acct });
  } catch (e: any) {
    if (e.code === '23505') res.status(409).json({ success: false, error: `Account code ${req.body.code} already exists.` });
    else res.status(500).json({ success: false, error: 'Failed to create account' });
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
    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
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

    res.json({ success: true, data: { ...je, lines, source_number: sourceNumber, source_route: sourceRoute } });
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

    const result = await db('journal_entry_lines as jel')
      .join('journal_entries as je', 'jel.journal_id', 'je.id')
      .join('accounts as a', 'jel.account_id', 'a.id')
      .where({ 'je.company_id': companyId, 'je.status': 'posted' })
      .where('je.entry_date', '>=', dateFrom)
      .where('je.entry_date', '<=', dateTo)
      .groupBy('a.id', 'a.code', 'a.name', 'a.type', 'a.subtype')
      .orderBy('a.code')
      .select(
        'a.id', 'a.code', 'a.name', 'a.type', 'a.subtype',
        db.raw('COALESCE(SUM(jel.debit_base), 0) as total_debit'),
        db.raw('COALESCE(SUM(jel.credit_base), 0) as total_credit'),
        db.raw('COALESCE(SUM(jel.debit_base), 0) - COALESCE(SUM(jel.credit_base), 0) as net_balance')
      );

    const totalDebit = result.reduce((s: number, r: any) => s + parseFloat(r.total_debit), 0);
    const totalCredit = result.reduce((s: number, r: any) => s + parseFloat(r.total_credit), 0);

    res.json({ success: true, data: { lines: result, totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.01, dateFrom, dateTo } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to generate trial balance' }); }
});

// P&L Report
router.get('/reports/profit-loss', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const dateFrom = req.query.dateFrom as string || '2026-01-01';
    const dateTo = req.query.dateTo as string || new Date().toISOString().split('T')[0];

    const incomeTypes = ['revenue', 'other_income'];
    const expenseTypes = ['cogs', 'expense', 'other_expense'];

    const revenue = await db('journal_entry_lines as jel')
      .join('journal_entries as je', 'jel.journal_id', 'je.id')
      .join('accounts as a', 'jel.account_id', 'a.id')
      .where({ 'je.company_id': companyId, 'je.status': 'posted' })
      .whereIn('a.type', incomeTypes)
      .where('je.entry_date', '>=', dateFrom).where('je.entry_date', '<=', dateTo)
      .groupBy('a.id', 'a.code', 'a.name', 'a.type')
      .orderBy('a.code')
      .select('a.id', 'a.code', 'a.name', 'a.type',
        db.raw('COALESCE(SUM(jel.credit_base), 0) - COALESCE(SUM(jel.debit_base), 0) as amount'));

    const expenses = await db('journal_entry_lines as jel')
      .join('journal_entries as je', 'jel.journal_id', 'je.id')
      .join('accounts as a', 'jel.account_id', 'a.id')
      .where({ 'je.company_id': companyId, 'je.status': 'posted' })
      .whereIn('a.type', expenseTypes)
      .where('je.entry_date', '>=', dateFrom).where('je.entry_date', '<=', dateTo)
      .groupBy('a.id', 'a.code', 'a.name', 'a.type')
      .orderBy('a.code')
      .select('a.id', 'a.code', 'a.name', 'a.type',
        db.raw('COALESCE(SUM(jel.debit_base), 0) - COALESCE(SUM(jel.credit_base), 0) as amount'));

    const totalRevenue = revenue.reduce((s: number, r: any) => s + parseFloat(r.amount), 0);
    const totalCOGS = expenses.filter((e: any) => e.type === 'cogs').reduce((s: number, r: any) => s + parseFloat(r.amount), 0);
    const totalExpenses = expenses.filter((e: any) => e.type === 'expense').reduce((s: number, r: any) => s + parseFloat(r.amount), 0);
    const grossProfit = totalRevenue - totalCOGS;
    const netIncome = grossProfit - totalExpenses;

    res.json({
      success: true,
      data: {
        revenue, expenses, totalRevenue, totalCOGS, totalExpenses,
        grossProfit, grossMarginPercent: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
        netIncome, dateFrom, dateTo,
      },
    });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to generate P&L' }); }
});

// Balance Sheet
router.get('/reports/balance-sheet', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const asOfDate = req.query.asOfDate as string || new Date().toISOString().split('T')[0];

    const balances = await db('journal_entry_lines as jel')
      .join('journal_entries as je', 'jel.journal_id', 'je.id')
      .join('accounts as a', 'jel.account_id', 'a.id')
      .where({ 'je.company_id': companyId, 'je.status': 'posted' })
      .where('je.entry_date', '<=', asOfDate)
      .whereIn('a.type', ['asset', 'liability', 'equity'])
      .groupBy('a.id', 'a.code', 'a.name', 'a.type', 'a.subtype')
      .orderBy('a.code')
      .select('a.id', 'a.code', 'a.name', 'a.type', 'a.subtype',
        db.raw('COALESCE(SUM(jel.debit_base), 0) - COALESCE(SUM(jel.credit_base), 0) as balance'));

    const assets = balances.filter((b: any) => b.type === 'asset');
    const liabilities = balances.filter((b: any) => b.type === 'liability');
    const equity = balances.filter((b: any) => b.type === 'equity');

    const totalAssets = assets.reduce((s: number, a: any) => s + parseFloat(a.balance), 0);
    const totalLiabilities = liabilities.reduce((s: number, l: any) => s + Math.abs(parseFloat(l.balance)), 0);
    const totalEquity = equity.reduce((s: number, e: any) => s + Math.abs(parseFloat(e.balance)), 0);

    res.json({ success: true, data: { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity, asOfDate } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to generate balance sheet' }); }
});

// AR Aging
router.get('/reports/ar-aging', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const today = new Date();

    const invoices = await db('invoices as i').join('customers as c', 'i.customer_id', 'c.id')
      .where({ 'i.company_id': companyId, 'i.is_deleted': false })
      .whereNotIn('i.status', ['paid', 'voided'])
      .where('i.amount_due', '>', 0)
      .select('i.invoice_number', 'i.invoice_date', 'i.due_date', 'i.amount_due', 'c.name as customer_name',
        db.raw(`CURRENT_DATE - i.due_date as days_overdue`));

    const buckets = {
      current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0, total: 0,
    };

    const agingLines = invoices.map((inv: any) => {
      const daysOverdue = parseInt(inv.days_overdue);
      const amount = parseFloat(inv.amount_due);
      buckets.total += amount;
      if (daysOverdue <= 0) { buckets.current += amount; return { ...inv, bucket: 'current' }; }
      if (daysOverdue <= 30) { buckets.days_1_30 += amount; return { ...inv, bucket: '1-30' }; }
      if (daysOverdue <= 60) { buckets.days_31_60 += amount; return { ...inv, bucket: '31-60' }; }
      if (daysOverdue <= 90) { buckets.days_61_90 += amount; return { ...inv, bucket: '61-90' }; }
      buckets.over_90 += amount;
      return { ...inv, bucket: '90+' };
    });

    res.json({ success: true, data: { lines: agingLines, buckets } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to generate AR aging' }); }
});

// AP Aging
router.get('/reports/ap-aging', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const bills = await db('vendor_bills as b').join('vendors as v', 'b.vendor_id', 'v.id')
      .where({ 'b.company_id': companyId, 'b.is_deleted': false })
      .whereNotIn('b.status', ['paid', 'voided'])
      .where('b.amount_due', '>', 0)
      .select('b.bill_number', 'b.bill_date', 'b.due_date', 'b.amount_due', 'v.name as vendor_name',
        db.raw('CURRENT_DATE - b.due_date as days_overdue'));

    const buckets = { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0, total: 0 };
    const lines = bills.map((bill: any) => {
      const daysOverdue = parseInt(bill.days_overdue);
      const amount = parseFloat(bill.amount_due);
      buckets.total += amount;
      if (daysOverdue <= 0) { buckets.current += amount; return { ...bill, bucket: 'current' }; }
      if (daysOverdue <= 30) { buckets.days_1_30 += amount; return { ...bill, bucket: '1-30' }; }
      if (daysOverdue <= 60) { buckets.days_31_60 += amount; return { ...bill, bucket: '31-60' }; }
      if (daysOverdue <= 90) { buckets.days_61_90 += amount; return { ...bill, bucket: '61-90' }; }
      buckets.over_90 += amount;
      return { ...bill, bucket: '90+' };
    });

    res.json({ success: true, data: { lines, buckets } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to generate AP aging' }); }
});

// GL Report
router.get('/reports/general-ledger', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { accountId, dateFrom, dateTo } = req.query as any;
    let query = db('journal_entry_lines as jel')
      .join('journal_entries as je', 'jel.journal_id', 'je.id')
      .join('accounts as a', 'jel.account_id', 'a.id')
      .where({ 'je.company_id': companyId, 'je.status': 'posted' });
    if (accountId) query = query.where({ 'jel.account_id': accountId });
    if (dateFrom) query = query.where('je.entry_date', '>=', dateFrom);
    if (dateTo) query = query.where('je.entry_date', '<=', dateTo);
    const { page: p, limit: l } = getPaginationParams(req.query as any);
    const pg = p || 1; const lm = l || 25;
    const total = parseInt((await query.clone().clearSelect().count('* as count').first() as any)?.count || '0');
    const data = await query.orderBy('je.entry_date', 'asc').orderBy('jel.line_number', 'asc')
      .limit(lm).offset((pg - 1) * lm)
      .select('jel.*', 'je.journal_number', 'je.entry_date', 'je.memo as je_memo', 'je.source_type',
        'a.code as account_code', 'a.name as account_name');
    res.json({ success: true, ...buildPaginatedResult(data, total, pg, lm) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch GL' }); }
});

// ─── Cash Flow Report (Indirect Method) ──────────────────────────────────────
router.get('/reports/cash-flow', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { startDate, endDate } = req.query as any;
    const from = startDate || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const to   = endDate   || new Date().toISOString().split('T')[0];

    // Net Income from P&L
    const incomeAccounts = await db('accounts').where({ company_id: companyId }).whereIn('type', ['revenue', 'income']);
    const expenseAccounts = await db('accounts').where({ company_id: companyId }).whereIn('type', ['expense', 'cost_of_goods']);
    const incomeIds  = incomeAccounts.map((a: any) => a.id);
    const expenseIds = expenseAccounts.map((a: any) => a.id);

    const getNetBalance = async (acctIds: string[], sign = 1) => {
      if (!acctIds.length) return 0;
      const r = await db('journal_entry_lines as jel')
        .join('journal_entries as je', 'jel.journal_id', 'je.id')
        .whereIn('jel.account_id', acctIds)
        .where('je.company_id', companyId).where('je.status', 'posted')
        .where('je.entry_date', '>=', from).where('je.entry_date', '<=', to)
        .select(db.raw('SUM(jel.credit - jel.debit) as net')).first();
      return (parseFloat((r as any)?.net || 0)) * sign;
    };

    const totalRevenue = await getNetBalance(incomeIds);
    const totalExpense = await getNetBalance(expenseIds, -1);
    const netIncome = totalRevenue - totalExpense;

    // Changes in working capital - AR, AP, Inventory
    const arAccts = await db('accounts').where({ company_id: companyId, type: 'accounts_receivable' });
    const apAccts = await db('accounts').where({ company_id: companyId, type: 'accounts_payable' });
    const invAccts = await db('accounts').where({ company_id: companyId }).whereIn('type', ['inventory', 'asset']).where('subtype', 'inventory');
    const changeAR = -(await getNetBalance(arAccts.map((a: any) => a.id)));
    const changeAP = await getNetBalance(apAccts.map((a: any) => a.id));
    const changeInventory = -(await getNetBalance(invAccts.map((a: any) => a.id)));

    const operatingTotal = netIncome + changeAR + changeAP + changeInventory;

    // Opening / closing cash
    const cashAccts = await db('accounts').where({ company_id: companyId }).where(function() {
      this.where({ type: 'bank' }).orWhere({ type: 'cash' }).orWhere({ subtype: 'bank' }).orWhere({ subtype: 'cash' });
    });
    const cashIds = cashAccts.map((a: any) => a.id);

    const getBalance = async (acctIds: string[], asOf: string) => {
      if (!acctIds.length) return 0;
      const r = await db('journal_entry_lines as jel')
        .join('journal_entries as je', 'jel.journal_id', 'je.id')
        .whereIn('jel.account_id', acctIds)
        .where('je.company_id', companyId).where('je.status', 'posted')
        .where('je.entry_date', '<=', asOf)
        .select(db.raw('SUM(jel.debit - jel.credit) as balance')).first();
      return parseFloat((r as any)?.balance || 0);
    };

    const prevDay = new Date(from); prevDay.setDate(prevDay.getDate() - 1);
    const openingCash = await getBalance(cashIds, prevDay.toISOString().split('T')[0]);
    const closingCash = await getBalance(cashIds, to);
    const netCashChange = closingCash - openingCash;

    res.json({
      success: true,
      data: {
        operating: { netIncome, depreciation: 0, changeAR, changeInventory, changeAP, changeOtherCA: 0, total: operatingTotal },
        investing: { purchaseFixedAssets: 0, saleFixedAssets: 0, total: 0 },
        financing: { loanProceeds: 0, loanRepayments: 0, equity: 0, dividends: 0, total: 0 },
        netCashChange, openingCash, closingCash,
      },
    });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to generate cash flow' }); }
});

export default router;

// ── Audit routes ──────────────────────────────────────────────────────────────
router.get('/journals/:id/audit', async (req: any, res: any) => {
  try { const l = await (db as any)('transaction_audit_log').where({ company_id: req.user.companyId, source_type: 'journal_entry', source_id: req.params.id }).orderBy('performed_at','desc').limit(200); res.json({ success:true, data:l }); } catch(e:any){ res.status(500).json({success:false,error:e.message}); }
});
