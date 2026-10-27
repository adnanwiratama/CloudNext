import { Router, Request, Response } from 'express';
import db from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { enforcePermissions } from '../../middleware/permissions';
import { resolveTransactionNumber } from '../../utils/sequence';
import { AccountingEngine } from '../../engines/accounting/accountingEngine';
import { resolveApprover, creationApprovalState } from '../../utils/approvals';
import { getConfiguredApproverInfo } from '../../utils/approvals';
import { fetchJEWithLines } from '../../utils/transactionAudit';

const router = Router();
router.use(authenticate);
router.use(enforcePermissions);

// Ensure bank_deposit_lines carries entity references (customer/vendor/employee)
// so a deposit line can record who the money came from.
let _depLineColsEnsured = false;
async function ensureDepositLineColumns(): Promise<void> {
  if (_depLineColsEnsured) return;
  const addCol = async (col: string, build: (t: any) => void) => {
    if (!(await db.schema.hasColumn('bank_deposit_lines', col))) {
      await db.schema.alterTable('bank_deposit_lines', build);
    }
  };
  await addCol('entity_customer_id', (t: any) => t.uuid('entity_customer_id').nullable());
  await addCol('entity_vendor_id',   (t: any) => t.uuid('entity_vendor_id').nullable());
  await addCol('entity_employee_id', (t: any) => t.uuid('entity_employee_id').nullable());
  _depLineColsEnsured = true;
}

// ─── Write Checks ─────────────────────────────────────────────────────────────
router.get('/write-checks', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('bank_checks as bc')
      .leftJoin('accounts as ba', 'bc.bank_account_id', 'ba.id')
      .leftJoin('vendors as v',   'bc.vendor_id',       'v.id')
      .where({ 'bc.company_id': req.user!.companyId })
      .select('bc.*', 'ba.name as bank_account_name', 'v.name as vendor_name')
      .orderBy('bc.created_at', 'desc').limit(100);  // Recently Created = newest first
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to fetch checks' }); }
});

// GET single check by ID
router.get('/checks/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const check = await db('bank_checks as bc')
      .leftJoin('accounts as ba',         'bc.bank_account_id',    'ba.id')
      .leftJoin('accounts as ea',         'bc.expense_account_id', 'ea.id')
      .leftJoin('vendors as v',           'bc.vendor_id',          'v.id')
      .leftJoin('users as u',             'bc.created_by',         'u.id')
      .leftJoin('departments as dept',    'bc.department_id',      'dept.id')
      .leftJoin('locations as loc',       'bc.location_id',        'loc.id')
      .leftJoin('subsidiaries as sub',    'bc.subsidiary_id',      'sub.id')
      .leftJoin('accounting_periods as ap','bc.posting_period_id', 'ap.id')
      .where({ 'bc.id': req.params.id, 'bc.company_id': req.user!.companyId })
      .select(
        'bc.*',
        'ba.name as bank_account_name', 'ba.code as bank_account_code',
        'ea.name as expense_account_name', 'ea.code as expense_account_code',
        'v.name as vendor_name', 'v.address as vendor_address',
        'u.name as created_by_name',
        'dept.name as department_name',
        'loc.name as location_name',
        'sub.name as subsidiary_name',
        'ap.name as posting_period_name',
      )
      .first();
    if (!check) { res.status(404).json({ success: false, error: 'Check not found' }); return; }

    // Get expense lines
    const lines = await db('bank_check_lines as bcl')
      .leftJoin('accounts as a',    'bcl.account_id',  'a.id')
      .leftJoin('locations as loc', 'bcl.location_id', 'loc.id')
      .where({ 'bcl.check_id': req.params.id })
      .select(
        'bcl.*',
        'a.name as account_name', 'a.code as account_code',
        'loc.name as location_name',
        // department join via raw cast to avoid varchar/uuid mismatch
        db.raw(`(SELECT name FROM departments WHERE id = bcl.department::uuid) as department_name`)
      )
      .orderBy('bcl.line_number')
      .catch((err: any) => { console.error('[LINES ERROR]', err.message); return []; });

    // Get item lines (bank_check_item_lines)
    const itemLines = await db('bank_check_item_lines as bcil')
      .leftJoin('items as i',        'bcil.item_id',    'i.id')
      .leftJoin('accounts as invAcc','i.inventory_account_id','invAcc.id')
      .leftJoin('locations as loc',  'bcil.location_id', 'loc.id')
      .where({ 'bcil.check_id': req.params.id })
      .select(
        'bcil.*',
        'i.name as item_name', 'i.item_code',
        'i.inventory_account_id',
        'invAcc.name as inventory_account_name', 'invAcc.code as inventory_account_code',
        'loc.name as location_name',
        db.raw(`(SELECT name FROM departments WHERE id = bcil.department::uuid) as department_name`)
      )
      .orderBy('bcil.line_number')
      .catch((err: any) => { console.error('[ITEM LINES ERROR]', err.message); return []; });

    // Get linked journal entry
    const journalEntry = await db('journal_entries')
      .where({ source_type: 'bank_check', source_id: req.params.id })
      .select('id', 'journal_number', 'status')
      .first()
      .catch(() => null);

    const cfgChk = await getConfiguredApproverInfo(req.user!.companyId, 'bank_checks');
    res.json({ success: true, data: { ...check, lines, itemLines, journalEntry: journalEntry || null, configured_approver_id: cfgChk?.id||null, configured_approver_name: cfgChk?.name||null } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch check' }); }
});

router.post('/write-checks', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.bankAccountId) { res.status(400).json({ success: false, error: 'Bank Account is required' }); return; }
    if (!d.amount || Number(d.amount) <= 0) { res.status(400).json({ success: false, error: 'Amount must be greater than 0' }); return; }

    // Transaction/document number follows the Auto-Generated Number setup
    // (transaction_sequences 'bank_check'). If override is allowed and a manual
    // document number is supplied, it is used; otherwise it is auto-generated.
    const docNumber = await resolveTransactionNumber(companyId, 'bank_check', d.documentNumber);
    const chkAppr = await creationApprovalState(companyId, 'bank_checks');

    // check_number field = user-supplied manual check # (for the physical bank check #)
    const [check] = await db('bank_checks').insert({
      company_id: companyId,
      check_number: docNumber,                          // transaction number = doc number
      document_number: docNumber,
      check_number_manual: d.checkNumber || null,       // user-entered physical check # field
      check_date: d.checkDate || new Date(),
      pay_to: d.payTo,
      vendor_id: d.vendorId || null,
      bank_account_id: d.bankAccountId,
      expense_account_id: d.expenseAccountId || null,
      amount: Number(d.amount),
      memo: d.memo || null,
      address: d.address || null,
      department_id: d.departmentId || null,
      location_id: d.locationId || null,
      subsidiary_id: d.subsidiaryId || null,
      posting_period_id: d.postingPeriodId || null,
      status: 'issued',
      approval_status: chkAppr.approvalStatus,
      created_by: req.user!.id,
    }).returning('*');

    // Save expense lines
    const lines = d.lines || [];
    if (lines.length > 0) {
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        await db('bank_check_lines').insert({
          check_id: check.id,
          line_number: i + 1,
          account_id: l.accountId || null,
          amount: Number(l.amount || 0),
          tax_code: l.taxCode || null,
          tax_rate: Number(l.taxRate || 0),
          tax_amt: Number(l.taxAmt || 0),
          gross_amt: Number(l.grossAmt || l.amount || 0),
          memo: l.memo || null,
          department: l.department || null,
          location_id: l.location || null,
          customer: l.customer || null,
          billable: l.billable || false,
        });
      }
    }

    // Save item lines
    const itemLines = d.itemLines || [];
    if (itemLines.length > 0) {
      for (let i = 0; i < itemLines.length; i++) {
        const l = itemLines[i];
        await db('bank_check_item_lines').insert({
          check_id: check.id,
          line_number: i + 1,
          item_id: l.itemId || null,
          description: l.description || null,
          quantity: Number(l.quantity || 1),
          unit: l.unit || null,
          unit_price: Number(l.unitPrice || 0),
          amount: Number(l.amount || 0),
          tax_code: l.taxCode || null,
          tax_rate: Number(l.taxRate || 0),
          tax_amt: Number(l.taxAmt || 0),
          gross_amt: Number(l.grossAmt || l.amount || 0),
          memo: l.memo || null,
          department: l.department || null,
          location_id: l.location || null,
        }).catch((err: any) => console.error('[ITEM LINE ERROR]', err.message));
      }
    }

    // Auto post GL: Dr. Expense/Item/PPN → Cr. Bank (balance with grossAmt)
    // Only create JE if no approval required (immediate posting)
    if (!chkAppr.approvalRequired) {
      try {
        const jeNum = `JE-CHK-${docNumber}`;
        const [je] = await db('journal_entries').insert({
          company_id: companyId,
          journal_number: jeNum,
          entry_date: d.checkDate || new Date(),
          memo: `Write Check - ${d.payTo} - ${docNumber}`,
          source_type: 'bank_check',
          source_id: check.id,
          status: 'posted',
          created_by: req.user!.id,
        }).returning('id');
        const jeId = je?.id || je;

        let lineNum = 1;
        let totalDebit = 0;

      // Dr. each expense line (by amount, not grossAmt — PPN posted separately)
      for (const l of lines) {
        if (l.accountId && Number(l.amount) > 0) {
          await db('journal_entry_lines').insert({
            journal_id: jeId, line_number: lineNum++,
            account_id: l.accountId,
            debit: Number(l.amount), credit: 0,
            debit_base: Number(l.amount), credit_base: 0,
            memo: l.memo || `Expense - ${d.payTo}`,
          });
          totalDebit += Number(l.amount);
        }
        // Dr. PPN per expense line if any tax
        if (l.accountId && Number(l.taxAmt) > 0) {
          // find PPN account (tax_payable)
          const ppnAcct = await db('accounts')
            .where({ company_id: companyId })
            .whereIn('code', ['2300','2301'])
            .first()
            .catch(() => null);
          if (ppnAcct) {
            await db('journal_entry_lines').insert({
              journal_id: jeId, line_number: lineNum++,
              account_id: ppnAcct.id,
              debit: Number(l.taxAmt), credit: 0,
              debit_base: Number(l.taxAmt), credit_base: 0,
              memo: `PPN Input Tax`,
            });
            totalDebit += Number(l.taxAmt);
          } else {
            totalDebit += Number(l.taxAmt);
          }
        }
      }

      // Dr. each item line via inventory account from master item
      for (const l of itemLines) {
        if (l.itemId && Number(l.amount) > 0) {
          const item = await db('items').where({ id: l.itemId }).first().catch(() => null);
          const acctId = item?.inventory_account_id || item?.expense_account_id || null;
          if (acctId) {
            await db('journal_entry_lines').insert({
              journal_id: jeId, line_number: lineNum++,
              account_id: acctId,
              debit: Number(l.amount), credit: 0,
              debit_base: Number(l.amount), credit_base: 0,
              memo: `${item?.name || ''} - ${d.payTo}`.trim(),
            });
            totalDebit += Number(l.amount);
          }
          // Dr. PPN for item if any
          if (Number(l.taxAmt) > 0) {
            const ppnAcct = await db('accounts').where({ company_id: companyId }).whereIn('code', ['2300','2301']).first().catch(() => null);
            if (ppnAcct) {
              await db('journal_entry_lines').insert({
                journal_id: jeId, line_number: lineNum++,
                account_id: ppnAcct.id,
                debit: Number(l.taxAmt), credit: 0,
                debit_base: Number(l.taxAmt), credit_base: 0,
                memo: `PPN Input Tax (Items)`,
              });
              totalDebit += Number(l.taxAmt);
            } else {
              totalDebit += Number(l.taxAmt);
            }
          }
        }
      }

      // Cr. Bank = total all debits (ensures balance)
      if (totalDebit > 0) {
        await db('journal_entry_lines').insert({
          journal_id: jeId, line_number: lineNum,
          account_id: d.bankAccountId,
          debit: 0, credit: totalDebit,
          debit_base: 0, credit_base: totalDebit,
          memo: `Bank payment - ${docNumber}`,
        });
      }
      // Record header totals so JE lists show the amount.
      await db('journal_entries').where({ id: jeId }).update({ total_debit: totalDebit, total_credit: totalDebit });
      } catch (glErr: any) { console.error('[GL ERROR] Write Check GL:', glErr.message); }
    }

    // Log creation
    try {
      await db('transaction_audit_log').insert({
        company_id: companyId,
        source_type: 'bank_check',
        source_id: check.id,
        action: 'created',
        context: 'UI',
        change_type: 'Set',
        description: `Check ${check.check_number} created`,
        performed_by: req.user!.id,
        performed_by_name: (req as any).user?.name || 'System',
        ip_address: req.ip || null,
        performed_at: new Date(),
      });
    } catch (_) {}

    res.status(201).json({ success: true, data: check });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to record check' }); }
});

// GET audit log for a check
router.get('/checks/:id/audit', async (req: Request, res: Response): Promise<void> => {
  try {
    const logs = await db('transaction_audit_log')
      .where({ source_type: 'bank_check', source_id: req.params.id })
      .orderBy('performed_at', 'desc');
    res.json({ success: true, data: logs });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to fetch audit log' }); }
});

// PUT /checks/:id — update existing check
router.put('/checks/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    const checkId = req.params.id;

    const existing = await db('bank_checks').where({ id: checkId, company_id: companyId }).first();
    if (!existing) { res.status(404).json({ success: false, error: 'Check not found' }); return; }

    await db('bank_checks').where({ id: checkId }).update({
      bank_account_id: d.bankAccountId || existing.bank_account_id,
      check_date: d.checkDate || existing.check_date,
      check_number: d.checkNumber || existing.check_number,
      pay_to: d.payTo || existing.pay_to,
      vendor_id: d.vendorId !== undefined ? d.vendorId : existing.vendor_id,
      amount: Number(d.amount) || existing.amount,
      memo: d.memo ?? existing.memo,
      department_id: d.departmentId !== undefined ? d.departmentId : existing.department_id,
      location_id: d.locationId !== undefined ? d.locationId : existing.location_id,
      subsidiary_id: d.subsidiaryId !== undefined ? d.subsidiaryId : existing.subsidiary_id,
      posting_period_id: d.postingPeriodId !== undefined ? d.postingPeriodId : existing.posting_period_id,
      updated_at: new Date(),
    });

    // Update lines: delete old, insert new
    if (d.lines && d.lines.length > 0) {
      await db('bank_check_lines').where({ check_id: checkId }).delete();
      for (let i = 0; i < d.lines.length; i++) {
        const l = d.lines[i];
        await db('bank_check_lines').insert({
          check_id: checkId,
          line_number: i + 1,
          account_id: l.accountId || null,
          amount: Number(l.amount || 0),
          tax_code: l.taxCode || null,
          tax_rate: Number(l.taxRate || 0),
          tax_amt: Number(l.taxAmt || 0),
          gross_amt: Number(l.grossAmt || l.amount || 0),
          memo: l.memo || null,
          department: l.department || null,
          location_id: l.location || null,
          customer: l.customer || null,
          billable: l.billable || false,
        });
      }
    }

    const [updated] = await db('bank_checks').where({ id: checkId }).returning('*');

    // Re-post GL: delete old JE lines and re-create
    try {
      const existingJE = await db('journal_entries')
        .where({ source_type: 'bank_check', source_id: checkId })
        .first();

      const expLines  = d.lines     || [];
      const itmLines  = d.itemLines || [];
      const bankAccId = d.bankAccountId || existing.bank_account_id;

      if (existingJE && (expLines.length > 0 || itmLines.length > 0)) {
        // Delete old lines
        await db('journal_entry_lines').where({ journal_id: existingJE.id }).delete();

        let lineNum   = 1;
        let totalDebt = 0;

        for (const l of expLines) {
          if (l.accountId && Number(l.amount) > 0) {
            await db('journal_entry_lines').insert({ journal_id: existingJE.id, line_number: lineNum++, account_id: l.accountId, debit: Number(l.amount), credit: 0, memo: l.memo || `Expense` });
            totalDebt += Number(l.amount);
          }
          if (Number(l.taxAmt) > 0) {
            const ppn = await db('accounts').where({ company_id: companyId }).whereIn('code', ['2300','2301']).first().catch(() => null);
            if (ppn) { await db('journal_entry_lines').insert({ journal_id: existingJE.id, line_number: lineNum++, account_id: ppn.id, debit: Number(l.taxAmt), credit: 0, memo: 'PPN Input Tax' }); }
            totalDebt += Number(l.taxAmt);
          }
        }

        for (const l of itmLines) {
          if (l.itemId && Number(l.amount) > 0) {
            const item = await db('items').where({ id: l.itemId }).first().catch(() => null);
            const acctId = item?.inventory_account_id || item?.expense_account_id || null;
            if (acctId) { await db('journal_entry_lines').insert({ journal_id: existingJE.id, line_number: lineNum++, account_id: acctId, debit: Number(l.amount), credit: 0, memo: `${item?.name||''} - Item` }); }
            totalDebt += Number(l.amount);
          }
          if (Number(l.taxAmt) > 0) {
            const ppn = await db('accounts').where({ company_id: companyId }).whereIn('code', ['2300','2301']).first().catch(() => null);
            if (ppn) { await db('journal_entry_lines').insert({ journal_id: existingJE.id, line_number: lineNum++, account_id: ppn.id, debit: Number(l.taxAmt), credit: 0, memo: 'PPN Input Tax (Items)' }); }
            totalDebt += Number(l.taxAmt);
          }
        }

        if (totalDebt > 0) {
          await db('journal_entry_lines').insert({ journal_id: existingJE.id, line_number: lineNum, account_id: bankAccId, debit: 0, credit: totalDebt, memo: `Bank payment - ${updated.check_number}` });
        }
        await db('journal_entries').where({ id: existingJE.id }).update({ memo: `Write Check - ${updated.pay_to} - ${updated.check_number}`, updated_at: new Date() });
      }
    } catch (glErr: any) { console.error('[GL UPDATE ERROR]', glErr.message); }

    // Log update dengan old/new values
    try {
      const changes: any[] = [];
      const fields: Record<string, { label: string; oldKey: keyof typeof existing }> = {
        check_date:       { label: 'Date',        oldKey: 'check_date' },
        pay_to:           { label: 'Payee',       oldKey: 'pay_to' },
        amount:           { label: 'Amount',      oldKey: 'amount' },
        memo:             { label: 'Memo',        oldKey: 'memo' },
        bank_account_id:  { label: 'Account',     oldKey: 'bank_account_id' },
      };
      for (const [col, meta] of Object.entries(fields)) {
        const oldVal = String(existing[meta.oldKey] ?? '');
        const newVal = String((d as any)[col] ?? (d as any)[Object.keys(d).find(k => k.replace(/([A-Z])/g,'_$1').toLowerCase() === col) || ''] ?? '');
        if (oldVal !== newVal && newVal) {
          changes.push({ field: meta.label, old_value: oldVal, new_value: newVal });
        }
      }
      if (changes.length > 0) {
        for (const ch of changes) {
          await db('transaction_audit_log').insert({
            company_id: companyId, source_type: 'bank_check', source_id: checkId,
            action: 'updated', context: 'UI', change_type: 'Change',
            field_name: ch.field, old_value: ch.old_value, new_value: ch.new_value,
            description: `${ch.field}: "${ch.old_value}" → "${ch.new_value}"`,
            performed_by: req.user!.id, performed_by_name: (req as any).user?.name || 'System',
            ip_address: req.ip || null, performed_at: new Date(),
          });
        }
      } else {
        await db('transaction_audit_log').insert({
          company_id: companyId, source_type: 'bank_check', source_id: checkId,
          action: 'updated', context: 'UI', change_type: 'Change',
          description: `Check ${updated.check_number} updated`,
          performed_by: req.user!.id, performed_by_name: (req as any).user?.name || 'System',
          ip_address: req.ip || null, performed_at: new Date(),
        });
      }
    } catch (_) {}

    res.json({ success: true, data: updated });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to update check' }); }
});

// ─── Make Deposit ─────────────────────────────────────────────────────────────
router.get('/deposits', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('bank_deposits as bd')
      .leftJoin('accounts as ba', 'bd.bank_account_id', 'ba.id')
      .where({ 'bd.company_id': req.user!.companyId })
      .select('bd.*', 'ba.name as bank_account_name')
      .orderBy('bd.deposit_date', 'desc').limit(100);
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to fetch deposits' }); }
});

router.post('/deposits', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureDepositLineColumns();
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.bankAccountId) { res.status(400).json({ success: false, error: 'Bank Account is required' }); return; }

    const depositNumber = await resolveTransactionNumber(companyId, 'bank_deposit', d.documentNumber);
    const lines = d.lines || [];
    const totalAmount = lines.reduce((s: number, l: any) => s + Number(l.amount || 0), 0);
    const depAppr = await creationApprovalState(companyId, 'bank_deposits');

    const result = await db.transaction(async (trx) => {
      const [deposit] = await trx('bank_deposits').insert({
        company_id: companyId,
        deposit_number: depositNumber,
        deposit_date: d.depositDate || new Date(),
        bank_account_id: d.bankAccountId,
        reference: d.reference || null,
        memo: d.memo || null,
        total_amount: totalAmount,
        department_id: d.departmentId || null,
        location_id: d.locationId || null,
        subsidiary_id: d.subsidiaryId || null,
        status: depAppr.nonPosting ? 'pending_approval' : 'posted',
        approval_status: depAppr.approvalStatus,
        created_by: req.user!.id,
      }).returning('*');

      // Save deposit lines
      if (lines.length > 0) {
        await trx('bank_deposit_lines').insert(lines.map((l: any, i: number) => ({
          deposit_id: deposit.id,
          line_number: i + 1,
          account_id: l.accountId || null,
          memo: l.memo || null,
          amount: Number(l.amount || 0),
          department_id: l.department || l.departmentId || null,
          location_id: l.location || l.locationId || null,
          entity_customer_id: l.entityCustomerId || null,
          entity_vendor_id: l.entityVendorId || null,
          entity_employee_id: l.entityEmployeeId || null,
        })));
      }

      // Post GL: Dr. Bank Account (total) → Cr. each source account
      try {
        const jeNumber = `JE-DEP-${depositNumber}`;
        const [je] = await trx('journal_entries').insert({
          company_id: companyId,
          subsidiary_id: d.subsidiaryId || null,
          journal_number: jeNumber,
          entry_date: d.depositDate || new Date(),
          memo: `Bank Deposit ${depositNumber}`,
          source_type: 'bank_deposit',
          source_id: deposit.id,
          department_id: d.departmentId || null,
          location_id: d.locationId || null,
          status: depAppr.nonPosting ? 'non_posting' : 'posted',
          total_debit: totalAmount,
          total_credit: totalAmount,
          posted_by: req.user!.id,
          posted_at: new Date(),
          created_by: req.user!.id,
        }).returning('*');

        const jeLines: any[] = [
          { journal_id: je.id, line_number: 1, account_id: d.bankAccountId, debit: totalAmount, credit: 0, debit_base: totalAmount, credit_base: 0, department_id: d.departmentId || null, location_id: d.locationId || null, memo: `Deposit ${depositNumber}` },
          ...lines.map((l: any, i: number) => ({
            journal_id: je.id, line_number: i + 2,
            account_id: l.accountId || null, debit: 0, credit: Number(l.amount || 0),
            debit_base: 0, credit_base: Number(l.amount || 0),
            department_id: l.department || l.departmentId || null,
            location_id: l.location || l.locationId || null,
            entity_customer_id: l.entityCustomerId || null,
            entity_vendor_id: l.entityVendorId || null,
            memo: l.memo || null,
          })),
        ];
        await trx('journal_entry_lines').insert(jeLines);
      } catch (glErr: any) { console.error('[GL WARNING] Deposit GL skipped:', glErr.message); }

      return deposit;
    });

    res.status(201).json({ success: true, data: { ...result, deposit_number: depositNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to record deposit' }); }
});

// PUT /deposits/:id — edit an existing deposit (re-posts the GL from scratch).
router.put('/deposits/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureDepositLineColumns();
    const d = req.body;
    const companyId = req.user!.companyId;
    const depositId = req.params.id;

    const existing = await db('bank_deposits').where({ id: depositId, company_id: companyId }).first();
    if (!existing) { res.status(404).json({ success: false, error: 'Deposit not found' }); return; }
    if (!d.bankAccountId) { res.status(400).json({ success: false, error: 'Bank Account is required' }); return; }

    const lines = d.lines || [];
    const totalAmount = lines.reduce((s: number, l: any) => s + Number(l.amount || 0), 0);
    const depositNumber = existing.deposit_number;

    await db.transaction(async (trx) => {
      await trx('bank_deposits').where({ id: depositId }).update({
        deposit_date: d.depositDate || existing.deposit_date,
        bank_account_id: d.bankAccountId,
        reference: d.reference ?? existing.reference,
        memo: d.memo ?? existing.memo,
        total_amount: totalAmount,
        department_id: d.departmentId ?? existing.department_id,
        location_id: d.locationId ?? existing.location_id,
        subsidiary_id: d.subsidiaryId ?? existing.subsidiary_id,
        updated_at: new Date(),
      });

      // Replace lines
      await trx('bank_deposit_lines').where({ deposit_id: depositId }).delete();
      if (lines.length > 0) {
        await trx('bank_deposit_lines').insert(lines.map((l: any, i: number) => ({
          deposit_id: depositId,
          line_number: i + 1,
          account_id: l.accountId || null,
          memo: l.memo || null,
          amount: Number(l.amount || 0),
          department_id: l.department || l.departmentId || null,
          location_id: l.location || l.locationId || null,
          entity_customer_id: l.entityCustomerId || null,
          entity_vendor_id: l.entityVendorId || null,
          entity_employee_id: l.entityEmployeeId || null,
        })));
      }

      // Re-post GL: reuse the existing journal entry, replace its lines.
      try {
        let je = await trx('journal_entries').where({ source_type: 'bank_deposit', source_id: depositId }).first();
        if (je) {
          await trx('journal_entries').where({ id: je.id }).update({
            entry_date: d.depositDate || existing.deposit_date,
            memo: `Bank Deposit ${depositNumber}`,
            department_id: d.departmentId ?? existing.department_id,
            location_id: d.locationId ?? existing.location_id,
            subsidiary_id: d.subsidiaryId ?? existing.subsidiary_id,
            total_debit: totalAmount, total_credit: totalAmount,
            updated_at: new Date(),
          });
          await trx('journal_entry_lines').where({ journal_id: je.id }).delete();
        } else {
          [je] = await trx('journal_entries').insert({
            company_id: companyId, subsidiary_id: d.subsidiaryId || null,
            journal_number: `JE-DEP-${depositNumber}`, entry_date: d.depositDate || existing.deposit_date,
            memo: `Bank Deposit ${depositNumber}`, source_type: 'bank_deposit', source_id: depositId,
            status: 'posted', total_debit: totalAmount, total_credit: totalAmount,
            posted_by: req.user!.id, posted_at: new Date(), created_by: req.user!.id,
          }).returning('*');
        }
        const jeLines: any[] = [
          { journal_id: je.id, line_number: 1, account_id: d.bankAccountId, debit: totalAmount, credit: 0, debit_base: totalAmount, credit_base: 0, department_id: d.departmentId || null, location_id: d.locationId || null, memo: `Deposit ${depositNumber}` },
          ...lines.map((l: any, i: number) => ({
            journal_id: je.id, line_number: i + 2,
            account_id: l.accountId || null, debit: 0, credit: Number(l.amount || 0),
            debit_base: 0, credit_base: Number(l.amount || 0),
            department_id: l.department || l.departmentId || null,
            location_id: l.location || l.locationId || null,
            entity_customer_id: l.entityCustomerId || null,
            entity_vendor_id: l.entityVendorId || null,
            memo: l.memo || null,
          })),
        ];
        await trx('journal_entry_lines').insert(jeLines);
      } catch (glErr: any) { console.error('[GL WARNING] Deposit update GL skipped:', glErr.message); }
    });

    const updated = await db('bank_deposits').where({ id: depositId }).first();
    res.json({ success: true, data: { ...updated, deposit_number: depositNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to update deposit' }); }
});

// ─── Transfer Funds ───────────────────────────────────────────────────────────
router.get('/transfers', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('bank_transfers as bt')
      .leftJoin('accounts as fa', 'bt.from_account_id', 'fa.id')
      .leftJoin('accounts as ta', 'bt.to_account_id', 'ta.id')
      .where({ 'bt.company_id': req.user!.companyId })
      .select('bt.*', 'fa.name as from_account_name', 'ta.name as to_account_name')
      .orderBy('bt.transfer_date', 'desc').limit(100);
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to fetch transfers' }); }
});

router.post('/transfers', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.fromAccountId || !d.toAccountId) { res.status(400).json({ success: false, error: 'Both accounts are required' }); return; }
    if (d.fromAccountId === d.toAccountId) { res.status(400).json({ success: false, error: 'From and To must be different' }); return; }
    if (!d.amount || Number(d.amount) <= 0) { res.status(400).json({ success: false, error: 'Amount must be greater than 0' }); return; }

    const transferNumber = await resolveTransactionNumber(companyId, 'bank_transfer', d.documentNumber);
    const tfrAppr = await creationApprovalState(companyId, 'bank_transfers');

    const [transfer] = await db('bank_transfers').insert({
      company_id: companyId,
      transfer_number: transferNumber,
      transfer_date: d.transferDate || new Date(),
      from_account_id: d.fromAccountId,
      to_account_id: d.toAccountId,
      amount: Number(d.amount),
      reference: d.reference || null,
      memo: d.memo || null,
      status: tfrAppr.nonPosting ? 'pending_approval' : 'posted',
      approval_status: tfrAppr.approvalStatus,
      created_by: req.user!.id,
    }).returning('*');

    // Auto post GL: Dr. To Account → Cr. From Account
    try {
      const jeNumber = `JE-TRF-${transferNumber}`;
      const [je] = await db('journal_entries').insert({
        company_id: companyId,
        subsidiary_id: d.subsidiaryId || null,
        journal_number: jeNumber,
        entry_date: d.transferDate || new Date(),
        memo: `Fund Transfer ${transferNumber}`,
        source_type: 'bank_transfer',
        source_id: transfer.id,
        department_id: d.departmentId || null,
        location_id: d.locationId || null,
        status: tfrAppr.nonPosting ? 'non_posting' : 'posted',
        total_debit: Number(d.amount),
        total_credit: Number(d.amount),
        posted_by: tfrAppr.nonPosting ? null : req.user!.id,
        posted_at: tfrAppr.nonPosting ? null : new Date(),
        created_by: req.user!.id,
      }).returning('*');

      await db('journal_entry_lines').insert([
        { journal_id: je.id, line_number: 1, account_id: d.toAccountId, debit: Number(d.amount), credit: 0, department_id: d.departmentId || null, location_id: d.locationId || null, memo: `Transfer in ${transferNumber}` },
        { journal_id: je.id, line_number: 2, account_id: d.fromAccountId, debit: 0, credit: Number(d.amount), department_id: d.departmentId || null, location_id: d.locationId || null, memo: `Transfer out ${transferNumber}` },
      ]);
    } catch (glErr: any) { console.error('[GL WARNING] Transfer GL skipped:', glErr.message); }

    res.status(201).json({ success: true, data: { ...transfer, transfer_number: transferNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to record transfer' }); }
});

// ─── Get single Deposit ───────────────────────────────────────────────────────
router.get('/deposits/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const deposit = await db('bank_deposits as bd')
      .leftJoin('accounts as ba', 'bd.bank_account_id', 'ba.id')
      .leftJoin('departments as d', 'bd.department_id', 'd.id')
      .leftJoin('locations as l', 'bd.location_id', 'l.id')
      .leftJoin('subsidiaries as s', 'bd.subsidiary_id', 's.id')
      .where({ 'bd.id': req.params.id, 'bd.company_id': req.user!.companyId })
      .select('bd.*', 'ba.name as bank_account_name', 'ba.code as bank_account_code',
        'd.name as department_name', 'l.name as location_name', 's.name as subsidiary_name')
      .first();
    if (!deposit) { res.status(404).json({ success: false, error: 'Deposit not found' }); return; }
    // lines (if table exists) — enrich with the entity (customer/vendor/employee) label.
    let lines: any[] = [];
    try {
      await ensureDepositLineColumns();
      lines = await db('bank_deposit_lines as bdl')
        .leftJoin('accounts as a', 'bdl.account_id', 'a.id')
        .leftJoin('departments as d', 'bdl.department_id', 'd.id')
        .leftJoin('locations as l', 'bdl.location_id', 'l.id')
        .leftJoin('customers as c', 'bdl.entity_customer_id', 'c.id')
        .leftJoin('vendors as v', 'bdl.entity_vendor_id', 'v.id')
        .leftJoin('users as u', 'bdl.entity_employee_id', 'u.id')
        .where({ 'bdl.deposit_id': deposit.id })
        .orderBy('bdl.line_number')
        .select('bdl.*', 'a.name as account_name', 'a.code as account_code', 'd.name as department_name', 'l.name as location_name',
          'c.name as customer_name', 'v.name as vendor_name', 'u.name as employee_name');
      lines = lines.map((l: any) => {
        let entityType: string | null = null, entityName: string | null = null;
        if (l.entity_customer_id) { entityType = 'customer'; entityName = l.customer_name; }
        else if (l.entity_vendor_id) { entityType = 'vendor'; entityName = l.vendor_name; }
        else if (l.entity_employee_id) { entityType = 'employee'; entityName = l.employee_name; }
        return { ...l, entity_type: entityType, entity_name: entityName };
      });
    } catch (_) { lines = []; }
    const journalEntries = await db('journal_entries').where({ source_type: 'bank_deposit', source_id: deposit.id }).first();
    const cfgDep = await getConfiguredApproverInfo(req.user!.companyId, 'bank_deposits');
    res.json({ success: true, data: { ...deposit, lines, journalEntry: journalEntries || null, configured_approver_id: cfgDep?.id||null, configured_approver_name: cfgDep?.name||null } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch deposit' }); }
});

// ─── Get single Transfer ──────────────────────────────────────────────────────
router.get('/transfers/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const transfer = await db('bank_transfers as bt')
      .leftJoin('accounts as fa', 'bt.from_account_id', 'fa.id')
      .leftJoin('accounts as ta', 'bt.to_account_id', 'ta.id')
      .leftJoin('departments as d', 'bt.department_id', 'd.id')
      .leftJoin('locations as l', 'bt.location_id', 'l.id')
      .leftJoin('subsidiaries as s', 'bt.subsidiary_id', 's.id')
      .where({ 'bt.id': req.params.id, 'bt.company_id': req.user!.companyId })
      .select('bt.*', 'fa.name as from_account_name', 'fa.code as from_account_code',
        'ta.name as to_account_name', 'ta.code as to_account_code',
        'd.name as department_name', 'l.name as location_name', 's.name as subsidiary_name')
      .first();
    if (!transfer) { res.status(404).json({ success: false, error: 'Transfer not found' }); return; }
    const journalEntry = await db('journal_entries').where({ source_type: 'bank_transfer', source_id: transfer.id }).first();
    const cfgTfr = await getConfiguredApproverInfo(req.user!.companyId, 'bank_transfers');
    res.json({ success: true, data: { ...transfer, journalEntry: journalEntry || null, configured_approver_id: cfgTfr?.id||null, configured_approver_name: cfgTfr?.name||null } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch transfer' }); }
});

export default router;

// ─── Approve / Reject helpers for bank transactions (GL-only, no inventory) ──

// Helper to create JE for bank check on approval
async function createBankCheckJE(check: any, userId: string, trx: any) {
  const jeNum = `JE-CHK-${check.document_number || check.check_number}`;
  const [je] = await trx('journal_entries').insert({
    company_id: check.company_id,
    journal_number: jeNum,
    entry_date: check.check_date || new Date(),
    memo: `Write Check - ${check.pay_to} - ${check.document_number || check.check_number}`,
    source_type: 'bank_check',
    source_id: check.id,
    status: 'posted',
    created_by: userId,
  }).returning('id');
  const jeId = je?.id || je;

  // Get expense lines and item lines
  const lines = await trx('bank_check_lines').where({ check_id: check.id });
  const itemLines = await trx('bank_check_item_lines').where({ check_id: check.id });

  let lineNum = 1;
  let totalDebit = 0;

  // Dr. each expense line
  for (const l of lines) {
    if (l.account_id && Number(l.amount) > 0) {
      await trx('journal_entry_lines').insert({
        journal_id: jeId, line_number: lineNum++,
        account_id: l.account_id,
        debit: Number(l.amount), credit: 0,
        debit_base: Number(l.amount), credit_base: 0,
        memo: l.memo || `Expense - ${check.pay_to}`,
      });
      totalDebit += Number(l.amount);
    }
    // Dr. PPN per expense line if any tax
    if (l.account_id && Number(l.tax_amt) > 0) {
      const ppnAcct = await trx('accounts')
        .where({ company_id: check.company_id })
        .whereIn('code', ['2300', '2301'])
        .first()
        .catch(() => null);
      if (ppnAcct) {
        await trx('journal_entry_lines').insert({
          journal_id: jeId, line_number: lineNum++,
          account_id: ppnAcct.id,
          debit: Number(l.tax_amt), credit: 0,
          debit_base: Number(l.tax_amt), credit_base: 0,
          memo: `PPN Input Tax`,
        });
        totalDebit += Number(l.tax_amt);
      } else {
        totalDebit += Number(l.tax_amt);
      }
    }
  }

  // Dr. each item line
  for (const l of itemLines) {
    if (l.item_id && Number(l.amount) > 0) {
      const item = await trx('items').where({ id: l.item_id }).first().catch(() => null);
      const acctId = item?.inventory_account_id || item?.expense_account_id || null;
      if (acctId) {
        await trx('journal_entry_lines').insert({
          journal_id: jeId, line_number: lineNum++,
          account_id: acctId,
          debit: Number(l.amount), credit: 0,
          debit_base: Number(l.amount), credit_base: 0,
          memo: `${item?.name || ''} - ${check.pay_to}`.trim(),
        });
        totalDebit += Number(l.amount);
      }
      // Dr. PPN for item if any
      if (Number(l.tax_amt) > 0) {
        const ppnAcct = await trx('accounts').where({ company_id: check.company_id }).whereIn('code', ['2300', '2301']).first().catch(() => null);
        if (ppnAcct) {
          await trx('journal_entry_lines').insert({
            journal_id: jeId, line_number: lineNum++,
            account_id: ppnAcct.id,
            debit: Number(l.tax_amt), credit: 0,
            debit_base: Number(l.tax_amt), credit_base: 0,
            memo: `PPN Input Tax (Items)`,
          });
          totalDebit += Number(l.tax_amt);
        } else {
          totalDebit += Number(l.tax_amt);
        }
      }
    }
  }

  // Cr. Bank = total all debits
  if (totalDebit > 0) {
    await trx('journal_entry_lines').insert({
      journal_id: jeId, line_number: lineNum,
      account_id: check.bank_account_id,
      debit: 0, credit: totalDebit,
      debit_base: 0, credit_base: totalDebit,
      memo: `Bank payment - ${check.document_number || check.check_number}`,
    });
  }

  // Record header totals
  await trx('journal_entries').where({ id: jeId }).update({ total_debit: totalDebit, total_credit: totalDebit });
  
  return jeId;
}

function bankApproveReject(table: string, sourceType: string, router: any) {
  router.post(`/${table === 'bank_checks' ? 'checks' : table === 'bank_deposits' ? 'deposits' : 'transfers'}/:id/approve`,
    async (req: any, res: any): Promise<void> => {
      try {
        const row = await db(table).where({ id: req.params.id, company_id: req.user.companyId }).first();
        if (!row) { res.status(404).json({ success: false, error: 'Record not found' }); return; }
        if (row.approval_status !== 'pending_approval') { res.status(400).json({ success: false, error: `Not pending approval (status: ${row.approval_status || 'approved'})` }); return; }
        const approver = await resolveApprover(req.user.companyId, table, req.user.id);
        await db.transaction(async (trx: any) => {
          // Check if JE already exists (for old records), otherwise create new JE
          const existingJE = await trx('journal_entries').where({ source_type: sourceType, source_id: row.id }).first();
          if (existingJE) {
            await AccountingEngine.postDeferredJournal(sourceType, row.id, req.user.id, trx);
          } else if (table === 'bank_checks') {
            // Create JE for bank check on approval
            await createBankCheckJE(row, req.user.id, trx);
          }
          await trx(table).where({ id: row.id }).update({ approval_status: 'approved', approved_by: approver, approved_at: new Date(), status: 'posted' });
        });
        const updated = await db(table).where({ id: row.id }).first();
        res.json({ success: true, data: updated, message: 'Approved' });
      } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: `Failed to approve: ${e.message}` }); }
    });

  router.post(`/${table === 'bank_checks' ? 'checks' : table === 'bank_deposits' ? 'deposits' : 'transfers'}/:id/reject`,
    async (req: any, res: any): Promise<void> => {
      try {
        const row = await db(table).where({ id: req.params.id, company_id: req.user.companyId }).first();
        if (!row) { res.status(404).json({ success: false, error: 'Record not found' }); return; }
        if (row.approval_status !== 'pending_approval') { res.status(400).json({ success: false, error: 'Not pending approval' }); return; }
        const reason = req.body?.reason || 'Rejected by approver';
        const [updated] = await db(table).where({ id: row.id })
          .update({ approval_status: 'draft', memo: `${row.memo || ''}\n[REJECTED] ${reason}`.trim() }).returning('*');
        res.json({ success: true, data: updated, message: 'Rejected' });
      } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: `Failed to reject: ${e.message}` }); }
    });
}

bankApproveReject('bank_checks', 'bank_check', router);
bankApproveReject('bank_deposits', 'bank_deposit', router);
bankApproveReject('bank_transfers', 'bank_transfer', router);

// ── Audit routes ──────────────────────────────────────────────────────────────
router.get('/deposits/:id/audit', async (req: any, res: any) => {
  try { const l = await (db as any)('transaction_audit_log').where({ company_id: req.user.companyId, source_type: 'bank_deposit', source_id: req.params.id }).orderBy('performed_at','desc').limit(200); res.json({ success:true, data:l }); } catch(e:any){ res.status(500).json({success:false,error:e.message}); }
});
router.get('/transfers/:id/audit', async (req: any, res: any) => {
  try { const l = await (db as any)('transaction_audit_log').where({ company_id: req.user.companyId, source_type: 'bank_transfer', source_id: req.params.id }).orderBy('performed_at','desc').limit(200); res.json({ success:true, data:l }); } catch(e:any){ res.status(500).json({success:false,error:e.message}); }
});


// ─── Submit for Approval (draft → pending_approval) ──────────────────────────
function bankSubmit(table: string, route: string, rtr: any) {
  rtr.post(`/${route}/:id/submit`, async (req: any, res: any) => {
    try {
      const row = await db(table).where({ id: req.params.id, company_id: req.user.companyId }).first();
      if (!row) { res.status(404).json({ success: false, error: 'Record not found' }); return; }
      if (!['draft', 'rejected'].includes(row.approval_status || 'draft')) { res.status(400).json({ success: false, error: `Cannot submit — status is ${row.approval_status}` }); return; }
      const [updated] = await db(table).where({ id: row.id }).update({ approval_status: 'pending_approval' }).returning('*');
      res.json({ success: true, data: updated, message: 'Submitted for approval' });
    } catch (e: any) { res.status(500).json({ success: false, error: `Failed: ${e.message}` }); }
  });
}

bankSubmit('bank_checks', 'checks', router);
bankSubmit('bank_deposits', 'deposits', router);
bankSubmit('bank_transfers', 'transfers', router);
