import { Router, Request, Response } from 'express';
import db from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { enforcePermissions } from '../../middleware/permissions';
import { getPaginationParams, buildPaginatedResult } from '../../utils/pagination';
import { generateTransactionNumber, resolveTransactionNumber } from '../../utils/sequence';
import { createAuditLog } from '../../utils/audit';
import { attachAuditRoute, logTransaction, fetchJEWithLines } from '../../utils/transactionAudit';
import { AccountingEngine } from '../../engines/accounting/accountingEngine';
import { InventoryEngine } from '../../engines/inventory/inventoryEngine';
import { AppError } from '../../middleware/errorHandler';
import { resolveApprover } from '../../utils/approvals';

const router = Router();
router.use(authenticate);
router.use(enforcePermissions);

// Ensure the payment_credit_applications table exists (created via migration 012,
// but ensured here so credit application works even before migrations are run).
let _pcaEnsured = false;
async function ensurePaymentCreditTable(trx: any = db): Promise<void> {
  if (_pcaEnsured) return;
  const exists = await trx.schema.hasTable('payment_credit_applications');
  if (!exists) {
    await trx.schema.createTable('payment_credit_applications', (t: any) => {
      t.uuid('id').primary().defaultTo(trx.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable();
      t.uuid('payment_id').notNullable();
      t.string('credit_type', 40).notNullable();
      t.uuid('credit_id').notNullable();
      t.decimal('applied_amount', 20, 4).notNullable();
      t.timestamps(true, true);
    });
  }
  _pcaEnsured = true;
}

// Ensure purchase_requisitions / lines have the columns the Quotation-style flow needs.
let _prColsEnsured = false;
async function ensurePrColumns(): Promise<void> {
  if (_prColsEnsured) return;
  const addCol = async (table: string, col: string, build: (t: any) => void) => {
    if (!(await db.schema.hasColumn(table, col))) {
      await db.schema.alterTable(table, build);
    }
  };
  await addCol('purchase_requisitions', 'required_date', (t: any) => t.date('required_date').nullable());
  await addCol('purchase_requisitions', 'priority', (t: any) => t.string('priority', 20).nullable());
  await addCol('purchase_requisitions', 'currency', (t: any) => t.string('currency', 10).nullable());
  await addCol('purchase_requisitions', 'tax_amount', (t: any) => t.decimal('tax_amount', 20, 4).defaultTo(0));
  await addCol('purchase_requisitions', 'shipping_amount', (t: any) => t.decimal('shipping_amount', 20, 4).defaultTo(0));
  await addCol('purchase_requisitions', 'discount_amount', (t: any) => t.decimal('discount_amount', 20, 4).defaultTo(0));
  await addCol('purchase_requisitions', 'approved_by', (t: any) => t.uuid('approved_by').nullable());
  await addCol('purchase_requisitions', 'approved_at', (t: any) => t.timestamp('approved_at').nullable());
  await addCol('purchase_requisitions', 'updated_by', (t: any) => t.uuid('updated_by').nullable());
  await addCol('purchase_requisitions', 'updated_at', (t: any) => t.timestamp('updated_at').nullable());
  await addCol('purchase_requisitions', 'converted_to_po_id', (t: any) => t.uuid('converted_to_po_id').nullable());
  await addCol('purchase_requisition_lines', 'line_number', (t: any) => t.integer('line_number').nullable());
  await addCol('purchase_requisition_lines', 'uom_id', (t: any) => t.uuid('uom_id').nullable());
  await addCol('purchase_requisition_lines', 'unit', (t: any) => t.string('unit', 50).nullable());
  _prColsEnsured = true;
}

// Ensure vendor-return / vendor-credit flow columns + the credit->bill application table.
let _vrcEnsured = false;
async function ensureVendorReturnCreditTables(): Promise<void> {
  if (_vrcEnsured) return;
  const addCol = async (table: string, col: string, build: (t: any) => void) => {
    if (!(await db.schema.hasColumn(table, col))) await db.schema.alterTable(table, build);
  };
  await addCol('vendor_returns', 'fulfilled_at', (t: any) => t.timestamp('fulfilled_at').nullable());
  await addCol('vendor_returns', 'fulfilled_by', (t: any) => t.uuid('fulfilled_by').nullable());
  await addCol('vendor_credits', 'vendor_return_id', (t: any) => t.uuid('vendor_return_id').nullable());
  if (!(await db.schema.hasColumn('vendor_return_lines', 'location_id'))) {
    await db.schema.alterTable('vendor_return_lines', (t: any) => t.uuid('location_id').nullable());
  }
  if (!(await db.schema.hasTable('vendor_credit_bill_applications'))) {
    await db.schema.createTable('vendor_credit_bill_applications', (t: any) => {
      t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable();
      t.uuid('credit_id').notNullable();
      t.uuid('bill_id').notNullable();
      t.decimal('applied_amount', 20, 4).notNullable();
      t.timestamps(true, true);
    });
  }
  _vrcEnsured = true;
}

// Ensure purchase_orders has a due_date column (added by migration 013).
let _poDueEnsured = false;
async function ensurePoDueDate(): Promise<void> {
  if (_poDueEnsured) return;
  if (!(await db.schema.hasColumn('purchase_orders', 'due_date'))) {
    await db.schema.alterTable('purchase_orders', (t: any) => { t.date('due_date').nullable(); });
  }
  _poDueEnsured = true;
}

// Apply vendor credits (prepayments / unapplied payments) to a bill payment.
// Records each application, reduces the source credit, and returns the total applied.
async function applyVendorCredits(trx: any, companyId: string, paymentId: string, credits: any[]): Promise<number> {
  if (!credits || credits.length === 0) return 0;
  await ensurePaymentCreditTable(trx);
  let total = 0;
  for (const c of credits) {
    const amt = Number(c.amount || 0);
    if (!c.creditId || amt <= 0) continue;
    if (c.creditType === 'vendor_prepayment') {
      const prep = await trx('vendor_prepayments').where({ id: c.creditId, company_id: companyId }).first();
      if (!prep) continue;
      const remaining = Number(prep.amount) - Number(prep.amount_applied || 0);
      const apply = Math.min(amt, remaining);
      if (apply <= 0) continue;
      const newApplied = Number(prep.amount_applied || 0) + apply;
      await trx('vendor_prepayments').where({ id: prep.id }).update({
        amount_applied: newApplied,
        status: newApplied >= Number(prep.amount) - 0.009 ? 'applied' : 'unapplied',
      });
      await trx('payment_credit_applications').insert({
        company_id: companyId, payment_id: paymentId, credit_type: 'vendor_prepayment', credit_id: prep.id, applied_amount: apply,
      });
      total += apply;
    } else if (c.creditType === 'vendor_payment') {
      const src = await trx('vendor_payments').where({ id: c.creditId, company_id: companyId }).first();
      if (!src) continue;
      const remaining = Number(src.unapplied_amount || 0);
      const apply = Math.min(amt, remaining);
      if (apply <= 0) continue;
      const newUnapplied = Math.max(0, remaining - apply);
      await trx('vendor_payments').where({ id: src.id }).update({
        unapplied_amount: newUnapplied,
        status: newUnapplied <= 0.009 ? 'applied' : src.status,
      });
      await trx('payment_credit_applications').insert({
        company_id: companyId, payment_id: paymentId, credit_type: 'vendor_payment', credit_id: src.id, applied_amount: apply,
      });
      total += apply;
    }
  }
  return total;
}

// Reverse previously-applied credits for a payment (used on edit/delete): restore
// each source credit's remaining balance and remove the application rows.
async function reverseVendorCredits(trx: any, companyId: string, paymentId: string): Promise<void> {
  const has = await trx.schema.hasTable('payment_credit_applications');
  if (!has) return;
  const apps = await trx('payment_credit_applications').where({ payment_id: paymentId });
  for (const a of apps) {
    if (a.credit_type === 'vendor_prepayment') {
      const prep = await trx('vendor_prepayments').where({ id: a.credit_id }).first();
      if (prep) {
        const newApplied = Math.max(0, Number(prep.amount_applied || 0) - Number(a.applied_amount));
        await trx('vendor_prepayments').where({ id: prep.id }).update({
          amount_applied: newApplied,
          status: newApplied <= 0.009 ? 'unapplied' : (newApplied >= Number(prep.amount) - 0.009 ? 'applied' : 'unapplied'),
        });
      }
    } else if (a.credit_type === 'vendor_payment') {
      const src = await trx('vendor_payments').where({ id: a.credit_id }).first();
      if (src) {
        await trx('vendor_payments').where({ id: src.id }).update({
          unapplied_amount: Number(src.unapplied_amount || 0) + Number(a.applied_amount),
          status: 'open',
        });
      }
    }
  }
  await trx('payment_credit_applications').where({ payment_id: paymentId }).del();
}

// Post the GL for a vendor payment, accounting for applied credits.
//   Dr. Accounts Payable        = bills settled (cash + credits applied to bills)
//   Cr. Bank                    = cash amount actually paid
//   Cr. Advance to Vendor (1130)= credits applied (prepayments / on-account payments)
// When there are no credits this is identical to the original AP/Bank entry.
async function postVendorPaymentWithCredits(trx: any, companyId: string, paymentId: string, creditsApplied: number, userId: string): Promise<void> {
  const payment = await trx('vendor_payments as p')
    .join('vendors as v', 'p.vendor_id', 'v.id')
    .select('p.*', 'v.name as vendor_name', 'v.ap_account_id as vendor_ap_account_id')
    .where('p.id', paymentId)
    .first();
  if (!payment) throw new AppError('Vendor payment not found', 404);
  if (payment.is_posted) return;

  const defaultBank = await AccountingEngine.getDefaultAccount(companyId, '1020', trx);
  const defaultAP = await AccountingEngine.getDefaultAccount(companyId, '2100', trx);
  const apAccountId = payment.ap_account_id || payment.vendor_ap_account_id || defaultAP;
  const bankAccountId = payment.bank_account_id || defaultBank;
  if (!apAccountId) throw new AppError('AP account not configured.', 400);

  const cash = Number(payment.amount);
  const credits = Number(creditsApplied || 0);
  // A bank account is only needed when actual cash leaves the bank.
  if (cash > 0.009 && !bankAccountId) throw new AppError('Bank account not configured.', 400);

  if (credits <= 0.009) {
    // No credits: original behaviour (Dr AP = cash / Cr Bank = cash)
    if (cash <= 0.009) { await trx('vendor_payments').where({ id: paymentId }).update({ is_posted: true }); return; }
    await AccountingEngine.createJournalEntry({
      companyId, date: payment.payment_date, sourceType: 'vendor_payment', sourceId: paymentId,
      subsidiaryId: payment.subsidiary_id || undefined,
      memo: `Vendor Payment ${payment.payment_number} - ${payment.vendor_name}`,
      lines: [
        { accountId: apAccountId, debit: cash, credit: 0, entityVendorId: payment.vendor_id, departmentId: payment.department_id || undefined, locationId: payment.location_id || undefined, memo: `AP Settlement - ${payment.vendor_name}` },
        { accountId: bankAccountId, debit: 0, credit: cash, departmentId: payment.department_id || undefined, locationId: payment.location_id || undefined, memo: `Payment to ${payment.vendor_name}` },
      ],
      createdBy: userId, trx,
    });
    await trx('vendor_payments').where({ id: paymentId }).update({ is_posted: true });
    return;
  }

  // With credits: AP settled = cash + credits; Bank = cash; Advance (1130) credited = credits
  const advanceAccountId = await AccountingEngine.getDefaultAccount(companyId, '1130', trx);
  if (!advanceAccountId) throw new AppError('Advance Payment account (1130) not configured.', 400);
  const apSettled = cash + credits;
  const lines: any[] = [
    { accountId: apAccountId, debit: apSettled, credit: 0, entityVendorId: payment.vendor_id, departmentId: payment.department_id || undefined, locationId: payment.location_id || undefined, memo: `AP Settlement - ${payment.vendor_name}` },
    { accountId: advanceAccountId, debit: 0, credit: credits, entityVendorId: payment.vendor_id, departmentId: payment.department_id || undefined, locationId: payment.location_id || undefined, memo: `Vendor credit applied - ${payment.vendor_name}` },
  ];
  if (cash > 0.009) {
    lines.push({ accountId: bankAccountId, debit: 0, credit: cash, departmentId: payment.department_id || undefined, locationId: payment.location_id || undefined, memo: `Payment to ${payment.vendor_name}` });
  }
  await AccountingEngine.createJournalEntry({
    companyId, date: payment.payment_date, sourceType: 'vendor_payment', sourceId: paymentId,
    subsidiaryId: payment.subsidiary_id || undefined,
    memo: `Vendor Payment ${payment.payment_number} - ${payment.vendor_name}`,
    lines, createdBy: userId, trx,
  });
  await trx('vendor_payments').where({ id: paymentId }).update({ is_posted: true });
}

// ===== PURCHASE REQUISITIONS =====
router.get('/requisitions', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensurePrColumns();
    const { page, limit } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    const query = db('purchase_requisitions as pr')
      .leftJoin('users as u', db.raw('u.id::text = pr.requested_by'))
      .leftJoin('departments as d', 'pr.department_id', 'd.id')
      .where({ 'pr.company_id': companyId, 'pr.is_deleted': false })
      .select('pr.*', 'pr.requisition_number as pr_number', db.raw('COALESCE(u.name, pr.requested_by) as requested_by_name'), 'd.name as department_name');
    if (req.query.status) query.where({ 'pr.status': req.query.status });
    const total = parseInt((await query.clone().clearSelect().count('* as count').first() as any)?.count || '0');
    const data = await query.orderBy('pr.request_date', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch requisitions' }); }
});

router.post('/requisitions', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensurePrColumns();
    const companyId = req.user!.companyId;
    const d = req.body;
    const prNumber = await resolveTransactionNumber(companyId, 'purchase_requisition', req.body?.documentNumber, db);
    const lines = d.lines || [];
    const qtyOf = (l: any) => Number(l.quantity ?? l.qty ?? 0);
    const priceOf = (l: any) => Number(l.estimatedPrice ?? l.unitPrice ?? 0);
    const subtotal = lines.reduce((s: number, l: any) => s + qtyOf(l) * priceOf(l), 0);
    const taxAmount = lines.reduce((s: number, l: any) => s + Number(l.taxAmount || 0), 0);
    const shipping = Number(d.shippingAmount || 0);
    const totalAmount = subtotal + taxAmount + shipping;
    // requested_by is a users FK; a typed name isn't a uuid, so fall back to current user
    const isUuid = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    const [pr] = await db('purchase_requisitions').insert({
      company_id: companyId, requisition_number: prNumber,
      request_date: d.requestDate || new Date().toISOString().split('T')[0],
      required_date: d.requiredDate || null,
      requested_by: isUuid(d.requestedBy) ? d.requestedBy : req.user!.id,
      department_id: d.departmentId || d.department || null,
      location_id: d.locationId || null,
      subsidiary_id: d.subsidiaryId || null,
      priority: d.priority || 'normal',
      currency: d.currency || 'IDR',
      memo: d.memo || null,
      status: d.status || 'pending', tax_amount: taxAmount, shipping_amount: shipping, total_amount: totalAmount,
      created_by: req.user!.id,
    }).returning('*');
    if (lines.length > 0) {
      await db('purchase_requisition_lines').insert(lines.map((l: any, idx: number) => ({
        pr_id: pr.id, line_number: idx + 1, item_id: l.itemId, description: l.description,
        quantity: qtyOf(l), unit: l.unit || null, uom_id: l.uomId || null, unit_price: priceOf(l),
        amount: qtyOf(l) * priceOf(l),
        department_id: l.departmentId || null, location_id: l.locationId || null,
      })));
    }
    res.status(201).json({ success: true, data: pr });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to create requisition' }); }
});

// GET a single requisition (header + lines + converted PO)
router.get('/requisitions/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensurePrColumns();
    const companyId = req.user!.companyId;
    const pr = await db('purchase_requisitions as pr')
      .leftJoin('users as u', db.raw('u.id::text = pr.requested_by'))
      .leftJoin('departments as dep', 'pr.department_id', 'dep.id')
      .leftJoin('locations as l', 'pr.location_id', 'l.id')
      .leftJoin('subsidiaries as sub', 'pr.subsidiary_id', 'sub.id')
      .leftJoin('purchase_orders as po', 'po.pr_id', 'pr.id')
      .where({ 'pr.id': req.params.id, 'pr.company_id': companyId })
      .select('pr.*', db.raw('COALESCE(u.name, pr.requested_by) as requested_by_name'),
        'dep.name as department_name', 'l.name as location_name', 'sub.name as subsidiary_name',
        'po.id as po_id', 'po.po_number as po_number')
      .first();
    if (!pr) { res.status(404).json({ success: false, error: 'Requisition not found' }); return; }
    const lines = await db('purchase_requisition_lines as prl')
      .leftJoin('items as i', 'prl.item_id', 'i.id')
      .leftJoin('units_of_measure as uom', 'prl.uom_id', 'uom.id')
      .leftJoin('departments as dep', 'prl.department_id', 'dep.id')
      .leftJoin('locations as loc', 'prl.location_id', 'loc.id')
      .where({ 'prl.pr_id': pr.id }).orderBy('prl.line_number')
      .select('prl.*', 'i.item_code', 'i.name as item_name', 'uom.code as uom_code', 'uom.name as uom_name',
        'dep.name as department_name', 'loc.name as location_name');
    res.json({ success: true, data: { ...pr, lines } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch requisition' }); }
});

// Update requisition (header + replace lines)
router.put('/requisitions/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensurePrColumns();
    const companyId = req.user!.companyId;
    const d = req.body;
    const existing = await db('purchase_requisitions').where({ id: req.params.id, company_id: companyId, is_deleted: false }).first();
    if (!existing) { res.status(404).json({ success: false, error: 'Requisition not found' }); return; }
    if (existing.status === 'converted') { res.status(400).json({ success: false, error: 'Cannot edit a converted requisition' }); return; }
    const lines = d.lines || [];
    const qtyOf = (l: any) => Number(l.quantity ?? l.qty ?? 0);
    const priceOf = (l: any) => Number(l.estimatedPrice ?? l.unitPrice ?? 0);
    const subtotal = lines.reduce((s: number, l: any) => s + qtyOf(l) * priceOf(l), 0);
    const taxAmount = lines.reduce((s: number, l: any) => s + Number(l.taxAmount || 0), 0);
    const shipping = Number(d.shippingAmount || 0);
    const [pr] = await db('purchase_requisitions').where({ id: existing.id }).update({
      request_date: d.requestDate ?? existing.request_date,
      required_date: d.requiredDate || null,
      department_id: d.departmentId || d.department || null,
      location_id: d.locationId || null,
      subsidiary_id: d.subsidiaryId || null,
      priority: d.priority || existing.priority,
      currency: d.currency || existing.currency,
      status: d.status ?? existing.status,
      memo: d.memo ?? existing.memo,
      tax_amount: taxAmount, shipping_amount: shipping, total_amount: subtotal + taxAmount + shipping,
      updated_by: req.user!.id, updated_at: new Date(),
    }).returning('*');
    await db('purchase_requisition_lines').where({ pr_id: existing.id }).del();
    if (lines.length > 0) {
      await db('purchase_requisition_lines').insert(lines.map((l: any, idx: number) => ({
        pr_id: existing.id, line_number: idx + 1, item_id: l.itemId, description: l.description,
        quantity: qtyOf(l), unit: l.unit || null, uom_id: l.uomId || null, unit_price: priceOf(l),
        amount: qtyOf(l) * priceOf(l),
        department_id: l.departmentId || null, location_id: l.locationId || null,
      })));
    }
    res.json({ success: true, data: pr });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to update requisition' }); }
});

// Convert Requisition to Purchase Order
router.post('/requisitions/:id/convert', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensurePrColumns();
    await ensurePoDueDate();
    const companyId = req.user!.companyId;
    const pr = await db('purchase_requisitions').where({ id: req.params.id, company_id: companyId, is_deleted: false }).first();
    if (!pr) { res.status(404).json({ success: false, error: 'Requisition not found' }); return; }
    if (pr.status === 'converted') { res.status(400).json({ success: false, error: 'Requisition already converted' }); return; }
    const prLines = await db('purchase_requisition_lines').where({ pr_id: pr.id }).orderBy('line_number');

    const num = (v: any, dfl = 0): number => { const n = Number(v); return Number.isFinite(n) ? n : dfl; };
    const poLines = prLines.map((l: any, idx: number) => {
      const quantity = num(l.quantity, 1) || 1;
      const unitPrice = num(l.unit_price, 0);
      return {
        line_number: idx + 1, item_id: l.item_id, description: l.description,
        quantity, uom_id: l.uom_id || null, unit_price: unitPrice,
        discount_percent: 0, discount_amount: 0, tax_amount: 0, amount: quantity * unitPrice,
      };
    });
    const subtotal = poLines.reduce((s: number, l: any) => s + l.amount, 0);

    // vendor is required on a PO; caller may pass one, else leave for user to set on the PO
    const vendorId = req.body.vendorId || null;
    if (!vendorId) { res.status(400).json({ success: false, error: 'Select a vendor to convert this requisition into a Purchase Order' }); return; }

    const poNumber = await generateTransactionNumber(companyId, 'purchase_order', db);
    const [po] = await db('purchase_orders').insert({
      company_id: companyId, subsidiary_id: pr.subsidiary_id, po_number: poNumber,
      pr_id: pr.id, vendor_id: vendorId, order_date: new Date().toISOString().split('T')[0],
      expected_receipt_date: pr.required_date || null, currency: pr.currency || 'IDR', exchange_rate: 1,
      payment_terms: req.body.paymentTerms || null,
      location_id: pr.location_id, department_id: pr.department_id,
      status: 'pending_approval', memo: pr.memo,
      subtotal, discount_amount: 0, tax_amount: 0, total_amount: subtotal,
      created_by: req.user!.id,
    }).returning('*');
    if (poLines.length > 0) {
      await db('purchase_order_lines').insert(poLines.map((l: any) => ({ po_id: po.id, ...l })));
    }
    await db('purchase_requisitions').where({ id: pr.id }).update({ status: 'converted', converted_to_po_id: po.id, updated_by: req.user!.id, updated_at: new Date() });
    res.json({ success: true, data: po, message: 'Requisition converted to Purchase Order' });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to convert requisition' }); }
});

router.post('/requisitions/:id/approve', async (req: Request, res: Response): Promise<void> => {
  try {
    const pr = await db('purchase_requisitions').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!pr) { res.status(404).json({ success: false, error: 'Requisition not found' }); return; }
    const prApprover = await resolveApprover(req.user!.companyId, 'purchase_requisitions', req.user!.id);
    const [updated] = await db('purchase_requisitions').where({ id: pr.id })
      .update({ status: 'approved', approved_by: prApprover, approved_at: new Date() }).returning('*');
    res.json({ success: true, data: updated });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to approve requisition' }); }
});

// ===== PURCHASE ORDERS =====
router.get('/orders', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    let query = db('purchase_orders as po').join('vendors as v', 'po.vendor_id', 'v.id')
      .leftJoin('locations as l', 'po.location_id', 'l.id')
      .where({ 'po.company_id': companyId, 'po.is_deleted': false })
      .select('po.*', 'v.name as vendor_name', 'l.name as location_name');
    if (search) query = query.where((qb: any) => qb.whereILike('po.po_number', `%${search}%`).orWhereILike('v.name', `%${search}%`));
    if (req.query.status) query = query.where({ 'po.status': req.query.status });
    if (req.query.vendorId) query = query.where({ 'po.vendor_id': req.query.vendorId });
    const total = parseInt((await query.clone().clearSelect().count('* as count').first() as any)?.count || '0');
    const data = await query.orderBy('po.order_date', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch purchase orders' }); }
});

router.get('/orders/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const po = await db('purchase_orders as po').join('vendors as v', 'po.vendor_id', 'v.id')
      .leftJoin('locations as l', 'po.location_id', 'l.id')
      .leftJoin('warehouses as w', 'po.warehouse_id', 'w.id')
      .leftJoin('departments as dep', 'po.department_id', 'dep.id')
      .leftJoin('subsidiaries as sub', 'po.subsidiary_id', 'sub.id')
      .leftJoin('users as ab', 'po.approved_by', 'ab.id')
      .where({ 'po.id': req.params.id, 'po.company_id': req.user!.companyId })
      .select('po.*', 'v.name as vendor_name', 'v.email as vendor_email', 'v.address as vendor_address',
        'v.payment_terms as vendor_payment_terms', 'l.name as location_name', 'w.name as warehouse_name',
        'dep.name as department_name', 'sub.name as subsidiary_name', 'ab.name as approved_by_name')
      .first();
    if (!po) { res.status(404).json({ success: false, error: 'Purchase order not found' }); return; }
    const lines = await db('purchase_order_lines as pol').join('items as i', 'pol.item_id', 'i.id')
      .leftJoin('units_of_measure as uom', 'pol.uom_id', 'uom.id')
      .where({ 'pol.po_id': po.id }).orderBy('pol.line_number')
      .select('pol.*', 'i.item_code', 'i.name as item_name', 'uom.code as uom_code', 'uom.name as uom_name');
    const receipts = await db('item_receipts').where({ po_id: po.id, is_deleted: false });
    const bills = await db('vendor_bills').where({ po_id: po.id, is_deleted: false });
    res.json({ success: true, data: { ...po, lines, receipts, bills } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch purchase order' }); }
});

router.post('/orders', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    if (!d.vendorId || !d.orderDate) {
      res.status(400).json({ success: false, error: 'Vendor and order date are required' }); return;
    }
    await ensurePoDueDate();
    const poNumber = await resolveTransactionNumber(companyId, 'purchase_order', d.documentNumber, db);
    const lines = d.lines || [];
    // Subtotal = gross (Qty x Rate); discount tracked separately; total = gross - discount + tax
    let subtotal = 0, taxAmount = 0, discountTotal = 0;
    for (const line of lines) {
      const gross = line.quantity * line.unitPrice;
      const lineDiscount = Number(line.discountAmount || 0);
      subtotal += gross;
      discountTotal += lineDiscount;
      taxAmount += line.taxAmount || line.taxAmt || 0;
    }
    const [po] = await db('purchase_orders').insert({
      company_id: companyId, subsidiary_id: d.subsidiaryId || null, po_number: poNumber,
      pr_id: d.prId || null, vendor_id: d.vendorId, order_date: d.orderDate,
      expected_receipt_date: d.expectedReceiptDate || null, due_date: d.dueDate || null, currency: d.currency || 'IDR',
      exchange_rate: d.exchangeRate || 1, payment_terms: d.paymentTerms || null,
      location_id: d.locationId || null, warehouse_id: d.warehouseId || null,
      department_id: d.departmentId || null, status: 'pending_approval', memo: d.memo,
      subtotal, discount_amount: discountTotal, discount_account_id: d.discountAccountId || null, tax_amount: taxAmount,
      total_amount: subtotal - discountTotal + taxAmount, created_by: req.user!.id,
    }).returning('*');
    if (lines.length > 0) {
      await db('purchase_order_lines').insert(lines.map((l: any, idx: number) => {
        const gross = l.quantity * l.unitPrice;
        const lineDiscount = Number(l.discountAmount || 0);
        return {
          po_id: po.id, line_number: idx + 1, item_id: l.itemId, description: l.description,
          quantity: l.quantity, uom_id: l.uomId || null, unit_price: l.unitPrice,
          discount_percent: Number(l.discountPercent || 0), discount_amount: lineDiscount,
          discount_account_id: l.discountAccountId || null,
          tax_code_id: l.taxCodeId || null, tax_amount: l.taxAmount || l.taxAmt || 0,
          amount: gross - lineDiscount, expense_account_id: l.expenseAccountId || null,
          department_id: l.departmentId || null, location_id: l.locationId || null,
          expected_receipt_date: l.expectedReceiptDate || null,
        };
      }));
    }
    await createAuditLog({ companyId, userId: req.user!.id, action: 'create', entityType: 'purchase_order', entityId: po.id, entityNumber: po.po_number });
    res.status(201).json({ success: true, data: po });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to create purchase order' }); }
});

// Update Purchase Order (edit)
router.put('/orders/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    const existing = await db('purchase_orders').where({ id: req.params.id, company_id: companyId }).first();
    if (!existing) { res.status(404).json({ success: false, error: 'Purchase order not found' }); return; }
    await ensurePoDueDate();

    const lines = d.lines || [];
    // Subtotal = gross (Qty x Rate); discount separate; total = gross - discount + tax
    let subtotal = 0, taxAmount = 0, discountTotal = 0;
    for (const line of lines) {
      const gross = line.quantity * line.unitPrice;
      const lineDiscount = Number(line.discountAmount || 0);
      subtotal += gross;
      discountTotal += lineDiscount;
      taxAmount += line.taxAmount || line.taxAmt || 0;
    }
    const [po] = await db('purchase_orders').where({ id: req.params.id }).update({
      subsidiary_id: d.subsidiaryId ?? existing.subsidiary_id,
      vendor_id: d.vendorId ?? existing.vendor_id,
      order_date: d.orderDate ?? existing.order_date,
      expected_receipt_date: d.expectedReceiptDate || null,
      due_date: d.dueDate || null,
      currency: d.currency ?? existing.currency,
      exchange_rate: d.exchangeRate || existing.exchange_rate || 1,
      payment_terms: d.paymentTerms ?? existing.payment_terms,
      location_id: d.locationId || null, department_id: d.departmentId || null,
      memo: d.memo ?? existing.memo,
      subtotal, discount_amount: discountTotal, discount_account_id: d.discountAccountId || null, tax_amount: taxAmount,
      total_amount: subtotal - discountTotal + taxAmount, updated_at: new Date(),
    }).returning('*');

    // Upsert lines in place so that received/billed lines (referenced by item_receipt_lines /
    // vendor_bill_lines via po_line_id) are preserved instead of deleted (which breaks FK).
    const existingLines = await db('purchase_order_lines').where({ po_id: po.id });
    const keptIds: string[] = [];
    const buildRow = (l: any, idx: number) => {
      const gross = Number(l.quantity) * Number(l.unitPrice);
      const lineDiscount = Number(l.discountAmount || 0);
      return {
        po_id: po.id, line_number: idx + 1, item_id: l.itemId, description: l.description,
        quantity: l.quantity, uom_id: l.uomId || null, unit_price: l.unitPrice,
        discount_percent: Number(l.discountPercent || 0), discount_amount: lineDiscount,
        discount_account_id: l.discountAccountId || null,
        tax_code_id: l.taxCodeId || null, tax_amount: l.taxAmount || l.taxAmt || 0,
        amount: gross - lineDiscount, expense_account_id: l.expenseAccountId || null,
        department_id: l.departmentId || null, location_id: l.locationId || null,
        expected_receipt_date: l.expectedReceiptDate || null,
      };
    };
    for (let idx = 0; idx < lines.length; idx++) {
      const l = lines[idx];
      const row = buildRow(l, idx);
      if (l.lineId && existingLines.some((e: any) => e.id === l.lineId)) {
        await db('purchase_order_lines').where({ id: l.lineId }).update(row); // keep qty_received/qty_billed
        keptIds.push(l.lineId);
      } else {
        const [ins] = await db('purchase_order_lines').insert(row).returning('id');
        keptIds.push(typeof ins === 'object' ? ins.id : ins);
      }
    }
    // Remove lines the user deleted — but only if not referenced by a receipt or bill
    for (const e of existingLines) {
      if (keptIds.includes(e.id)) continue;
      const rcv = await db('item_receipt_lines').where({ po_line_id: e.id }).first();
      const bill = await db('vendor_bill_lines').where({ po_line_id: e.id }).first();
      if (rcv || bill) {
        res.status(400).json({ success: false, error: 'Cannot remove a line that already has a receipt or bill. Adjust quantity instead.' });
        return;
      }
      await db('purchase_order_lines').where({ id: e.id }).del();
    }
    await createAuditLog({ companyId, userId: req.user!.id, action: 'update', entityType: 'purchase_order', entityId: po.id, entityNumber: po.po_number });
    res.json({ success: true, data: po });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to update purchase order' }); }
});

router.post('/orders/:id/approve', async (req: Request, res: Response): Promise<void> => {
  try {
    const po = await db('purchase_orders').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!po) { res.status(404).json({ success: false, error: 'PO not found' }); return; }
    if (po.status !== 'pending_approval') {
      res.status(400).json({ success: false, error: `Cannot approve PO with status: ${po.status}` }); return;
    }
    const poApprover = await resolveApprover(req.user!.companyId, 'purchase_orders', req.user!.id);
    const [updated] = await db('purchase_orders').where({ id: po.id })
      .update({ status: 'pending_receipt', approved_by: poApprover, approved_at: new Date() }).returning('*');
    res.json({ success: true, data: updated, message: 'Purchase order approved' });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to approve PO' }); }
});

router.post('/orders/:id/reject', async (req: Request, res: Response): Promise<void> => {
  try {
    const po = await db('purchase_orders').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!po) { res.status(404).json({ success: false, error: 'PO not found' }); return; }
    if (!['pending_approval', 'pending_receipt'].includes(po.status)) {
      res.status(400).json({ success: false, error: `Cannot reject PO with status: ${po.status}` }); return;
    }
    const reason = req.body.reason || 'Rejected by approver';
    const [updated] = await db('purchase_orders').where({ id: po.id })
      .update({ status: 'cancelled', memo: `${po.memo || ''}\n[REJECTED] ${reason}`.trim() }).returning('*');
    res.json({ success: true, data: updated, message: 'Purchase order rejected' });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to reject PO' }); }
});

// Close a PO: no further Item Receipts or Vendor Bills can be created against it.
// Stores the pre-close status so Reopen can restore it.
router.post('/orders/:id/close', async (req: Request, res: Response): Promise<void> => {
  try {
    const po = await db('purchase_orders').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!po) { res.status(404).json({ success: false, error: 'PO not found' }); return; }
    if (po.status === 'closed') { res.status(400).json({ success: false, error: 'PO is already closed' }); return; }
    if (['pending_approval', 'cancelled'].includes(po.status)) {
      res.status(400).json({ success: false, error: `Cannot close a PO with status: ${po.status}` }); return;
    }
    const [updated] = await db('purchase_orders').where({ id: po.id })
      .update({ status: 'closed', status_before_close: po.status }).returning('*');
    await createAuditLog({ companyId: req.user!.companyId, userId: req.user!.id, action: 'close', entityType: 'purchase_order', entityId: po.id, entityNumber: po.po_number });
    res.json({ success: true, data: updated, message: 'Purchase order closed' });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to close PO' }); }
});

router.post('/orders/:id/reopen', async (req: Request, res: Response): Promise<void> => {
  try {
    const po = await db('purchase_orders').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!po) { res.status(404).json({ success: false, error: 'PO not found' }); return; }
    if (po.status !== 'closed') { res.status(400).json({ success: false, error: 'PO is not closed' }); return; }
    const [updated] = await db('purchase_orders').where({ id: po.id })
      .update({ status: po.status_before_close || 'pending_receipt', status_before_close: null }).returning('*');
    await createAuditLog({ companyId: req.user!.companyId, userId: req.user!.id, action: 'reopen', entityType: 'purchase_order', entityId: po.id, entityNumber: po.po_number });
    res.json({ success: true, data: updated, message: 'Purchase order reopened' });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to reopen PO' }); }
});

// Receive Items
router.post('/orders/:id/receive', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const po = await db('purchase_orders').where({ id: req.params.id, company_id: companyId }).first();
    if (!po) { res.status(404).json({ success: false, error: 'PO not found' }); return; }
    if (['pending_approval', 'cancelled', 'closed'].includes(po.status)) {
      res.status(400).json({ success: false, error: `Cannot receive against PO with status: ${po.status}` }); return;
    }
    // Allow receiving as long as there is un-received quantity (billing status may already be set)
    const openLines = await db('purchase_order_lines').where({ po_id: po.id });
    const hasRemaining = openLines.some((l: any) => parseFloat(l.qty_received || 0) < parseFloat(l.quantity || 0));
    if (!hasRemaining) {
      res.status(400).json({ success: false, error: 'All items on this PO have already been received.' }); return;
    }

    await db.transaction(async (trx) => {
      const d = req.body;
      const receiptNumber = await resolveTransactionNumber(companyId, 'item_receipt', d.documentNumber, trx);
      const [receipt] = await trx('item_receipts').insert({
        company_id: companyId, receipt_number: receiptNumber, po_id: po.id, vendor_id: po.vendor_id,
        receipt_date: d.receiptDate || new Date().toISOString().split('T')[0],
        location_id: d.locationId || po.location_id, warehouse_id: d.warehouseId || po.warehouse_id,
        department_id: d.departmentId || po.department_id || null,
        subsidiary_id: po.subsidiary_id || null,
        status: 'received', memo: d.memo, created_by: req.user!.id,
      }).returning('*');

      const lines = d.lines || [];
      if (lines.length > 0) {
        await trx('item_receipt_lines').insert(lines.map((l: any) => ({
          receipt_id: receipt.id, po_line_id: l.poLineId, item_id: l.itemId,
          quantity: l.quantity, uom_id: l.uomId || null,
          lot_number: l.lotNumber || null,
          unit_cost: l.unitCost,
          department_id: l.departmentId || d.departmentId || po.department_id || null,
          location_id: l.locationId || d.locationId || po.location_id || null,
        })));

        for (const line of lines) {
          // qty_received tracks against the PO line in the PO's unit (matches ordered qty) — no conversion
          await trx('purchase_order_lines').where({ id: line.poLineId }).increment('qty_received', Number(line.quantity));

          // Convert the received qty to the item's BASE (stock) unit before posting to inventory.
          // Inventory (qty_on_hand) is always stored in the item's base unit.
          let rate = 1;
          if (line.uomId) {
            const u = await trx('units_of_measure').where({ id: line.uomId }).first();
            rate = Number(u?.conversion_rate_to_base || 1) || 1;
          }
          const baseQty = Number(line.quantity) * rate;
          // Cost is provided per transaction unit; store per-base-unit cost so total value is preserved
          const baseUnitCost = rate !== 0 ? Number(line.unitCost || 0) / rate : Number(line.unitCost || 0);

          // Increase inventory (in base unit)
          await InventoryEngine.createTransaction({
            companyId, transactionType: 'item_receipt',
            referenceType: 'item_receipt', referenceId: receipt.id,
            transactionDate: receipt.receipt_date,
            locationId: d.locationId || po.location_id, warehouseId: d.warehouseId || po.warehouse_id,
            memo: `Receipt for PO ${po.po_number}`,
            lines: [{
              itemId: line.itemId, quantity: baseQty, direction: 'in',
              warehouseId: d.warehouseId || po.warehouse_id, binId: line.binId,
              lotNumber: line.lotNumber, serialNumber: line.serialNumber, unitCost: baseUnitCost,
            }],
            createdBy: req.user!.id, trx,
          });
        }
      }

      // Update PO status (parse numerics — DB returns NUMERIC as strings).
      // Do not downgrade a billing status that is already set.
      const poLines = await trx('purchase_order_lines').where({ po_id: po.id });
      const allReceived = poLines.every((l: any) => parseFloat(l.qty_received || 0) >= parseFloat(l.quantity || 0));
      const anyReceived = poLines.some((l: any) => parseFloat(l.qty_received || 0) > 0);
      const billingStatuses = ['partially_billed', 'fully_billed'];
      if (!billingStatuses.includes(po.status)) {
        await trx('purchase_orders').where({ id: po.id }).update({
          status: allReceived ? 'fully_received' : anyReceived ? 'partially_received' : po.status,
        });
      }

      // GL Impact: Dr. Inventory  Cr. Accrued AP (GR-IR 2110)
      try {
        await AccountingEngine.postItemReceipt(receipt.id, req.user!.id, trx);
      } catch (glErr: any) {
        console.error('[GL WARNING] Item Receipt GL skipped:', glErr.message);
        // Non-blocking: receipt still completes
      }

      res.json({ success: true, data: receipt, message: 'Items received successfully' });
    });
  } catch (e: any) {
    console.error("[ERP ERROR]", e.message);
    res.status(500).json({ success: false, error: e.message || 'Failed to receive items' });
  }
});

// Create Vendor Bill from PO
router.post('/orders/:id/bill', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const po = await db('purchase_orders').where({ id: req.params.id, company_id: companyId }).first();
    if (!po) { res.status(404).json({ success: false, error: 'PO not found' }); return; }
    if (po.status === 'closed') { res.status(400).json({ success: false, error: 'This PO is closed. Reopen it before creating a bill.' }); return; }

    await db.transaction(async (trx) => {
      const billNumber = await resolveTransactionNumber(companyId, 'vendor_bill', req.body?.documentNumber, trx);
      const vendor = await trx('vendors').where({ id: po.vendor_id }).first();
      const d = req.body;
      const billDate = d.billDate || new Date().toISOString().split('T')[0];
      const terms = po.payment_terms || vendor?.payment_terms || 'Net30';
      const days = parseInt(terms.replace('Net', '')) || 30;
      const dueDate = new Date(billDate);
      dueDate.setDate(dueDate.getDate() + days);
      // Prefer the PO's Due Date (Order Date + terms) so it copies straight to the bill.
      const billDueDate = po.due_date ? String(po.due_date).split('T')[0] : dueDate.toISOString().split('T')[0];

      const poLines = await trx('purchase_order_lines').where({ po_id: po.id });
      // Bill only the received-but-not-yet-billed quantity per line (supports partial billing)
      const billable = poLines.map((l: any) => {
        const ordered = parseFloat(l.quantity || 0);
        const received = parseFloat(l.qty_received || 0);
        const billed = parseFloat(l.qty_billed || 0);
        const billQty = Math.max(0, Math.min(received, ordered) - billed);
        return { l, ordered, billQty };
      }).filter((x: any) => x.billQty > 0);

      if (billable.length === 0) {
        res.status(400).json({ success: false, error: 'Nothing to bill: all received quantities are already billed.' });
        return;
      }

      // Header totals proportional to billed qty
      let subtotalGross = 0, discountTotal = 0, taxTotal = 0;
      const billLineRows = billable.map(({ l, ordered, billQty }: any) => {
        const unitPrice = parseFloat(l.unit_price || 0);
        const ratio = ordered > 0 ? billQty / ordered : 1;
        const gross = billQty * unitPrice;
        const lineDisc = Math.round(parseFloat(l.discount_amount || 0) * ratio * 100) / 100;
        const lineTax = Math.round(parseFloat(l.tax_amount || 0) * ratio * 100) / 100;
        subtotalGross += gross; discountTotal += lineDisc; taxTotal += lineTax;
        return {
          po_line_id: l.id, line_number: l.line_number, item_id: l.item_id, description: l.description,
          quantity: billQty, uom_id: l.uom_id, unit_price: unitPrice,
          discount_percent: l.discount_percent || 0, discount_amount: lineDisc, discount_account_id: l.discount_account_id || null,
          tax_code_id: l.tax_code_id, tax_amount: lineTax, amount: gross - lineDisc,
          expense_account_id: l.expense_account_id,
        };
      });
      const netSubtotal = subtotalGross - discountTotal;
      const billTotal = netSubtotal + taxTotal;

      const [bill] = await trx('vendor_bills').insert({
        company_id: companyId, subsidiary_id: po.subsidiary_id,
        bill_number: billNumber, vendor_invoice_number: d.vendorInvoiceNumber || null,
        po_id: po.id, vendor_id: po.vendor_id, bill_date: billDate,
        due_date: billDueDate, currency: po.currency, exchange_rate: po.exchange_rate,
        payment_terms: po.payment_terms, location_id: po.location_id, department_id: po.department_id,
        status: 'open', memo: d.memo,
        subtotal: subtotalGross, discount_amount: discountTotal, discount_account_id: po.discount_account_id || null,
        tax_amount: taxTotal, total_amount: billTotal,
        amount_paid: 0, amount_due: billTotal,
        ap_account_id: vendor?.ap_account_id, is_posted: false, created_by: req.user!.id,
      }).returning('*');

      await trx('vendor_bill_lines').insert(billLineRows.map((r: any) => ({ bill_id: bill.id, ...r })));

      // Post GL
      await AccountingEngine.postVendorBill(bill.id, req.user!.id, trx);

      // Track billed quantities and set PO status
      for (const { l, billQty } of billable) {
        await trx('purchase_order_lines').where({ id: l.id }).increment('qty_billed', billQty);
      }
      const refreshed = await trx('purchase_order_lines').where({ po_id: po.id });
      const allBilled = refreshed.every((l: any) => parseFloat(l.qty_billed || 0) >= parseFloat(l.quantity || 0));
      const anyBilled = refreshed.some((l: any) => parseFloat(l.qty_billed || 0) > 0);
      await trx('purchase_orders').where({ id: po.id }).update({
        status: allBilled ? 'fully_billed' : anyBilled ? 'partially_billed' : 'pending_billing',
      });

      // Re-fetch bill to get updated is_posted flag
      const finalBill = await trx('vendor_bills').where({ id: bill.id }).first();
      res.json({ success: true, data: finalBill, message: 'Vendor bill created and posted' });
    });
  } catch (e: any) {
    console.error("[ERP ERROR]", e.message);
    res.status(500).json({ success: false, error: e.message || 'Failed to create vendor bill' });
  }
});

// ===== GOOD RECEIPTS =====
router.get('/receipts', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    let query = db('item_receipts as ir')
      .join('vendors as v', 'ir.vendor_id', 'v.id')
      .join('purchase_orders as po', 'ir.po_id', 'po.id')
      .leftJoin('locations as l', 'ir.location_id', 'l.id')
      .where({ 'ir.company_id': companyId, 'ir.is_deleted': false })
      .select('ir.*', 'v.name as vendor_name', 'po.po_number', 'l.name as location_name',
        // GL Posted reflects whether a posted journal entry actually exists for this
        // receipt (the is_posted flag isn't always flipped by the GL engine).
        db.raw(`EXISTS(SELECT 1 FROM journal_entries je WHERE je.source_type = 'item_receipt' AND je.source_id = ir.id AND je.status = 'posted') as is_posted`));
    if (search) query = query.where((qb: any) => qb.whereILike('ir.receipt_number', `%${search}%`).orWhereILike('v.name', `%${search}%`));
    if (req.query.poId) query = query.where({ 'ir.po_id': req.query.poId });
    if (req.query.status) query = query.where({ 'ir.status': req.query.status });
    const total = parseInt((await query.clone().clearSelect().count('ir.id as count').first() as any)?.count || '0');
    const data = await query.orderBy('ir.receipt_date', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to fetch receipts' }); }
});

// Update an Item Receipt: reverse the old inventory movement + qty_received, then re-apply
// with the edited lines. Blocked once the PO has any Vendor Bill (billing may be based on the
// received quantities/costs, so editing after that would corrupt the audit trail).
router.put('/receipts/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const receipt = await db('item_receipts').where({ id: req.params.id, company_id: companyId }).first();
    if (!receipt) { res.status(404).json({ success: false, error: 'Good receipt not found' }); return; }

    const existingBill = await db('vendor_bills').where({ po_id: receipt.po_id, is_deleted: false }).first();
    if (existingBill) {
      res.status(400).json({ success: false, error: 'Cannot edit this receipt: a Vendor Bill already exists for this Purchase Order.' });
      return;
    }

    const d = req.body;
    const oldLines = await db('item_receipt_lines').where({ receipt_id: receipt.id });

    await db.transaction(async (trx) => {
      // 1) Reverse the old lines: undo qty_received and remove the old inventory IN
      for (const ol of oldLines) {
        await trx('purchase_order_lines').where({ id: ol.po_line_id }).decrement('qty_received', Number(ol.quantity));
        const rate = await InventoryEngine.baseRate(trx, ol.uom_id || null);
        const baseQty = Number(ol.quantity) * rate;
        try {
          await InventoryEngine.createTransaction({
            companyId, transactionType: 'item_receipt',
            referenceType: 'item_receipt', referenceId: receipt.id,
            transactionDate: receipt.receipt_date,
            locationId: ol.location_id || receipt.location_id, warehouseId: receipt.warehouse_id,
            memo: `Reversal for Item Receipt edit ${receipt.receipt_number}`,
            lines: [{ itemId: ol.item_id, quantity: baseQty, direction: 'out', locationId: ol.location_id || receipt.location_id, warehouseId: receipt.warehouse_id }],
            createdBy: req.user!.id, trx,
          });
        } catch (revErr: any) { console.error('[INV WARNING] Receipt edit reversal skipped:', revErr.message); }
      }
      await trx('item_receipt_lines').where({ receipt_id: receipt.id }).del();

      // 2) Apply the new lines: qty_received + inventory IN (converted to base unit)
      const newLines = d.lines || [];
      if (newLines.length > 0) {
        await trx('item_receipt_lines').insert(newLines.map((l: any) => ({
          receipt_id: receipt.id, po_line_id: l.poLineId, item_id: l.itemId,
          quantity: l.quantity, uom_id: l.uomId || null,
          lot_number: l.lotNumber || null, unit_cost: l.unitCost,
          department_id: l.departmentId || d.departmentId || receipt.department_id || null,
          location_id: l.locationId || d.locationId || receipt.location_id || null,
        })));
        for (const line of newLines) {
          await trx('purchase_order_lines').where({ id: line.poLineId }).increment('qty_received', Number(line.quantity));
          const rate = await InventoryEngine.baseRate(trx, line.uomId || null);
          const baseQty = Number(line.quantity) * rate;
          const baseUnitCost = rate !== 0 ? Number(line.unitCost || 0) / rate : Number(line.unitCost || 0);
          await InventoryEngine.createTransaction({
            companyId, transactionType: 'item_receipt',
            referenceType: 'item_receipt', referenceId: receipt.id,
            transactionDate: d.receiptDate || receipt.receipt_date,
            locationId: d.locationId || receipt.location_id, warehouseId: receipt.warehouse_id,
            memo: `Receipt updated for PO`,
            lines: [{ itemId: line.itemId, quantity: baseQty, direction: 'in', locationId: line.locationId || d.locationId || receipt.location_id, warehouseId: receipt.warehouse_id, unitCost: baseUnitCost }],
            createdBy: req.user!.id, trx,
          });
        }
      }

      // 3) Update the receipt header
      const [updated] = await trx('item_receipts').where({ id: receipt.id }).update({
        receipt_date: d.receiptDate || receipt.receipt_date,
        location_id: d.locationId || null, department_id: d.departmentId || null,
        memo: d.memo ?? receipt.memo, updated_at: new Date(),
      }).returning('*');

      // 4) Refresh PO receiving status (do not downgrade billing status)
      const po = await trx('purchase_orders').where({ id: receipt.po_id }).first();
      const poLines = await trx('purchase_order_lines').where({ po_id: receipt.po_id });
      const allReceived = poLines.every((l: any) => parseFloat(l.qty_received || 0) >= parseFloat(l.quantity || 0));
      const anyReceived = poLines.some((l: any) => parseFloat(l.qty_received || 0) > 0);
      if (po && !['fully_billed', 'partially_billed', 'closed'].includes(po.status)) {
        await trx('purchase_orders').where({ id: po.id }).update({
          status: allReceived ? 'fully_received' : anyReceived ? 'partially_received' : 'pending_receipt',
        });
      }

      res.json({ success: true, data: updated, message: 'Item Receipt updated' });
    });
  } catch (e: any) {
    console.error('[ERP ERROR]', e.message, e.stack);
    res.status(500).json({ success: false, error: e.message || 'Failed to update good receipt' });
  }
});

router.get('/receipts/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const receipt = await db('item_receipts as ir')
      .join('vendors as v', 'ir.vendor_id', 'v.id')
      .join('purchase_orders as po', 'ir.po_id', 'po.id')
      .leftJoin('locations as l', 'ir.location_id', 'l.id')
      .leftJoin('departments as dep', 'ir.department_id', 'dep.id')
      .leftJoin('subsidiaries as sub', 'ir.subsidiary_id', 'sub.id')
      .where({ 'ir.id': req.params.id, 'ir.company_id': req.user!.companyId })
      .select('ir.*', 'v.name as vendor_name', 'v.email as vendor_email', 'v.address as vendor_address',
        'po.po_number', 'po.status as po_status', 'l.name as location_name', 'dep.name as department_name', 'sub.name as subsidiary_name')
      .first();
    if (!receipt) { res.status(404).json({ success: false, error: 'Good receipt not found' }); return; }
    const billsCount = parseInt((await db('vendor_bills').where({ po_id: receipt.po_id, is_deleted: false }).count('id as c').first() as any)?.c || '0');
    const lines = await db('item_receipt_lines as rl')
      .join('items as i', 'rl.item_id', 'i.id')
      .leftJoin('units_of_measure as uom', 'rl.uom_id', 'uom.id')
      .leftJoin('units_of_measure as buom', 'i.base_uom_id', 'buom.id')
      .leftJoin('purchase_order_lines as pol', 'rl.po_line_id', 'pol.id')
      .where({ 'rl.receipt_id': receipt.id })
      .select('rl.*', 'i.item_code', 'i.name as item_name',
        db.raw('COALESCE(uom.code, buom.code) as uom_code'),
        db.raw('COALESCE(uom.name, buom.name) as uom_name'),
        'pol.description',
        'pol.quantity as po_qty', 'pol.discount_amount as po_discount', 'pol.discount_percent as po_discount_percent');
    const journalEntries = await fetchJEWithLines('item_receipt', receipt.id, db);
    res.json({ success: true, data: { ...receipt, lines, journalEntries, bills_count: billsCount } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to fetch good receipt' }); }
});

// ===== VENDOR BILLS =====
router.get('/bills', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    let query = db('vendor_bills as b').join('vendors as v', 'b.vendor_id', 'v.id')
      .where({ 'b.company_id': companyId, 'b.is_deleted': false })
      .select('b.*', 'v.name as vendor_name');
    if (search) query = query.where((qb: any) => qb.whereILike('b.bill_number', `%${search}%`).orWhereILike('v.name', `%${search}%`));
    if (req.query.status) query = query.where({ 'b.status': req.query.status });
    const total = parseInt((await query.clone().clearSelect().count('* as count').first() as any)?.count || '0');
    const data = await query.orderBy('b.bill_date', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to fetch bills' }); }
});

router.get('/bills/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const billHasDept = await db.schema.hasColumn('vendor_bills', 'department_id');
    const billHasSub = await db.schema.hasColumn('vendor_bills', 'subsidiary_id');
    const billQuery = db('vendor_bills as b')
      .join('vendors as v', 'b.vendor_id', 'v.id')
      .leftJoin('purchase_orders as po', 'b.po_id', 'po.id')
      .leftJoin('locations as l', 'b.location_id', 'l.id')
      .where({ 'b.id': req.params.id, 'b.company_id': companyId, 'b.is_deleted': false });
    const billSelect: any[] = [
      'b.*',
      'v.name as vendor_name', 'v.email as vendor_email', 'v.address as vendor_address',
      'v.tax_id as vendor_tax_id', 'v.payment_terms as vendor_payment_terms',
      'po.po_number', 'l.name as location_name',
    ];
    if (billHasDept) { billQuery.leftJoin('departments as dep', 'b.department_id', 'dep.id'); billSelect.push('dep.name as department_name'); }
    if (billHasSub)  { billQuery.leftJoin('subsidiaries as sub', 'b.subsidiary_id', 'sub.id'); billSelect.push('sub.name as subsidiary_name'); }
    const bill = await billQuery.select(billSelect).first();

    if (!bill) { res.status(404).json({ success: false, error: 'Vendor bill not found' }); return; }

    const lines = await db('vendor_bill_lines as vbl')
      .leftJoin('items as i', 'vbl.item_id', 'i.id')
      .leftJoin('units_of_measure as uom', 'vbl.uom_id', 'uom.id')
      .leftJoin('accounts as a', 'vbl.expense_account_id', 'a.id')
      .leftJoin('accounts as da', 'vbl.discount_account_id', 'da.id')
      .leftJoin('departments as dep', 'vbl.department_id', 'dep.id')
      .leftJoin('locations as loc', 'vbl.location_id', 'loc.id')
      .where({ 'vbl.bill_id': bill.id })
      .orderBy('vbl.line_number')
      .select('vbl.*', 'i.item_code', 'i.name as item_name', 'uom.code as uom_code', 'uom.name as uom_name',
        'a.code as expense_account_code', 'a.name as expense_account_name',
        'da.code as discount_account_code', 'da.name as discount_account_name',
        'dep.name as department_name', 'loc.name as location_name');

    const payments = await db('bill_payment_applications as bpa')
      .join('vendor_payments as vp', 'bpa.payment_id', 'vp.id')
      .where({ 'bpa.bill_id': bill.id })
      .select('bpa.*', 'vp.payment_number', 'vp.payment_date', 'vp.payment_method');

    const journalEntries = await fetchJEWithLines('vendor_bill', bill.id, db);
    res.json({ success: true, data: { ...bill, lines, payments, journalEntries } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to fetch vendor bill' }); }
});

// Vendor Payments
router.get('/vendor-payments', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    let query = db('vendor_payments as vp')
      .join('vendors as v', 'vp.vendor_id', 'v.id')
      .where({ 'vp.company_id': companyId, 'vp.is_deleted': false })
      .select('vp.*', 'v.name as vendor_name');
    if (search) query = query.where((qb: any) => qb.whereILike('vp.payment_number', `%${search}%`).orWhereILike('v.name', `%${search}%`));
    if (req.query.status) query = query.where({ 'vp.status': req.query.status });
    if (req.query.vendorId) query = query.where({ 'vp.vendor_id': req.query.vendorId });
    const total = parseInt((await query.clone().clearSelect().count('vp.id as count').first() as any)?.count || '0');
    const data = await query.orderBy('vp.payment_date', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to fetch vendor payments' }); }
});

router.get('/vendor-payments/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const payment = await db('vendor_payments as vp')
      .join('vendors as v', 'vp.vendor_id', 'v.id')
      .leftJoin('accounts as ba', 'vp.bank_account_id', 'ba.id')
      .leftJoin('accounts as apa', 'vp.ap_account_id', 'apa.id')
      .where({ 'vp.id': req.params.id, 'vp.company_id': req.user!.companyId, 'vp.is_deleted': false })
      .select('vp.*', 'v.name as vendor_name', 'v.email as vendor_email',
        'ba.code as bank_account_code', 'ba.name as bank_account_name',
        'apa.code as ap_account_code', 'apa.name as ap_account_name')
      .first();
    if (!payment) { res.status(404).json({ success: false, error: 'Vendor payment not found' }); return; }
    const applications = await db('bill_payment_applications as bpa')
      .join('vendor_bills as b', 'bpa.bill_id', 'b.id')
      .where({ 'bpa.payment_id': payment.id })
      .select('bpa.*', 'b.bill_number', 'b.bill_date', 'b.due_date', 'b.total_amount', 'b.status as bill_status');
    // Credits (prepayments / unapplied payments) applied to reduce this payment's cash
    let creditApplications: any[] = [];
    if (await db.schema.hasTable('payment_credit_applications')) {
      creditApplications = await db('payment_credit_applications as pca')
        .leftJoin('vendor_prepayments as pp', function (this: any) { this.on('pca.credit_id', 'pp.id').andOn(db.raw("pca.credit_type = 'vendor_prepayment'")); })
        .leftJoin('vendor_payments as sp', function (this: any) { this.on('pca.credit_id', 'sp.id').andOn(db.raw("pca.credit_type = 'vendor_payment'")); })
        .where({ 'pca.payment_id': payment.id })
        .select('pca.*',
          db.raw("COALESCE(pp.prepayment_number, sp.payment_number) as credit_number"),
          db.raw("COALESCE(pp.payment_date, sp.payment_date) as credit_date"));
    }
    const journalEntries = await fetchJEWithLines('vendor_payment', payment.id, db);
    res.json({ success: true, data: { ...payment, applications, creditApplications, journalEntries } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to fetch vendor payment' }); }
});

// Vendor Payment (Create)
router.post('/vendor-payments', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    await db.transaction(async (trx) => {
      const payNumber = await resolveTransactionNumber(companyId, 'vendor_payment', (req.body||{}).documentNumber, trx);
      const vendor = await trx('vendors').where({ id: d.vendorId }).first();
      const [payment] = await trx('vendor_payments').insert({
        company_id: companyId, payment_number: payNumber, vendor_id: d.vendorId,
        payment_date: d.paymentDate, payment_method: d.paymentMethod || 'bank_transfer',
        reference: d.reference, currency: d.currency || 'IDR', exchange_rate: d.exchangeRate || 1,
        amount: d.amount, unapplied_amount: d.amount,
        bank_account_id: d.bankAccountId, ap_account_id: vendor?.ap_account_id || null,
        subsidiary_id: d.subsidiaryId || null, location_id: d.locationId || null, department_id: d.departmentId || null,
        status: 'open', memo: d.memo, is_posted: false, created_by: req.user!.id,
      }).returning('*');

      // Apply vendor credits first (prepayments / unapplied payments). These add to the
      // settlement power alongside the cash amount and reduce the bank cash in the GL.
      const creditsApplied = await applyVendorCredits(trx, companyId, payment.id, d.creditApplications || []);

      if (d.applications?.length > 0) {
        // Bills can be settled by cash + applied credits
        let remaining = parseFloat(d.amount) + creditsApplied;
        for (const app of d.applications) {
          if (remaining <= 0) break;
          const bill = await trx('vendor_bills').where({ id: app.billId }).first();
          if (!bill || bill.amount_due <= 0) continue;
          const applyAmount = Math.min(remaining, parseFloat(bill.amount_due), Number(app.amount) || parseFloat(bill.amount_due));
          if (applyAmount <= 0) continue;
          await trx('bill_payment_applications').insert({ payment_id: payment.id, bill_id: app.billId, applied_amount: applyAmount });
          const newPaid = parseFloat(bill.amount_paid) + applyAmount;
          const newDue = parseFloat(bill.total_amount) - newPaid;
          await trx('vendor_bills').where({ id: app.billId }).update({ amount_paid: newPaid, amount_due: newDue, status: newDue <= 0 ? 'paid' : 'partially_paid' });
          remaining -= applyAmount;
        }
        await trx('vendor_payments').where({ id: payment.id }).update({ unapplied_amount: Math.max(0, remaining), status: remaining <= 0 ? 'applied' : 'open' });
      } else if (creditsApplied > 0) {
        await trx('vendor_payments').where({ id: payment.id }).update({ unapplied_amount: parseFloat(d.amount) + creditsApplied });
      }

      await postVendorPaymentWithCredits(trx, companyId, payment.id, creditsApplied, req.user!.id);
      const finalPayment = await trx('vendor_payments').where({ id: payment.id }).first();
      res.status(201).json({ success: true, data: finalPayment });
    });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: e.message || 'Failed to record payment' }); }
});

// Vendor Payment (Edit) — reverses old GL + bill applications, then re-applies with the new data.
router.put('/vendor-payments/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const existing = await db('vendor_payments').where({ id: req.params.id, company_id: companyId, is_deleted: false }).first();
    if (!existing) { res.status(404).json({ success: false, error: 'Vendor payment not found' }); return; }

    const d = req.body;
    await db.transaction(async (trx) => {
      // 1) Undo the old bill applications (restore amount_paid/amount_due/status on each applied bill)
      const oldApps = await trx('bill_payment_applications').where({ payment_id: existing.id });
      for (const app of oldApps) {
        const bill = await trx('vendor_bills').where({ id: app.bill_id }).first();
        if (!bill) continue;
        const restoredPaid = Math.max(0, parseFloat(bill.amount_paid) - parseFloat(app.applied_amount));
        const restoredDue = parseFloat(bill.total_amount) - restoredPaid;
        await trx('vendor_bills').where({ id: app.bill_id }).update({
          amount_paid: restoredPaid, amount_due: restoredDue,
          status: restoredPaid <= 0 ? 'open' : 'partially_paid',
        });
      }
      await trx('bill_payment_applications').where({ payment_id: existing.id }).del();

      // 1b) Undo the old credit applications (restore prepayment/payment balances)
      await reverseVendorCredits(trx, companyId, existing.id);

      // 2) Remove the old GL entry for this payment
      const oldJEs = await trx('journal_entries').where({ source_type: 'vendor_payment', source_id: existing.id });
      for (const je of oldJEs) await trx('journal_entry_lines').where({ journal_id: je.id }).del();
      await trx('journal_entries').where({ source_type: 'vendor_payment', source_id: existing.id }).del();

      // 3) Update the payment header
      const vendor = await trx('vendors').where({ id: d.vendorId || existing.vendor_id }).first();
      const [payment] = await trx('vendor_payments').where({ id: existing.id }).update({
        vendor_id: d.vendorId || existing.vendor_id, payment_date: d.paymentDate || existing.payment_date,
        payment_method: d.paymentMethod || existing.payment_method, reference: d.reference ?? existing.reference,
        currency: d.currency || existing.currency, amount: d.amount ?? existing.amount, unapplied_amount: d.amount ?? existing.amount,
        bank_account_id: d.bankAccountId || existing.bank_account_id, ap_account_id: vendor?.ap_account_id || existing.ap_account_id,
        subsidiary_id: d.subsidiaryId || null, location_id: d.locationId || null, department_id: d.departmentId || null,
        memo: d.memo ?? existing.memo, is_posted: false, status: 'open', updated_at: new Date(),
      }).returning('*');

      // 4a) Re-apply the new vendor credits (prepayments / unapplied payments)
      const creditsApplied = await applyVendorCredits(trx, companyId, payment.id, d.creditApplications || []);

      // 4b) Re-apply the new bill applications (settled by cash + credits)
      if (d.applications?.length > 0) {
        let remaining = parseFloat(payment.amount) + creditsApplied;
        for (const app of d.applications) {
          if (remaining <= 0) break;
          const bill = await trx('vendor_bills').where({ id: app.billId }).first();
          if (!bill || parseFloat(bill.amount_due) <= 0) continue;
          const applyAmount = Math.min(remaining, parseFloat(bill.amount_due), Number(app.amount) || parseFloat(bill.amount_due));
          if (applyAmount <= 0) continue;
          await trx('bill_payment_applications').insert({ payment_id: payment.id, bill_id: app.billId, applied_amount: applyAmount });
          const newPaid = parseFloat(bill.amount_paid) + applyAmount;
          const newDue = parseFloat(bill.total_amount) - newPaid;
          await trx('vendor_bills').where({ id: app.billId }).update({ amount_paid: newPaid, amount_due: newDue, status: newDue <= 0 ? 'paid' : 'partially_paid' });
          remaining -= applyAmount;
        }
        await trx('vendor_payments').where({ id: payment.id }).update({ unapplied_amount: Math.max(0, remaining), status: remaining <= 0 ? 'applied' : 'open' });
      } else if (creditsApplied > 0) {
        await trx('vendor_payments').where({ id: payment.id }).update({ unapplied_amount: parseFloat(payment.amount) + creditsApplied });
      }

      // 5) Re-post GL (credit-aware)
      await postVendorPaymentWithCredits(trx, companyId, payment.id, creditsApplied, req.user!.id);
      const finalPayment = await trx('vendor_payments').where({ id: payment.id }).first();
      res.json({ success: true, data: finalPayment, message: 'Vendor payment updated' });
    });
  } catch (e: any) {
    console.error('[ERP ERROR]', e.message, e.stack);
    res.status(500).json({ success: false, error: e.message || 'Failed to update vendor payment' });
  }
});

// ─── Vendor Bills POST (new entry form) ──────────────────────────────────────
router.post('/bills', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.vendorId) { res.status(400).json({ success: false, error: 'Vendor is required' }); return; }

    // Guard: when billing against a PO, bill qty per line cannot exceed the PO remaining (ordered − already billed)
    if (d.purchaseOrderId) {
      const poForBill = await db('purchase_orders').where({ id: d.purchaseOrderId, company_id: companyId }).first();
      if (poForBill?.status === 'closed') {
        res.status(400).json({ success: false, error: 'This PO is closed. Reopen it before creating a bill.' }); return;
      }
      const poLineIds = (d.lines || []).map((l: any) => l.poLineId).filter(Boolean);
      if (poLineIds.length > 0) {
        const poLines = await db('purchase_order_lines').whereIn('id', poLineIds);
        const byId: Record<string, any> = {};
        for (const pl of poLines) byId[pl.id] = pl;
        for (const l of d.lines || []) {
          if (!l.poLineId) continue;
          const pl = byId[l.poLineId];
          if (!pl) continue;
          const ordered = parseFloat(pl.quantity || 0);
          const billed = parseFloat(pl.qty_billed || 0);
          const remaining = Math.max(0, ordered - billed);
          if (Number(l.qty || 0) > remaining + 1e-6) {
            res.status(400).json({ success: false, error: `Bill qty (${l.qty}) exceeds remaining PO qty (${remaining}) for line ${pl.line_number || ''}` });
            return;
          }
        }
      }
    }

    const billNumber = await resolveTransactionNumber(companyId, 'vendor_bill', d.documentNumber, db);
    const lineNet = (l: any) => {
      const gross = Number(l.qty || 0) * Number(l.unitPrice || 0);
      const disc = l.discountAmount != null ? Number(l.discountAmount) : gross * (Number(l.discountPercent || 0) / 100);
      return { gross, disc, net: gross - disc };
    };
    // Subtotal = GROSS (Qty x Unit Price); discount separate; net = gross - discount
    const subtotal = (d.lines || []).reduce((s: number, l: any) => s + lineNet(l).gross, 0);
    const discountTotal = (d.lines || []).reduce((s: number, l: any) => s + lineNet(l).disc, 0);
    const netSubtotal = subtotal - discountTotal;
    // Tax: prefer explicit amount from PO/frontend, else compute from taxRate on net
    const taxAmount = d.taxAmount != null ? Number(d.taxAmount)
      : (d.lines || []).reduce((s: number, l: any) => s + Number(l.taxAmt || 0), 0)
      || netSubtotal * (Number(d.taxRate || 0) / 100);
    const totalAmount = netSubtotal + taxAmount;

    const dueDate = d.dueDate || (() => {
      const dt = new Date(d.billDate || new Date());
      const days: Record<string, number> = { net15: 15, net30: 30, net45: 45, net60: 60, immediate: 0 };
      dt.setDate(dt.getDate() + (days[d.paymentTerms || 'net30'] || 30));
      return dt.toISOString().split('T')[0];
    })();

    const [bill] = await db('vendor_bills').insert({
      company_id: companyId,
      bill_number: billNumber,
      vendor_id: d.vendorId,
      po_id: d.purchaseOrderId || null,
      bill_date: d.billDate || new Date(),
      due_date: dueDate,
      vendor_bill_number: d.billNumber || null,
      payment_terms: d.paymentTerms || 'net30',
      currency: d.currency || 'IDR',
      exchange_rate: d.exchangeRate || 1,
      tax_rate: Number(d.taxRate || 0),
      subtotal, discount_amount: discountTotal, discount_account_id: d.discountAccountId || null, tax_amount: taxAmount, total_amount: totalAmount,
      amount_paid: 0, amount_due: totalAmount,
      subsidiary_id: d.subsidiaryId || null, location_id: d.locationId || null, department_id: d.departmentId || null,
      memo: d.memo || null,
      status: 'open',
      created_by: req.user!.id,
    }).returning('*');

    const savedLines: any[] = [];
    let lineNo = 0;
    for (const line of d.lines || []) {
      const { disc, net } = lineNet(line);
      const qty = Number(line.qty || 0);
      const taxAmt = Number(line.taxAmt || 0);
      const [bl] = await db('vendor_bill_lines').insert({
        bill_id: bill.id,
        po_line_id: line.poLineId || null,
        line_number: ++lineNo,
        item_id: line.itemId || null,
        description: line.description || null,
        account_id: line.accountId || null,
        expense_account_id: line.accountId || null,
        uom_id: line.uomId || null,
        qty, quantity: qty,
        unit_price: Number(line.unitPrice || 0),
        discount_percent: Number(line.discountPercent || 0),
        discount_amount: disc,
        discount_account_id: line.discountAccountId || null,
        tax_amt: taxAmt, tax_amount: taxAmt,
        department_id: line.departmentId || null,
        location_id: line.locationId || null,
        amount: net,
      }).returning('*');
      savedLines.push({ ...bl, itemId: line.itemId });
    }

    // ── Track billed quantities on the PO + update PO status ─────────────────
    if (bill.po_id) {
      for (const line of d.lines || []) {
        if (line.poLineId && Number(line.qty || 0) > 0) {
          await db('purchase_order_lines').where({ id: line.poLineId }).increment('qty_billed', Number(line.qty));
        }
      }
      const poLines = await db('purchase_order_lines').where({ po_id: bill.po_id });
      const allBilled = poLines.every((l: any) => parseFloat(l.qty_billed || 0) >= parseFloat(l.quantity || 0));
      const anyBilled = poLines.some((l: any) => parseFloat(l.qty_billed || 0) > 0);
      await db('purchase_orders').where({ id: bill.po_id }).update({
        status: allBilled ? 'fully_billed' : anyBilled ? 'partially_billed' : 'pending_billing',
      });
    }

    // ── GL posting ──────────────────────────────────────────────────────────
    try {
      if (bill.po_id) {
        // Bill originated from a PO/receipt: clear the GR-IR accrual (Dr 2110 / Cr AP)
        await AccountingEngine.postVendorBill(bill.id, req.user!.id, db);
      } else {
        // Manual bill: Dr line expense/inventory accounts (+ tax input) / Cr AP
        const vendor = await db('vendors').where({ id: d.vendorId }).first();
        const defaultAP = await db('accounts').where({ company_id: companyId, code: '2100' }).first();
        const apAccountId = vendor?.ap_account_id || defaultAP?.id;
        if (apAccountId) {
          const jeNumber = `JE-BILL-${billNumber}`;
          const jeLines: any[] = [];
          // Resolve discount account (header choice or default purchase_discount)
          const discAcct = discountTotal > 0
            ? (d.discountAccountId
                ? await db('accounts').where({ id: d.discountAccountId, company_id: companyId }).first()
                : await db('accounts').where({ company_id: companyId, subtype: 'purchase_discount' }).first())
            : null;
          for (const l of savedLines) {
            // If we post the discount separately, debit lines at GROSS; otherwise at net amount
            const net = Number(l.amount || 0);
            const debitAmt = discAcct ? net + Number(l.discount_amount || 0) : net;
            if (debitAmt <= 0) continue;
            let acct = l.account_id;
            if (!acct && l.itemId) {
              const it = await db('items').where({ id: l.itemId }).first();
              acct = it?.asset_account_id || it?.inventory_account_id || it?.expense_account_id;
            }
            if (!acct) {
              const exp = await db('accounts').where({ company_id: companyId, code: '5100' }).first()
                || await db('accounts').where({ company_id: companyId, type: 'expense', subtype: 'expense' }).orderBy('code').first();
              acct = exp?.id;
            }
            if (acct) jeLines.push({ account_id: acct, debit: debitAmt, credit: 0, memo: l.description || 'Bill line' });
          }
          // Cr. Purchase Discount (reduction) for the total discount
          if (discAcct && discountTotal > 0) {
            jeLines.push({ account_id: discAcct.id, debit: 0, credit: discountTotal, memo: `Purchase discount - ${billNumber}` });
          }
          if (taxAmount > 0) {
            const taxInput = await db('accounts').where({ company_id: companyId, code: '1150' }).first();
            if (taxInput) jeLines.push({ account_id: taxInput.id, debit: taxAmount, credit: 0, memo: 'PPN Masukan' });
            else if (jeLines[0]) jeLines[0].debit += taxAmount;
          }
          if (jeLines.length > 0) {
            const debitSum = jeLines.reduce((s: number, jl: any) => s + Number(jl.debit || 0), 0);
            const [je] = await db('journal_entries').insert({
              company_id: companyId, subsidiary_id: d.subsidiaryId || null,
              journal_number: jeNumber, entry_date: d.billDate || new Date(),
              memo: `Vendor Bill ${billNumber}`, source_type: 'vendor_bill', source_id: bill.id,
              department_id: d.departmentId || null, location_id: d.locationId || null,
              status: 'posted', total_debit: debitSum, total_credit: debitSum,
              posted_by: req.user!.id, posted_at: new Date(), created_by: req.user!.id,
            }).returning('*');
            // AP = debit total minus the discount credit already added
            const apCredit = debitSum - (discAcct && discountTotal > 0 ? discountTotal : 0);
            jeLines.push({ account_id: apAccountId, debit: 0, credit: apCredit, memo: `AP - ${vendor?.name || ''}` });
            await db('journal_entry_lines').insert(jeLines.map((jl: any, i: number) => ({ journal_id: je.id, line_number: i + 1, ...jl })));
            await db('vendor_bills').where({ id: bill.id }).update({ is_posted: true, posted_by: req.user!.id, posted_at: new Date() });
          }
        }
      }
    } catch (glErr: any) { console.error('[GL WARNING] Vendor Bill GL skipped:', glErr.message); }

    res.status(201).json({ success: true, data: { ...bill, bill_number: billNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to create bill' }); }
});

// ─── Vendor Bill PUT (edit) ───────────────────────────────────────────────────
// Reverses the old GL entry + qty_billed, replaces the lines, then re-posts exactly like create.
// Blocked once any payment has been applied against the bill.
router.put('/bills/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const existing = await db('vendor_bills').where({ id: req.params.id, company_id: companyId, is_deleted: false }).first();
    if (!existing) { res.status(404).json({ success: false, error: 'Vendor bill not found' }); return; }
    if (parseFloat(existing.amount_paid || 0) > 0) {
      res.status(400).json({ success: false, error: 'Cannot edit a bill that already has a payment applied.' }); return;
    }

    const d = req.body;
    if (!d.vendorId) { res.status(400).json({ success: false, error: 'Vendor is required' }); return; }

    const lineNet = (l: any) => {
      const gross = Number(l.qty || 0) * Number(l.unitPrice || 0);
      const disc = l.discountAmount != null ? Number(l.discountAmount) : gross * (Number(l.discountPercent || 0) / 100);
      return { gross, disc, net: gross - disc };
    };
    const subtotal = (d.lines || []).reduce((s: number, l: any) => s + lineNet(l).gross, 0);
    const discountTotal = (d.lines || []).reduce((s: number, l: any) => s + lineNet(l).disc, 0);
    const netSubtotal = subtotal - discountTotal;
    const taxAmount = d.taxAmount != null ? Number(d.taxAmount)
      : (d.lines || []).reduce((s: number, l: any) => s + Number(l.taxAmt || 0), 0)
      || netSubtotal * (Number(d.taxRate || 0) / 100);
    const totalAmount = netSubtotal + taxAmount;

    const dueDate = d.dueDate || (() => {
      const dt = new Date(d.billDate || existing.bill_date);
      const days: Record<string, number> = { net15: 15, net30: 30, net45: 45, net60: 60, immediate: 0 };
      dt.setDate(dt.getDate() + (days[d.paymentTerms || 'net30'] || 30));
      return dt.toISOString().split('T')[0];
    })();

    await db.transaction(async (trx) => {
      // 1) Reverse old qty_billed on the PO lines this bill referenced (if any)
      const oldLines = await trx('vendor_bill_lines').where({ bill_id: existing.id });
      if (existing.po_id) {
        for (const ol of oldLines) {
          if (ol.po_line_id && Number(ol.quantity || 0) > 0) {
            await trx('purchase_order_lines').where({ id: ol.po_line_id }).decrement('qty_billed', Number(ol.quantity));
          }
        }
      }
      // 2) Remove the old GL entry for this bill
      const oldJEs = await trx('journal_entries').where({ source_type: 'vendor_bill', source_id: existing.id });
      for (const je of oldJEs) {
        await trx('journal_entry_lines').where({ journal_id: je.id }).del();
      }
      await trx('journal_entries').where({ source_type: 'vendor_bill', source_id: existing.id }).del();

      // 3) Update the bill header
      const [bill] = await trx('vendor_bills').where({ id: existing.id }).update({
        vendor_id: d.vendorId, bill_date: d.billDate || existing.bill_date, due_date: dueDate,
        vendor_bill_number: d.billNumber ?? existing.vendor_bill_number,
        payment_terms: d.paymentTerms || existing.payment_terms, currency: d.currency || existing.currency,
        exchange_rate: d.exchangeRate || existing.exchange_rate || 1,
        tax_rate: Number(d.taxRate || 0),
        subtotal, discount_amount: discountTotal, discount_account_id: d.discountAccountId || null,
        tax_amount: taxAmount, total_amount: totalAmount, amount_due: totalAmount - Number(existing.amount_paid || 0),
        subsidiary_id: d.subsidiaryId || null, location_id: d.locationId || null, department_id: d.departmentId || null,
        memo: d.memo || null, is_posted: false, updated_at: new Date(),
      }).returning('*');

      // 4) Replace the lines
      await trx('vendor_bill_lines').where({ bill_id: bill.id }).del();
      const savedLines: any[] = [];
      let lineNo = 0;
      for (const line of d.lines || []) {
        const { disc, net } = lineNet(line);
        const qty = Number(line.qty || 0);
        const taxAmt = Number(line.taxAmt || 0);
        const [bl] = await trx('vendor_bill_lines').insert({
          bill_id: bill.id, po_line_id: line.poLineId || null, line_number: ++lineNo,
          item_id: line.itemId || null, description: line.description || null,
          account_id: line.accountId || null, expense_account_id: line.accountId || null,
          uom_id: line.uomId || null, qty, quantity: qty, unit_price: Number(line.unitPrice || 0),
          discount_percent: Number(line.discountPercent || 0), discount_amount: disc,
          discount_account_id: line.discountAccountId || null,
          tax_amt: taxAmt, tax_amount: taxAmt,
          department_id: line.departmentId || null, location_id: line.locationId || null, amount: net,
        }).returning('*');
        savedLines.push({ ...bl, itemId: line.itemId });
      }

      // 5) Re-apply qty_billed and refresh PO status
      if (bill.po_id) {
        for (const line of d.lines || []) {
          if (line.poLineId && Number(line.qty || 0) > 0) {
            await trx('purchase_order_lines').where({ id: line.poLineId }).increment('qty_billed', Number(line.qty));
          }
        }
        const poLines = await trx('purchase_order_lines').where({ po_id: bill.po_id });
        const allBilled = poLines.every((l: any) => parseFloat(l.qty_billed || 0) >= parseFloat(l.quantity || 0));
        const anyBilled = poLines.some((l: any) => parseFloat(l.qty_billed || 0) > 0);
        await trx('purchase_orders').where({ id: bill.po_id }).update({
          status: allBilled ? 'fully_billed' : anyBilled ? 'partially_billed' : 'pending_billing',
        });
      }

      // 6) Re-post GL (same logic as create)
      if (bill.po_id) {
        await AccountingEngine.postVendorBill(bill.id, req.user!.id, trx);
      } else {
        const vendor = await trx('vendors').where({ id: d.vendorId }).first();
        const defaultAP = await trx('accounts').where({ company_id: companyId, code: '2100' }).first();
        const apAccountId = vendor?.ap_account_id || defaultAP?.id;
        if (apAccountId) {
          const jeNumber = `JE-BILL-${bill.bill_number}`;
          const jeLines: any[] = [];
          const discAcct = discountTotal > 0
            ? (d.discountAccountId
                ? await trx('accounts').where({ id: d.discountAccountId, company_id: companyId }).first()
                : await trx('accounts').where({ company_id: companyId, subtype: 'purchase_discount' }).first())
            : null;
          for (const l of savedLines) {
            const net = Number(l.amount || 0);
            const debitAmt = discAcct ? net + Number(l.discount_amount || 0) : net;
            if (debitAmt <= 0) continue;
            let acct = l.account_id;
            if (!acct && l.itemId) {
              const it = await trx('items').where({ id: l.itemId }).first();
              acct = it?.asset_account_id || it?.inventory_account_id || it?.expense_account_id;
            }
            if (!acct) {
              const exp = await trx('accounts').where({ company_id: companyId, code: '5100' }).first()
                || await trx('accounts').where({ company_id: companyId, type: 'expense', subtype: 'expense' }).orderBy('code').first();
              acct = exp?.id;
            }
            if (acct) jeLines.push({ account_id: acct, debit: debitAmt, credit: 0, memo: l.description || 'Bill line' });
          }
          if (discAcct && discountTotal > 0) {
            jeLines.push({ account_id: discAcct.id, debit: 0, credit: discountTotal, memo: `Purchase discount - ${bill.bill_number}` });
          }
          if (taxAmount > 0) {
            const taxInput = await trx('accounts').where({ company_id: companyId, code: '1150' }).first();
            if (taxInput) jeLines.push({ account_id: taxInput.id, debit: taxAmount, credit: 0, memo: 'PPN Masukan' });
            else if (jeLines[0]) jeLines[0].debit += taxAmount;
          }
          if (jeLines.length > 0) {
            const debitSum = jeLines.reduce((s: number, jl: any) => s + Number(jl.debit || 0), 0);
            const [je] = await trx('journal_entries').insert({
              company_id: companyId, subsidiary_id: d.subsidiaryId || null,
              journal_number: jeNumber, entry_date: d.billDate || existing.bill_date,
              memo: `Vendor Bill ${bill.bill_number}`, source_type: 'vendor_bill', source_id: bill.id,
              department_id: d.departmentId || null, location_id: d.locationId || null,
              status: 'posted', total_debit: debitSum, total_credit: debitSum,
              posted_by: req.user!.id, posted_at: new Date(), created_by: req.user!.id,
            }).returning('*');
            const apCredit = debitSum - (discAcct && discountTotal > 0 ? discountTotal : 0);
            jeLines.push({ account_id: apAccountId, debit: 0, credit: apCredit, memo: `AP - ${vendor?.name || ''}` });
            await trx('journal_entry_lines').insert(jeLines.map((jl: any, i: number) => ({ journal_id: je.id, line_number: i + 1, ...jl })));
            await trx('vendor_bills').where({ id: bill.id }).update({ is_posted: true, posted_by: req.user!.id, posted_at: new Date() });
          }
        }
      }

      res.json({ success: true, data: { ...bill, bill_number: bill.bill_number } });
    });
  } catch (e: any) {
    console.error('[ERP ERROR]', e.message, e.stack);
    res.status(500).json({ success: false, error: e.message || 'Failed to update bill' });
  }
});

// ─── Vendor Prepayments ───────────────────────────────────────────────────────
router.get('/prepayments', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('vendor_prepayments as vp')
      .leftJoin('vendors as v', 'vp.vendor_id', 'v.id')
      .where({ 'vp.company_id': req.user!.companyId })
      .select('vp.*', 'v.name as vendor_name')
      .orderBy('vp.payment_date', 'desc').limit(100);
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to fetch prepayments' }); }
});

router.get('/prepayments/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    // department_id / location_id / subsidiary_id are added by the dept/location migration;
    // only join them when the column exists so this works across deployments.
    const [hasDept, hasLoc, hasSub] = await Promise.all([
      db.schema.hasColumn('vendor_prepayments', 'department_id'),
      db.schema.hasColumn('vendor_prepayments', 'location_id'),
      db.schema.hasColumn('vendor_prepayments', 'subsidiary_id'),
    ]);
    const q = db('vendor_prepayments as vp')
      .leftJoin('vendors as v', 'vp.vendor_id', 'v.id')
      .leftJoin('accounts as ba', 'vp.bank_account_id', 'ba.id')
      .where({ 'vp.id': req.params.id, 'vp.company_id': companyId });
    const sel: any[] = ['vp.*', 'v.name as vendor_name', 'v.email as vendor_email',
      'ba.name as bank_account_name', 'ba.code as bank_account_code'];
    if (hasDept) { q.leftJoin('departments as dep', 'vp.department_id', 'dep.id'); sel.push('dep.name as department_name'); }
    if (hasLoc)  { q.leftJoin('locations as loc', 'vp.location_id', 'loc.id'); sel.push('loc.name as location_name'); }
    if (hasSub)  { q.leftJoin('subsidiaries as sub', 'vp.subsidiary_id', 'sub.id'); sel.push('sub.name as subsidiary_name'); }
    const prep = await q.select(sel).first();
    if (!prep) { res.status(404).json({ success: false, error: 'Prepayment not found' }); return; }
    const journalEntries = await fetchJEWithLines('vendor_prepayment', prep.id, db);
    // Related records: which bill payments consumed this prepayment
    await ensurePaymentCreditTable();
    const applications = await db('payment_credit_applications as pca')
      .join('vendor_payments as vp', 'pca.payment_id', 'vp.id')
      .where({ 'pca.credit_type': 'vendor_prepayment', 'pca.credit_id': prep.id })
      .select('pca.id', 'pca.applied_amount', 'vp.id as payment_id', 'vp.payment_number', 'vp.payment_date', 'vp.status as payment_status');
    res.json({ success: true, data: { ...prep, journalEntries, applications } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch prepayment' }); }
});

// Available vendor credits (unapplied prepayments + vendor payments with an unapplied balance)
// that can be applied against a Bill Payment to reduce the bank cash required.
router.get('/vendor-credits/available', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const vendorId = req.query.vendorId as string;
    if (!vendorId) { res.json({ success: true, data: { prepayments: [], payments: [] } }); return; }
    const excludePaymentId = (req.query.excludePaymentId as string) || null;

    // When editing a payment, add back the amounts it already consumed so those
    // credits reappear in the available list with their pre-edit balance.
    const consumedByEdit: Record<string, number> = {};
    if (excludePaymentId && await db.schema.hasTable('payment_credit_applications')) {
      const rows = await db('payment_credit_applications')
        .where({ company_id: companyId, payment_id: excludePaymentId });
      for (const r of rows) consumedByEdit[r.credit_id] = (consumedByEdit[r.credit_id] || 0) + Number(r.applied_amount || 0);
    }

    // Unapplied prepayments: remaining = amount - amount_applied (+ amount consumed by the edited payment)
    const prepRows = await db('vendor_prepayments')
      .where({ company_id: companyId, vendor_id: vendorId })
      .whereNot('status', 'voided')
      .select('id', 'prepayment_number', 'payment_date', 'amount', 'amount_applied', 'reference', 'memo');
    const prepayments = prepRows
      .map((p: any) => ({ ...p, remaining: Number(p.amount) - Number(p.amount_applied || 0) + (consumedByEdit[p.id] || 0) }))
      .filter((p: any) => p.remaining > 0.009);

    // Vendor payments that still have an unapplied balance (overpayments / on-account)
    let payQuery = db('vendor_payments')
      .where({ company_id: companyId, vendor_id: vendorId, is_deleted: false });
    if (excludePaymentId) payQuery = payQuery.whereNot('id', excludePaymentId);
    const payRows = await payQuery
      .select('id', 'payment_number', 'payment_date', 'amount', 'unapplied_amount', 'reference', 'memo')
      .orderBy('payment_date', 'desc');
    const payments = payRows
      .map((p: any) => ({ ...p, unapplied_amount: Number(p.unapplied_amount || 0) + (consumedByEdit[p.id] || 0) }))
      .filter((p: any) => Number(p.unapplied_amount) > 0.009);

    res.json({ success: true, data: { prepayments, payments } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch vendor credits' }); }
});

router.post('/prepayments', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.vendorId) { res.status(400).json({ success: false, error: 'Vendor is required' }); return; }
    if (!d.amount || Number(d.amount) <= 0) { res.status(400).json({ success: false, error: 'Amount must be > 0' }); return; }
    if (!d.bankAccountId) { res.status(400).json({ success: false, error: 'Bank Account is required' }); return; }

    const prepNumber = `PREP-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const insertData: any = {
      company_id: companyId,
      prepayment_number: prepNumber,
      vendor_id: d.vendorId,
      payment_date: d.paymentDate || new Date(),
      amount: Number(d.amount),
      bank_account_id: d.bankAccountId,
      payment_method: d.paymentMethod || 'bank_transfer',
      reference: d.reference || null,
      purchase_order_id: d.purchaseOrderId || null,
      memo: d.memo || null,
      status: 'unapplied',
      created_by: req.user!.id,
    };
    // Persist classification when the columns exist (added by the dept/location migration).
    const [hasDept, hasLoc, hasSub] = await Promise.all([
      db.schema.hasColumn('vendor_prepayments', 'department_id'),
      db.schema.hasColumn('vendor_prepayments', 'location_id'),
      db.schema.hasColumn('vendor_prepayments', 'subsidiary_id'),
    ]);
    if (hasDept) insertData.department_id = d.departmentId || null;
    if (hasLoc)  insertData.location_id = d.locationId || null;
    if (hasSub)  insertData.subsidiary_id = d.subsidiaryId || null;
    const [prep] = await db('vendor_prepayments').insert(insertData).returning('*');

    // ── GL: Dr. Advance Payment to Vendor (1130) / Cr. Bank ──────────────────
    try {
      // Get Advance Payment account (1130)
      let advAcct = await db('accounts').where({ company_id: companyId, code: '1130' }).first();
      if (!advAcct) {
        const [a] = await db('accounts').insert({
          company_id: companyId, code: '1130', name: 'Advance Payment to Vendor',
          type: 'asset', subtype: 'other_current_asset', is_active: true,
        }).returning('*');
        advAcct = a;
      }
      const bankAcct = await db('accounts').where({ id: d.bankAccountId }).first();
      if (advAcct && bankAcct) {
        const jeNum = `JE-PREP-${String(Date.now()).slice(-8)}`;
        const [je] = await db('journal_entries').insert({
          company_id: companyId, journal_number: jeNum,
          entry_date: d.paymentDate || new Date(),
          memo: `Vendor Prepayment ${prepNumber}`,
          source_type: 'vendor_prepayment', source_id: prep.id || prep,
          status: 'posted', created_by: req.user!.id,
        }).returning('id');
        const jeId = je?.id || je;
        await db('journal_entry_lines').insert([
          { journal_id: jeId, line_number: 1, account_id: advAcct.id,  debit: Number(d.amount), credit: 0,              memo: `Advance to vendor` },
          { journal_id: jeId, line_number: 2, account_id: bankAcct.id, debit: 0,                credit: Number(d.amount), memo: `Bank payment` },
        ]);
      }
    } catch (glErr: any) { console.error('[GL ERROR] Prepayment GL:', glErr.message); }

    res.status(201).json({ success: true, data: { ...prep, prepayment_number: prepNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to record prepayment' }); }
});

// ─── Vendor Returns ───────────────────────────────────────────────────────────
router.get('/vendor-returns', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('vendor_returns as vr')
      .leftJoin('vendors as v', 'vr.vendor_id', 'v.id')
      .where({ 'vr.company_id': req.user!.companyId })
      .select('vr.*', 'v.name as vendor_name')
      .orderBy('vr.return_date', 'desc').limit(100);
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to fetch vendor returns' }); }
});

router.get('/vendor-returns/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureVendorReturnCreditTables();
    const vr = await db('vendor_returns as vr')
      .leftJoin('vendors as v', 'vr.vendor_id', 'v.id')
      .leftJoin('locations as l', 'vr.location_id', 'l.id')
      .leftJoin('departments as dep', 'vr.department_id', 'dep.id')
      .leftJoin('subsidiaries as sub', 'vr.subsidiary_id', 'sub.id')
      .leftJoin('users as u', 'vr.created_by', 'u.id')
      .leftJoin('vendor_credits as vc', 'vc.vendor_return_id', 'vr.id')
      .where({ 'vr.id': req.params.id, 'vr.company_id': req.user!.companyId })
      .select('vr.*', 'v.name as vendor_name', 'v.email as vendor_email', 'v.address as vendor_address',
        'l.name as location_name', 'dep.name as department_name', 'sub.name as subsidiary_name', 'u.name as created_by_name',
        'vc.id as credit_id', 'vc.credit_number as credit_number')
      .first();
    if (!vr) { res.status(404).json({ success: false, error: 'Vendor return not found' }); return; }
    const lines = await db('vendor_return_lines as l')
      .leftJoin('items as i', 'l.item_id', 'i.id')
      .leftJoin('locations as loc', 'l.location_id', 'loc.id')
      .where((qb: any) => qb.where('l.return_id', vr.id).orWhere('l.vendor_return_id', vr.id))
      .select('l.*', 'i.item_code', 'i.name as item_name', 'loc.name as location_name');
    res.json({ success: true, data: { ...vr, lines } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch vendor return' }); }
});

// Fulfill a vendor return — ship goods back to vendor, reducing on-hand per line location.
router.post('/vendor-returns/:id/fulfill', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureVendorReturnCreditTables();
    const companyId = req.user!.companyId;
    const vr = await db('vendor_returns').where({ id: req.params.id, company_id: companyId, is_deleted: false }).first();
    if (!vr) { res.status(404).json({ success: false, error: 'Vendor return not found' }); return; }
    if (vr.status === 'fulfilled') { res.status(400).json({ success: false, error: 'Vendor return already fulfilled' }); return; }

    const lines = await db('vendor_return_lines')
      .where((qb: any) => qb.where('return_id', vr.id).orWhere('vendor_return_id', vr.id));
    for (const line of lines as any[]) {
      const locId = line.location_id || vr.location_id;
      if (line.item_id && locId && Number(line.qty) > 0) {
        await db('inventory_balances')
          .where({ company_id: companyId, item_id: line.item_id, location_id: locId })
          .update({ qty_on_hand: db.raw('GREATEST(0, qty_on_hand - ?)', [Number(line.qty)]) });
      }
    }
    const [updated] = await db('vendor_returns').where({ id: vr.id })
      .update({ status: 'fulfilled', fulfilled_at: new Date(), fulfilled_by: req.user!.id, updated_by: req.user!.id })
      .returning('*');
    res.json({ success: true, data: updated, message: 'Vendor return fulfilled; inventory reduced' });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fulfill vendor return' }); }
});

router.post('/vendor-returns', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureVendorReturnCreditTables();
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.vendorId) { res.status(400).json({ success: false, error: 'Vendor is required' }); return; }

    const vrNumber = `VR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const totalAmount = (d.lines || []).reduce((s: number, l: any) => s + Number(l.qty || 0) * Number(l.unitPrice || 0), 0);

    const [vr] = await db('vendor_returns').insert({
      company_id: companyId,
      return_number: vrNumber,
      vendor_id: d.vendorId,
      return_date: d.returnDate || new Date(),
      original_po_number: d.originalPONumber || null,
      return_reason: d.returnReason || null,
      location_id: d.locationId || null,
      department_id: d.departmentId || null,
      subsidiary_id: d.subsidiaryId || null,
      memo: d.memo || null,
      total_amount: totalAmount,
      status: 'open',
      created_by: req.user!.id,
    }).returning('*');

    for (const line of d.lines || []) {
      await db('vendor_return_lines').insert({
        return_id: vr.id,
        item_id: line.itemId || null,
        description: line.description || null,
        qty: Number(line.qty || 0),
        unit_price: Number(line.unitPrice || 0),
        location_id: line.locationId || d.locationId || null,
      });
      // Stock is NOT reduced at create time — it reduces when the return is Fulfilled (shipped back).
    }
    res.status(201).json({ success: true, data: { ...vr, return_number: vrNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to create vendor return' }); }
});

// ─── Vendor Credits ───────────────────────────────────────────────────────────
router.get('/vendor-credits', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('vendor_credits as vc')
      .leftJoin('vendors as v', 'vc.vendor_id', 'v.id')
      .where({ 'vc.company_id': req.user!.companyId })
      .select('vc.*', 'v.name as vendor_name')
      .orderBy('vc.credit_date', 'desc').limit(100);
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to fetch vendor credits' }); }
});

// Open vendor bills (with a remaining balance) for a vendor — for the credit "Apply to Bills" tab.
router.get('/vendor-credits/open-bills', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const vendorId = req.query.vendorId as string;
    if (!vendorId) { res.json({ success: true, data: [] }); return; }
    const bills = await db('vendor_bills')
      .where({ company_id: companyId, vendor_id: vendorId, is_deleted: false })
      .whereNotIn('status', ['paid', 'voided'])
      .andWhere('amount_due', '>', 0)
      .select('id', 'bill_number', 'vendor_bill_number', 'bill_date', 'due_date', 'total_amount', 'amount_paid', 'amount_due', 'status')
      .orderBy('bill_date', 'asc');
    res.json({ success: true, data: bills });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch open bills' }); }
});

router.get('/vendor-credits/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureVendorReturnCreditTables();
    const vc = await db('vendor_credits as vc')
      .leftJoin('vendors as v', 'vc.vendor_id', 'v.id')
      .leftJoin('users as u', 'vc.created_by', 'u.id')
      .where({ 'vc.id': req.params.id, 'vc.company_id': req.user!.companyId })
      .select('vc.*', 'v.name as vendor_name', 'v.email as vendor_email', 'v.address as vendor_address',
        'u.name as created_by_name')
      .first();
    if (!vc) { res.status(404).json({ success: false, error: 'Vendor credit not found' }); return; }
    const lines = await db('vendor_credit_lines as l')
      .leftJoin('items as i', 'l.item_id', 'i.id')
      .where((qb: any) => qb.where('l.credit_id', vc.id).orWhere('l.vendor_credit_id', vc.id))
      .select('l.*', 'i.item_code', 'i.name as item_name');
    const billApplications = await db('vendor_credit_bill_applications as a')
      .leftJoin('vendor_bills as b', 'a.bill_id', 'b.id')
      .where({ 'a.credit_id': vc.id })
      .select('a.*', 'b.bill_number', 'b.vendor_bill_number', 'b.bill_date', 'b.total_amount as bill_total', 'b.amount_due as bill_due');
    const journalEntries = await fetchJEWithLines('vendor_credit', vc.id, db);
    res.json({ success: true, data: { ...vc, lines, billApplications, journalEntries } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch vendor credit' }); }
});

router.post('/vendor-credits', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureVendorReturnCreditTables();
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.vendorId) { res.status(400).json({ success: false, error: 'Vendor is required' }); return; }

    const vcNumber = `VC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const totalAmount = (d.lines || []).reduce((s: number, l: any) => s + Number(l.qty || 0) * Number(l.unitPrice || 0), 0);

    const [vc] = await db('vendor_credits').insert({
      company_id: companyId,
      credit_number: vcNumber,
      vendor_id: d.vendorId,
      credit_date: d.creditDate || new Date(),
      vendor_credit_memo_number: d.creditMemoNumber || null,
      original_bill_number: d.originalBillNumber || null,
      vendor_return_id: d.returnId || null,
      subsidiary_id: d.subsidiaryId || null,
      reason: d.reason || null,
      memo: d.memo || null,
      total_amount: totalAmount,
      status: 'open',
      created_by: req.user!.id,
    }).returning('*');

    for (const line of d.lines || []) {
      await db('vendor_credit_lines').insert({
        credit_id: vc.id,
        item_id: line.itemId || null,
        description: line.description || null,
        qty: Number(line.qty || 0),
        unit_price: Number(line.unitPrice || 0),
      });
    }

    // ── GL: Dr. Accounts Payable / Cr. Inventory Returned Not Credited (2220) ──
    if (totalAmount > 0) {
      try {
        // Get AP account and Inventory Returned account
        const apAcct = await db('accounts').where({ company_id: companyId, code: '2100' }).first(); // AP
        let invRetAcct = await db('accounts').where({ company_id: companyId, code: '2220' }).first();
        if (!invRetAcct) {
          const [a] = await db('accounts').insert({
            company_id: companyId, code: '2220', name: 'Inventory Returned Not Credited',
            type: 'liability', subtype: 'other_current_liability', is_active: true,
          }).returning('*');
          invRetAcct = a;
        }
        if (apAcct && invRetAcct) {
          const jeNum = `JE-VC-${String(Date.now()).slice(-8)}`;
          const [je] = await db('journal_entries').insert({
            company_id: companyId, journal_number: jeNum,
            entry_date: d.creditDate || new Date(),
            memo: `Vendor Credit ${vcNumber}`,
            source_type: 'vendor_credit', source_id: vc.id || vc,
            status: 'posted', created_by: req.user!.id,
          }).returning('id');
          const jeId = je?.id || je;
          await db('journal_entry_lines').insert([
            { journal_id: jeId, line_number: 1, account_id: apAcct.id,     debit: totalAmount, credit: 0,           memo: `Reduce AP balance` },
            { journal_id: jeId, line_number: 2, account_id: invRetAcct.id, debit: 0,           credit: totalAmount, memo: `Inventory credit pending` },
          ]);
        }
      } catch (glErr: any) { console.error('[GL ERROR] Vendor Credit GL:', glErr.message); }
    }

    // ── Apply credit against selected Vendor Bills (reduce AP / amount_due) ────
    const billApps = (d.billApplications || []).filter((b: any) => b.billId && Number(b.amount) > 0);
    if (billApps.length > 0) {
      let appliedTotal = 0;
      for (const app of billApps) {
        const bill = await db('vendor_bills').where({ id: app.billId, company_id: companyId }).first();
        if (!bill) continue;
        const due = Number(bill.amount_due || 0);
        const applyAmt = Math.min(Number(app.amount), due);
        if (applyAmt <= 0) continue;
        await db('vendor_bills').where({ id: bill.id }).update({
          amount_paid: db.raw('COALESCE(amount_paid,0) + ?', [applyAmt]),
          amount_due: db.raw('GREATEST(0, COALESCE(amount_due,0) - ?)', [applyAmt]),
          status: (due - applyAmt) <= 0.009 ? 'paid' : 'partially_paid',
        });
        await db('vendor_credit_bill_applications').insert({
          company_id: companyId, credit_id: vc.id, bill_id: bill.id, applied_amount: applyAmt,
        });
        appliedTotal += applyAmt;
      }
      if (appliedTotal > 0) {
        await db('vendor_credits').where({ id: vc.id }).update({
          applied_amount: appliedTotal,
          status: appliedTotal >= totalAmount - 0.009 ? 'applied' : 'open',
        });
      }
    }

    res.status(201).json({ success: true, data: { ...vc, credit_number: vcNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to create vendor credit' }); }
});

// ── Audit routes ──────────────────────────────────────────────────────────────
const auditSub = (sourceType: string) => async (req: any, res: any) => {
  try { const l = await (db as any)('transaction_audit_log').where({ company_id: req.user.companyId, source_type: sourceType, source_id: req.params.id }).orderBy('performed_at','desc').limit(200); res.json({ success:true, data:l }); } catch(e:any){ res.status(500).json({success:false,error:e.message}); }
};
router.get('/orders/:id/audit',    auditSub('purchase_order'));
router.get('/bills/:id/audit',     auditSub('vendor_bill'));
router.get('/receipts/:id/audit',  auditSub('item_receipt'));
router.get('/payments/:id/audit',  auditSub('vendor_payment'));
router.get('/prepayments/:id/audit', auditSub('vendor_prepayment'));

export default router;
