import { Router, Request, Response } from 'express';
import db from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { enforcePermissions } from '../../middleware/permissions';
import { AccountingEngine } from '../../engines/accounting/accountingEngine';
import { fetchJEWithLines } from '../../utils/transactionAudit';
import { resolveApprover } from '../../utils/approvals';

const router = Router();
router.use(authenticate);
router.use(enforcePermissions);

// Ensure expense_reports has account_id (header payable), is_posted, and approval columns.
let _expEnsured = false;
async function ensureExpenseCols(): Promise<void> {
  if (_expEnsured) return;
  if (!(await db.schema.hasColumn('expense_reports', 'account_id'))) {
    await db.schema.alterTable('expense_reports', (t: any) => { t.uuid('account_id').nullable(); });
  }
  if (!(await db.schema.hasColumn('expense_reports', 'is_posted'))) {
    await db.schema.alterTable('expense_reports', (t: any) => { t.boolean('is_posted').defaultTo(false); });
  }
  if (!(await db.schema.hasColumn('expense_reports', 'approved_by'))) {
    await db.schema.alterTable('expense_reports', (t: any) => { t.uuid('approved_by').nullable(); });
  }
  if (!(await db.schema.hasColumn('expense_reports', 'approved_at'))) {
    await db.schema.alterTable('expense_reports', (t: any) => { t.timestamp('approved_at').nullable(); });
  }
  _expEnsured = true;
}

// ─── Expense Reports ──────────────────────────────────────────────────────────
router.get('/expenses', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('expense_reports')
      .where({ company_id: req.user!.companyId })
      .orderBy('created_at', 'desc').limit(100);
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to fetch expense reports' }); }
});

router.get('/expenses/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    await ensureExpenseCols();
    const [rHasDept, rHasLoc, rHasSub, lHasDept, lHasLoc] = await Promise.all([
      db.schema.hasColumn('expense_reports', 'department_id'),
      db.schema.hasColumn('expense_reports', 'location_id'),
      db.schema.hasColumn('expense_reports', 'subsidiary_id'),
      db.schema.hasColumn('expense_report_lines', 'department_id'),
      db.schema.hasColumn('expense_report_lines', 'location_id'),
    ]);
    const rq = db('expense_reports as er')
      .leftJoin('accounts as ha', 'er.account_id', 'ha.id')
      .where({ 'er.id': req.params.id, 'er.company_id': companyId });
    const rSel: any[] = ['er.*', 'ha.code as account_code', 'ha.name as account_name'];
    if (rHasDept) { rq.leftJoin('departments as dep', 'er.department_id', 'dep.id'); rSel.push('dep.name as department_name'); }
    if (rHasLoc)  { rq.leftJoin('locations as loc', 'er.location_id', 'loc.id'); rSel.push('loc.name as location_name'); }
    if (rHasSub)  { rq.leftJoin('subsidiaries as sub', 'er.subsidiary_id', 'sub.id'); rSel.push('sub.name as subsidiary_name'); }
    const report = await rq.select(rSel).first();
    if (!report) { res.status(404).json({ success: false, error: 'Report not found' }); return; }

    const lq = db('expense_report_lines as erl')
      .leftJoin('accounts as a', 'erl.account_id', 'a.id')
      .where({ 'erl.report_id': req.params.id });
    const lSel: any[] = ['erl.*', 'a.code as account_code', 'a.name as account_name'];
    if (lHasDept) { lq.leftJoin('departments as ld', 'erl.department_id', 'ld.id'); lSel.push('ld.name as department_name'); }
    if (lHasLoc)  { lq.leftJoin('locations as ll', 'erl.location_id', 'll.id'); lSel.push('ll.name as location_name'); }
    const lines = await lq.select(lSel).orderBy('erl.created_at');

    const journalEntries = await db('journal_entries as je')
      .where({ 'je.source_type': 'expense_report', 'je.source_id': req.params.id })
      .select('je.*');
    for (const je of journalEntries as any[]) {
      je.lines = await db('journal_entry_lines as jel')
        .leftJoin('accounts as a', 'jel.account_id', 'a.id')
        .where({ 'jel.journal_id': je.id })
        .select('jel.*', 'a.code as account_code', 'a.name as account_name');
    }
    // Related records: expense payments that (partly) paid this report
    let payments: any[] = [];
    if (await db.schema.hasTable('expense_payment_applications')) {
      payments = await db('expense_payment_applications as epa')
        .join('expense_payments as ep', 'epa.payment_id', 'ep.id')
        .where({ 'epa.report_id': req.params.id })
        .select('epa.id', 'epa.applied_amount', 'ep.id as payment_id', 'ep.payment_number', 'ep.payment_date', 'ep.status as payment_status');
    }
    res.json({ success: true, data: { ...report, lines, journalEntries, payments } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch report' }); }
});

// Column existence helper (dept/loc/subsidiary added by the dept/location migration)
async function expenseCols() {
  const [rHasDept, rHasLoc, rHasSub, lHasDept, lHasLoc] = await Promise.all([
    db.schema.hasColumn('expense_reports', 'department_id'),
    db.schema.hasColumn('expense_reports', 'location_id'),
    db.schema.hasColumn('expense_reports', 'subsidiary_id'),
    db.schema.hasColumn('expense_report_lines', 'department_id'),
    db.schema.hasColumn('expense_report_lines', 'location_id'),
  ]);
  return { rHasDept, rHasLoc, rHasSub, lHasDept, lHasLoc };
}

async function insertExpenseLines(reportId: string, lines: any[], cols: any) {
  for (const line of lines || []) {
    const row: any = {
      report_id: reportId,
      expense_date: line.date || new Date(),
      category: line.category || 'other',
      description: line.description || null,
      account_id: line.accountId || null,
      receipt_number: line.receipt || null,
      amount: Number(line.amount || 0),
    };
    if (cols.lHasDept) row.department_id = line.departmentId || null;
    if (cols.lHasLoc)  row.location_id = line.locationId || null;
    await db('expense_report_lines').insert(row);
  }
}

router.post('/expenses', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.employeeName) { res.status(400).json({ success: false, error: 'Employee name is required' }); return; }

    await ensureExpenseCols();
    const cols = await expenseCols();
    const reportNumber = `EXP-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const totalAmount = (d.lines || []).reduce((s: number, l: any) => s + Number(l.amount || 0), 0);

    const insert: any = {
      company_id: companyId,
      report_number: reportNumber,
      employee_name: d.employeeName,
      department: d.department || null,
      report_period_start: d.reportPeriodStart || null,
      report_period_end: d.reportPeriodEnd || null,
      purpose: d.purpose || null,
      memo: d.memo || null,
      total_amount: totalAmount,
      status: 'submitted',
      account_id: d.accountId || null,
      is_posted: false,
      created_by: req.user!.id,
    };
    if (cols.rHasDept) insert.department_id = d.departmentId || null;
    if (cols.rHasLoc)  insert.location_id = d.locationId || null;
    if (cols.rHasSub)  insert.subsidiary_id = d.subsidiaryId || null;
    const [report] = await db('expense_reports').insert(insert).returning('*');

    await insertExpenseLines(report.id, d.lines, cols);

    res.status(201).json({ success: true, data: { ...report, report_number: reportNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to submit expense report' }); }
});

// Edit an expense report (update header + replace lines)
router.put('/expenses/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    const existing = await db('expense_reports').where({ id: req.params.id, company_id: companyId }).first();
    if (!existing) { res.status(404).json({ success: false, error: 'Report not found' }); return; }
    if (existing.status === 'approved' || existing.status === 'paid') {
      res.status(400).json({ success: false, error: `Cannot edit a report that is ${existing.status}.` }); return;
    }
    await ensureExpenseCols();
    const cols = await expenseCols();
    const totalAmount = (d.lines || []).reduce((s: number, l: any) => s + Number(l.amount || 0), 0);

    const upd: any = {
      employee_name: d.employeeName ?? existing.employee_name,
      department: d.department ?? existing.department,
      report_period_start: d.reportPeriodStart || existing.report_period_start,
      report_period_end: d.reportPeriodEnd || existing.report_period_end,
      purpose: d.purpose ?? existing.purpose,
      memo: d.memo ?? existing.memo,
      total_amount: totalAmount,
      account_id: d.accountId || existing.account_id || null,
      updated_at: new Date(),
    };
    if (cols.rHasDept) upd.department_id = d.departmentId || null;
    if (cols.rHasLoc)  upd.location_id = d.locationId || null;
    if (cols.rHasSub)  upd.subsidiary_id = d.subsidiaryId || null;
    const [report] = await db('expense_reports').where({ id: existing.id }).update(upd).returning('*');

    await db('expense_report_lines').where({ report_id: existing.id }).del();
    await insertExpenseLines(existing.id, d.lines, cols);

    res.json({ success: true, data: report, message: 'Expense report updated' });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to update expense report' }); }
});

router.post('/expenses/:id/approve', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    await ensureExpenseCols();
    const existing = await db('expense_reports').where({ id: req.params.id, company_id: companyId }).first();
    if (!existing) { res.status(404).json({ success: false, error: 'Report not found' }); return; }
    if (existing.status === 'approved' || existing.status === 'paid') {
      res.status(400).json({ success: false, error: `Report is already ${existing.status}.` }); return;
    }

    const erApprover = await resolveApprover(companyId, 'expense_reports', req.user!.id);
    const result = await db.transaction(async (trx) => {
      const [report] = await trx('expense_reports').where({ id: existing.id })
        .update({ status: 'approved', approved_by: erApprover, approved_at: new Date() })
        .returning('*');

      // ── GL on approval: Dr. each line's expense account / Cr. the header payable account ──
      const lines = await trx('expense_report_lines').where({ report_id: report.id });
      // Header (credit) account — the payable chosen in Primary Information; fall back to AP (2100)
      let creditAcctId = report.account_id;
      if (!creditAcctId) {
        const ap = await trx('accounts').where({ company_id: companyId, code: '2100' }).first()
          || await trx('accounts').where({ company_id: companyId, subtype: 'payable' }).orderBy('code').first();
        creditAcctId = ap?.id;
      }
      const defaultExpense = await trx('accounts').where({ company_id: companyId, type: 'expense' }).orderBy('code').first();

      const jeLines: any[] = [];
      let totalDebit = 0;
      for (const l of lines) {
        const amt = Number(l.amount || 0);
        if (amt <= 0) continue;
        const acct = l.account_id || defaultExpense?.id;
        if (!acct) continue;
        jeLines.push({
          accountId: acct, debit: amt, credit: 0,
          departmentId: l.department_id || report.department_id || undefined,
          locationId: l.location_id || report.location_id || undefined,
          memo: l.description || l.category || 'Expense',
        });
        totalDebit += amt;
      }
      if (jeLines.length > 0 && creditAcctId && totalDebit > 0) {
        jeLines.push({
          accountId: creditAcctId, debit: 0, credit: totalDebit,
          departmentId: report.department_id || undefined, locationId: report.location_id || undefined,
          memo: `Expense payable - ${report.employee_name}`,
        });
        await AccountingEngine.createJournalEntry({
          companyId,
          subsidiaryId: report.subsidiary_id || undefined,
          date: report.report_period_end || new Date().toISOString().split('T')[0],
          sourceType: 'expense_report',
          sourceId: report.id,
          memo: `Expense Report ${report.report_number} - ${report.employee_name}`,
          lines: jeLines,
          createdBy: req.user!.id,
          trx,
        });
        await trx('expense_reports').where({ id: report.id }).update({ is_posted: true });
      }
      return await trx('expense_reports').where({ id: report.id }).first();
    });

    res.json({ success: true, data: result, message: 'Expense report approved and posted' });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: e.message || 'Failed to approve report' }); }
});

// ─── Expense Payments ─────────────────────────────────────────────────────────
// Pays approved Expense Reports by settling their payable account (like Bill Payment,
// but the "Vendor" is replaced by the payable Account).
let _epEnsured = false;
async function ensureExpensePaymentTables(): Promise<void> {
  if (_epEnsured) return;
  await ensureExpenseCols();
  if (!(await db.schema.hasColumn('expense_reports', 'amount_paid'))) {
    await db.schema.alterTable('expense_reports', (t: any) => { t.decimal('amount_paid', 18, 2).defaultTo(0); });
  }
  if (!(await db.schema.hasTable('expense_payments'))) {
    await db.schema.createTable('expense_payments', (t: any) => {
      t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable();
      t.string('payment_number', 40).notNullable();
      t.uuid('account_id').nullable();       // payable account being settled
      t.date('payment_date').notNullable();
      t.string('payment_method', 50).defaultTo('bank_transfer');
      t.string('reference', 100).nullable();
      t.decimal('amount', 18, 2).notNullable();
      t.uuid('bank_account_id').nullable();
      t.uuid('department_id').nullable();
      t.uuid('location_id').nullable();
      t.uuid('subsidiary_id').nullable();
      t.string('status', 30).defaultTo('posted');
      t.text('memo').nullable();
      t.boolean('is_posted').defaultTo(false);
      t.uuid('created_by').nullable();
      t.boolean('is_deleted').defaultTo(false);
      t.timestamps(true, true);
    });
  }
  if (!(await db.schema.hasTable('expense_payment_applications'))) {
    await db.schema.createTable('expense_payment_applications', (t: any) => {
      t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable();
      t.uuid('payment_id').notNullable();
      t.uuid('report_id').notNullable();
      t.decimal('applied_amount', 18, 2).notNullable();
      t.timestamps(true, true);
    });
  }
  _epEnsured = true;
}

// Approved expense reports still owing money for a given payable account.
router.get('/expense-open', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const accountId = req.query.accountId as string;
    await ensureExpensePaymentTables();
    if (!accountId) { res.json({ success: true, data: [] }); return; }
    const rows = await db('expense_reports')
      .where({ company_id: companyId, account_id: accountId })
      .whereIn('status', ['approved', 'partially_paid'])
      .where('is_posted', true)
      .select('id', 'report_number', 'employee_name', 'report_period_end', 'total_amount', 'amount_paid');
    const data = rows
      .map((r: any) => ({ ...r, balance_due: Number(r.total_amount) - Number(r.amount_paid || 0) }))
      .filter((r: any) => r.balance_due > 0.009);
    res.json({ success: true, data });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch open expense reports' }); }
});

router.get('/expense-payments', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureExpensePaymentTables();
    const data = await db('expense_payments as ep')
      .leftJoin('accounts as a', 'ep.account_id', 'a.id')
      .where({ 'ep.company_id': req.user!.companyId, 'ep.is_deleted': false })
      .select('ep.*', 'a.code as account_code', 'a.name as account_name')
      .orderBy('ep.payment_date', 'desc').limit(100);
    res.json({ success: true, data });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch expense payments' }); }
});

router.get('/expense-payments/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureExpensePaymentTables();
    const companyId = req.user!.companyId;
    const payment = await db('expense_payments as ep')
      .leftJoin('accounts as a', 'ep.account_id', 'a.id')
      .leftJoin('accounts as ba', 'ep.bank_account_id', 'ba.id')
      .leftJoin('departments as dep', 'ep.department_id', 'dep.id')
      .leftJoin('locations as loc', 'ep.location_id', 'loc.id')
      .leftJoin('subsidiaries as sub', 'ep.subsidiary_id', 'sub.id')
      .where({ 'ep.id': req.params.id, 'ep.company_id': companyId, 'ep.is_deleted': false })
      .select('ep.*', 'a.code as account_code', 'a.name as account_name',
        'ba.code as bank_account_code', 'ba.name as bank_account_name',
        'dep.name as department_name', 'loc.name as location_name', 'sub.name as subsidiary_name')
      .first();
    if (!payment) { res.status(404).json({ success: false, error: 'Payment not found' }); return; }
    const applications = await db('expense_payment_applications as epa')
      .join('expense_reports as er', 'epa.report_id', 'er.id')
      .where({ 'epa.payment_id': payment.id })
      .select('epa.*', 'er.report_number', 'er.employee_name', 'er.report_period_end', 'er.total_amount', 'er.status as report_status');
    const journalEntries = await fetchJEWithLines('expense_payment', payment.id, db);
    res.json({ success: true, data: { ...payment, applications, journalEntries } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch expense payment' }); }
});

router.post('/expense-payments', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.accountId) { res.status(400).json({ success: false, error: 'Account is required' }); return; }
    if (!d.amount || Number(d.amount) <= 0) { res.status(400).json({ success: false, error: 'Amount must be > 0' }); return; }
    if (!d.bankAccountId) { res.status(400).json({ success: false, error: 'Bank account is required' }); return; }
    await ensureExpensePaymentTables();

    const result = await db.transaction(async (trx) => {
      const payNumber = `EXPAY-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
      const [payment] = await trx('expense_payments').insert({
        company_id: companyId, payment_number: payNumber,
        account_id: d.accountId, payment_date: d.paymentDate || new Date(),
        payment_method: d.paymentMethod || 'bank_transfer', reference: d.reference || null,
        amount: Number(d.amount), bank_account_id: d.bankAccountId,
        department_id: d.departmentId || null, location_id: d.locationId || null, subsidiary_id: d.subsidiaryId || null,
        status: 'posted', memo: d.memo || null, is_posted: false, created_by: req.user!.id,
      }).returning('*');

      // Apply to expense reports
      let applied = 0;
      let remaining = Number(d.amount);
      for (const app of (d.applications || [])) {
        if (remaining <= 0) break;
        const rep = await trx('expense_reports').where({ id: app.reportId, company_id: companyId }).first();
        if (!rep) continue;
        const balance = Number(rep.total_amount) - Number(rep.amount_paid || 0);
        const applyAmt = Math.min(remaining, balance, Number(app.amount) || balance);
        if (applyAmt <= 0) continue;
        await trx('expense_payment_applications').insert({ company_id: companyId, payment_id: payment.id, report_id: rep.id, applied_amount: applyAmt });
        const newPaid = Number(rep.amount_paid || 0) + applyAmt;
        await trx('expense_reports').where({ id: rep.id }).update({
          amount_paid: newPaid,
          status: newPaid >= Number(rep.total_amount) - 0.009 ? 'paid' : 'partially_paid',
        });
        applied += applyAmt; remaining -= applyAmt;
      }

      // GL: Dr. payable account (settle liability) / Cr. bank
      const bankAcct = await trx('accounts').where({ id: d.bankAccountId }).first();
      const payableAcct = await trx('accounts').where({ id: d.accountId }).first();
      if (bankAcct && payableAcct) {
        await AccountingEngine.createJournalEntry({
          companyId, subsidiaryId: d.subsidiaryId || undefined,
          date: d.paymentDate || new Date().toISOString().split('T')[0],
          sourceType: 'expense_payment', sourceId: payment.id,
          memo: `Expense Payment ${payNumber}`,
          lines: [
            { accountId: payableAcct.id, debit: Number(d.amount), credit: 0, departmentId: d.departmentId || undefined, locationId: d.locationId || undefined, memo: `Settle expense payable` },
            { accountId: bankAcct.id, debit: 0, credit: Number(d.amount), departmentId: d.departmentId || undefined, locationId: d.locationId || undefined, memo: `Expense payment` },
          ],
          createdBy: req.user!.id, trx,
        });
        await trx('expense_payments').where({ id: payment.id }).update({ is_posted: true });
      }
      return await trx('expense_payments').where({ id: payment.id }).first();
    });

    res.status(201).json({ success: true, data: result });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: e.message || 'Failed to record expense payment' }); }
});

export default router;

// ── Audit routes ──────────────────────────────────────────────────────────────
router.get('/expense-payments/:id/audit', async (req: any, res: any) => {
  try { const l = await (db as any)('transaction_audit_log').where({ company_id: req.user.companyId, source_type: 'expense_payment', source_id: req.params.id }).orderBy('performed_at','desc').limit(200); res.json({ success:true, data:l }); } catch(e:any){ res.status(500).json({success:false,error:e.message}); }
});
router.get('/expenses/:id/audit', async (req: any, res: any) => {
  try { const l = await (db as any)('transaction_audit_log').where({ company_id: req.user.companyId, source_type: 'expense_report', source_id: req.params.id }).orderBy('performed_at','desc').limit(200); res.json({ success:true, data:l }); } catch(e:any){ res.status(500).json({success:false,error:e.message}); }
});
