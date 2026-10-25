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

// Resolve a tax code — accepts either a tax_codes.id (UUID) or a tax code string
// (e.g. "PPN11") — into the tax_codes.id, scoped to the company. Returns null if unmatched.
async function resolveTaxCodeId(trx: any, companyId: string, taxCode: any): Promise<string | null> {
  if (!taxCode) return null;
  const val = String(taxCode).trim();
  if (!val) return null;
  // Match by code, and only by id when the value is a valid UUID (comparing the uuid
  // column against a non-uuid string like "PPN11" throws in Postgres).
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
  const row = await trx('tax_codes')
    .where({ company_id: companyId })
    .andWhere((qb: any) => {
      qb.where('code', val);
      if (isUuid) qb.orWhere('id', val);
    })
    .first();
  return row ? row.id : null;
}

// Resolve the Customer Deposit liability account. Always prefer 2700 (Customer Deposit);
// fall back to legacy 2210, and create 2700 if neither exists.
async function getCustomerDepositAccount(trx: any, companyId: string): Promise<any> {
  let acct = await trx('accounts').where({ company_id: companyId, code: '2700' }).first();
  if (acct) return acct;
  acct = await trx('accounts').where({ company_id: companyId, code: '2210' }).first();
  if (acct) return acct;
  const [a] = await trx('accounts').insert({
    company_id: companyId, code: '2700', name: 'Customer Deposit',
    type: 'liability', subtype: 'other_current_liability', is_active: true,
  }).returning('*');
  return a;
}

// Ensure sales_orders / invoices have a due_date column (added by migration 013).
let _soDueEnsured = false;
async function ensureSoDueDate(): Promise<void> {
  if (_soDueEnsured) return;
  if (!(await db.schema.hasColumn('sales_orders', 'due_date'))) {
    await db.schema.alterTable('sales_orders', (t: any) => { t.date('due_date').nullable(); });
  }
  _soDueEnsured = true;
}

// Ensure sales_orders has a quotation_id column (in schema, but missing on some DBs).
let _soQuotationEnsured = false;
async function ensureSoQuotationId(): Promise<void> {
  if (_soQuotationEnsured) return;
  if (!(await db.schema.hasColumn('sales_orders', 'quotation_id'))) {
    await db.schema.alterTable('sales_orders', (t: any) => { t.uuid('quotation_id').nullable(); });
  }
  _soQuotationEnsured = true;
}

// Ensure customer_payments has an ar_account_id column (in schema, but missing on some DBs).
let _cpArEnsured = false;
async function ensureCustomerPaymentArAccount(): Promise<void> {
  if (_cpArEnsured) return;
  if (!(await db.schema.hasColumn('customer_payments', 'ar_account_id'))) {
    await db.schema.alterTable('customer_payments', (t: any) => { t.uuid('ar_account_id').nullable(); });
  }
  _cpArEnsured = true;
}

// Ensure customer_deposits has an amount_applied column + the credit-application table.
let _cpcaEnsured = false;
async function ensureCustomerCreditTables(trx: any = db): Promise<void> {
  if (_cpcaEnsured) return;
  const hasApplied = await trx.schema.hasColumn('customer_deposits', 'amount_applied');
  if (!hasApplied) {
    await trx.schema.alterTable('customer_deposits', (t: any) => { t.decimal('amount_applied', 20, 4).defaultTo(0); });
  }
  const hasTable = await trx.schema.hasTable('customer_credit_applications');
  if (!hasTable) {
    await trx.schema.createTable('customer_credit_applications', (t: any) => {
      t.uuid('id').primary().defaultTo(trx.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable();
      t.uuid('payment_id').notNullable();
      t.string('credit_type', 40).notNullable(); // 'customer_deposit' | 'customer_payment'
      t.uuid('credit_id').notNullable();
      t.decimal('applied_amount', 20, 4).notNullable();
      t.timestamps(true, true);
    });
  }
  _cpcaEnsured = true;
}

// Apply customer credits (deposits / unapplied payments) to a customer payment.
async function applyCustomerCredits(trx: any, companyId: string, paymentId: string, credits: any[]): Promise<number> {
  if (!credits || credits.length === 0) return 0;
  await ensureCustomerCreditTables(trx);
  let total = 0;
  for (const c of credits) {
    const amt = Number(c.amount || 0);
    if (!c.creditId || amt <= 0) continue;
    if (c.creditType === 'customer_deposit') {
      const dep = await trx('customer_deposits').where({ id: c.creditId, company_id: companyId }).first();
      if (!dep) continue;
      const remaining = Number(dep.amount) - Number(dep.amount_applied || 0);
      const apply = Math.min(amt, remaining);
      if (apply <= 0) continue;
      const newApplied = Number(dep.amount_applied || 0) + apply;
      await trx('customer_deposits').where({ id: dep.id }).update({
        amount_applied: newApplied,
        status: newApplied >= Number(dep.amount) - 0.009 ? 'applied' : dep.status,
      });
      await trx('customer_credit_applications').insert({
        company_id: companyId, payment_id: paymentId, credit_type: 'customer_deposit', credit_id: dep.id, applied_amount: apply,
      });
      total += apply;
    } else if (c.creditType === 'customer_payment') {
      const src = await trx('customer_payments').where({ id: c.creditId, company_id: companyId }).first();
      if (!src) continue;
      const remaining = Number(src.unapplied_amount || 0);
      const apply = Math.min(amt, remaining);
      if (apply <= 0) continue;
      const newUnapplied = Math.max(0, remaining - apply);
      await trx('customer_payments').where({ id: src.id }).update({
        unapplied_amount: newUnapplied,
        status: newUnapplied <= 0.009 ? 'applied' : src.status,
      });
      await trx('customer_credit_applications').insert({
        company_id: companyId, payment_id: paymentId, credit_type: 'customer_payment', credit_id: src.id, applied_amount: apply,
      });
      total += apply;
    }
  }
  return total;
}

async function reverseCustomerCredits(trx: any, companyId: string, paymentId: string): Promise<void> {
  const has = await trx.schema.hasTable('customer_credit_applications');
  if (!has) return;
  const apps = await trx('customer_credit_applications').where({ payment_id: paymentId });
  for (const a of apps) {
    if (a.credit_type === 'customer_deposit') {
      const dep = await trx('customer_deposits').where({ id: a.credit_id }).first();
      if (dep) {
        const newApplied = Math.max(0, Number(dep.amount_applied || 0) - Number(a.applied_amount));
        await trx('customer_deposits').where({ id: dep.id }).update({
          amount_applied: newApplied,
          status: newApplied <= 0.009 ? 'posted' : dep.status,
        });
      }
    } else if (a.credit_type === 'customer_payment') {
      const src = await trx('customer_payments').where({ id: a.credit_id }).first();
      if (src) {
        await trx('customer_payments').where({ id: src.id }).update({
          unapplied_amount: Number(src.unapplied_amount || 0) + Number(a.applied_amount),
          status: 'open',
        });
      }
    }
  }
  await trx('customer_credit_applications').where({ payment_id: paymentId }).del();
}

// Post GL for a customer payment, accounting for applied credits:
//   Dr. Bank = cash received
//   Dr. Customer Deposit (2700) = deposit/credit applied
//   Cr. AR = total invoices settled (cash + credits)
async function postCustomerPaymentWithCredits(trx: any, companyId: string, paymentId: string, creditsApplied: number, userId: string): Promise<void> {
  const payment = await trx('customer_payments as p')
    .join('customers as c', 'p.customer_id', 'c.id')
    .select('p.*', 'c.name as customer_name', 'c.ar_account_id as cust_ar_account_id')
    .where('p.id', paymentId).first();
  if (!payment) throw new AppError('Payment not found', 404);
  if (payment.is_posted) return;

  const defaultBank = await AccountingEngine.getDefaultAccount(companyId, '1020', trx)
    || (await trx('accounts').where({ company_id: companyId, subtype: 'bank' }).orderBy('code').first())?.id
    || (await trx('accounts').where({ company_id: companyId, code: '1010' }).first())?.id;
  // Resolve AR: explicit → customer default → code 1100 → subtype 'receivable' → code 1200
  const defaultAR = await AccountingEngine.getDefaultAccount(companyId, '1100', trx)
    || (await trx('accounts').where({ company_id: companyId, subtype: 'receivable' }).orderBy('code').first())?.id
    || (await trx('accounts').where({ company_id: companyId, code: '1200' }).first())?.id;
  const bankAccountId = payment.bank_account_id || defaultBank;
  const arAccountId = payment.ar_account_id || payment.cust_ar_account_id || defaultAR;
  if (!arAccountId) throw new AppError('AR account not configured.', 400);

  const cash = Number(payment.amount);
  const credits = Number(creditsApplied || 0);

  if (credits <= 0.009) {
    if (cash <= 0.009) { await trx('customer_payments').where({ id: paymentId }).update({ is_posted: true }); return; }
    if (!bankAccountId) throw new AppError('Bank account not configured.', 400);
    await AccountingEngine.createJournalEntry({
      companyId, date: payment.payment_date, sourceType: 'customer_payment', sourceId: paymentId,
      memo: `Customer Payment ${payment.payment_number}`,
      lines: [
        { accountId: bankAccountId, debit: cash, credit: 0, memo: `Receipt from ${payment.customer_name}` },
        { accountId: arAccountId, debit: 0, credit: cash, entityCustomerId: payment.customer_id, memo: `AR Settlement - ${payment.customer_name}` },
      ],
      createdBy: userId, trx,
    });
    await trx('customer_payments').where({ id: paymentId }).update({ is_posted: true });
    return;
  }

  if (cash > 0.009 && !bankAccountId) throw new AppError('Bank account not configured.', 400);
  const depositLiabId = (await getCustomerDepositAccount(trx, companyId))?.id;
  if (!depositLiabId) throw new AppError('Customer Deposit account (2700) not configured.', 400);
  const arSettled = cash + credits;
  const lines: any[] = [
    { accountId: depositLiabId, debit: credits, credit: 0, entityCustomerId: payment.customer_id, memo: `Customer credit applied - ${payment.customer_name}` },
    { accountId: arAccountId, debit: 0, credit: arSettled, entityCustomerId: payment.customer_id, memo: `AR Settlement - ${payment.customer_name}` },
  ];
  if (cash > 0.009) {
    lines.unshift({ accountId: bankAccountId, debit: cash, credit: 0, memo: `Receipt from ${payment.customer_name}` });
  }
  await AccountingEngine.createJournalEntry({
    companyId, date: payment.payment_date, sourceType: 'customer_payment', sourceId: paymentId,
    memo: `Customer Payment ${payment.payment_number}`,
    lines, createdBy: userId, trx,
  });
  await trx('customer_payments').where({ id: paymentId }).update({ is_posted: true });
}

// ===== QUOTATIONS =====
router.get('/quotations', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, sortBy, sortDir, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    let query = db('quotations as q').join('customers as c', 'q.customer_id', 'c.id')
      .leftJoin('users as u', 'q.sales_rep_id', 'u.id')
      .where({ 'q.company_id': companyId, 'q.is_deleted': false })
      .select('q.*', 'c.name as customer_name', 'u.name as sales_rep_name');
    if (search) query = query.where((qb: any) => qb.whereILike('q.quotation_number', `%${search}%`).orWhereILike('c.name', `%${search}%`));
    if (req.query.status) query = query.where({ 'q.status': req.query.status });
    const total = parseInt((await query.clone().clearSelect().count('* as count').first() as any)?.count || '0');
    const data = await query.orderBy('q.quotation_date', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch quotations' }); }
});

router.get('/quotations/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureSoQuotationId();
    const q = await db('quotations as qt').join('customers as c', 'qt.customer_id', 'c.id')
      .leftJoin('users as u', 'qt.sales_rep_id', 'u.id')
      .leftJoin('locations as l', 'qt.location_id', 'l.id')
      .leftJoin('departments as dep', 'qt.department_id', 'dep.id')
      .leftJoin('subsidiaries as sub', 'qt.subsidiary_id', 'sub.id')
      .leftJoin('sales_orders as so', 'so.quotation_id', 'qt.id')
      .where({ 'qt.id': req.params.id, 'qt.company_id': req.user!.companyId })
      .select('qt.*', 'c.name as customer_name', 'c.email as customer_email', 'c.phone as customer_phone',
        'c.address as billing_address', 'u.name as sales_rep_name', 'l.name as location_name',
        'dep.name as department_name', 'sub.name as subsidiary_name',
        'so.id as so_id', 'so.so_number as so_number')
      .first();
    if (!q) { res.status(404).json({ success: false, error: 'Quotation not found' }); return; }
    const lines = await db('quotation_lines as ql').join('items as i', 'ql.item_id', 'i.id')
      .leftJoin('units_of_measure as uom', 'ql.uom_id', 'uom.id')
      .leftJoin('tax_codes as tc', 'ql.tax_code_id', 'tc.id')
      .where({ 'ql.quotation_id': q.id }).orderBy('ql.line_number')
      .select('ql.*', 'i.item_code', 'i.name as item_name', 'uom.code as uom_code', 'uom.name as uom_name', 'tc.code as tax_code', 'tc.rate as tax_rate');
    res.json({ success: true, data: { ...q, lines } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch quotation' }); }
});

router.post('/quotations', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    if (!d.customerId || !d.quotationDate) {
      res.status(400).json({ success: false, error: 'Customer and date are required' }); return;
    }
    const qtNumber = await resolveTransactionNumber(companyId, 'quotation', req.body?.documentNumber, db);
    const lines = d.lines || [];
    let subtotal = 0, taxAmount = 0;
    for (const line of lines) {
      const amt = (line.quantity * line.unitPrice) - (line.discountAmount || 0);
      subtotal += amt;
      taxAmount += line.taxAmount || 0;
    }
    const [qt] = await db('quotations').insert({
      company_id: companyId, subsidiary_id: d.subsidiaryId || null,
      quotation_number: qtNumber, customer_id: d.customerId,
      quotation_date: d.quotationDate, expiry_date: d.expiryDate || null,
      currency: d.currency || 'IDR', exchange_rate: d.exchangeRate || 1,
      price_level: d.priceLevel, sales_rep_id: d.salesRepId || req.user!.id,
      location_id: d.locationId || null, department_id: d.departmentId || null,
      status: d.status || 'in_discussion', memo: d.memo,
      subtotal, discount_amount: d.discountAmount || 0, tax_amount: taxAmount,
      shipping_amount: d.shippingAmount || 0,
      total_amount: subtotal + taxAmount + (d.shippingAmount || 0) - (d.discountAmount || 0),
      created_by: req.user!.id,
    }).returning('*');
    if (lines.length > 0) {
      await db('quotation_lines').insert(lines.map((l: any, idx: number) => ({
        quotation_id: qt.id, line_number: idx + 1, item_id: l.itemId, description: l.description,
        quantity: l.quantity, uom_id: l.uomId || null, unit_price: l.unitPrice,
        discount_percent: l.discountPercent || 0, discount_amount: l.discountAmount || 0,
        tax_code_id: l.taxCodeId || null, tax_amount: l.taxAmount || 0,
        amount: (l.quantity * l.unitPrice) - (l.discountAmount || 0),
      })));
    }
    res.status(201).json({ success: true, data: qt });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to create quotation' }); }
});

// Update quotation (header + replace lines)
router.put('/quotations/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    const existing = await db('quotations').where({ id: req.params.id, company_id: companyId, is_deleted: false }).first();
    if (!existing) { res.status(404).json({ success: false, error: 'Quotation not found' }); return; }
    if (existing.status === 'converted') { res.status(400).json({ success: false, error: 'Cannot edit a converted quotation' }); return; }

    const lines = d.lines || [];
    let subtotal = 0, taxAmount = 0;
    for (const line of lines) {
      const amt = (line.quantity * line.unitPrice) - (line.discountAmount || 0);
      subtotal += amt;
      taxAmount += line.taxAmount || 0;
    }
    const [qt] = await db('quotations').where({ id: existing.id }).update({
      subsidiary_id: d.subsidiaryId || null,
      customer_id: d.customerId ?? existing.customer_id,
      quotation_date: d.quotationDate ?? existing.quotation_date,
      expiry_date: d.expiryDate || null,
      currency: d.currency ?? existing.currency,
      exchange_rate: d.exchangeRate || existing.exchange_rate,
      sales_rep_id: d.salesRepId || existing.sales_rep_id,
      location_id: d.locationId || null, department_id: d.departmentId || null,
      status: d.status ?? existing.status,
      memo: d.memo ?? existing.memo,
      subtotal, discount_amount: d.discountAmount || 0, tax_amount: taxAmount,
      shipping_amount: d.shippingAmount || 0,
      total_amount: subtotal + taxAmount + (d.shippingAmount || 0) - (d.discountAmount || 0),
      updated_by: req.user!.id, updated_at: new Date(),
    }).returning('*');

    await db('quotation_lines').where({ quotation_id: existing.id }).del();
    if (lines.length > 0) {
      await db('quotation_lines').insert(lines.map((l: any, idx: number) => ({
        quotation_id: existing.id, line_number: idx + 1, item_id: l.itemId, description: l.description,
        quantity: l.quantity, uom_id: l.uomId || null, unit_price: l.unitPrice,
        discount_percent: l.discountPercent || 0, discount_amount: l.discountAmount || 0,
        tax_code_id: l.taxCodeId || null, tax_amount: l.taxAmount || 0,
        amount: (l.quantity * l.unitPrice) - (l.discountAmount || 0),
      })));
    }
    res.json({ success: true, data: qt });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to update quotation' }); }
});

// Update quotation status only (In Discussion / Proposal / In Negotiation / Purchasing)
router.patch('/quotations/:id/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { status } = req.body;
    const allowed = ['in_discussion', 'proposal', 'in_negotiation', 'purchasing', 'converted', 'draft', 'submitted', 'approved', 'rejected', 'closed'];
    if (!status || !allowed.includes(status)) { res.status(400).json({ success: false, error: 'Invalid status' }); return; }
    const existing = await db('quotations').where({ id: req.params.id, company_id: companyId, is_deleted: false }).first();
    if (!existing) { res.status(404).json({ success: false, error: 'Quotation not found' }); return; }
    const [qt] = await db('quotations').where({ id: existing.id }).update({ status, updated_by: req.user!.id, updated_at: new Date() }).returning('*');
    res.json({ success: true, data: qt });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to update status' }); }
});

// Convert Quotation to Sales Order
router.post('/quotations/:id/convert', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    await ensureSoQuotationId();
    const qt = await db('quotations').where({ id: req.params.id, company_id: companyId, is_deleted: false }).first();
    if (!qt) { res.status(404).json({ success: false, error: 'Quotation not found' }); return; }
    if (qt.status === 'converted') {
      res.status(400).json({ success: false, error: `Quotation already converted` }); return;
    }
    const qtLines = await db('quotation_lines').where({ quotation_id: qt.id }).orderBy('line_number');
    // Sanitize legacy lines (old form could persist null quantity / NaN amounts)
    const num = (v: any, d = 0): number => { const n = Number(v); return Number.isFinite(n) ? n : d; };
    const soLines = qtLines.map((l: any) => {
      const quantity = num(l.quantity, 1) || 1;
      const unitPrice = num(l.unit_price, 0);
      const discountAmount = num(l.discount_amount, 0);
      const taxAmount = num(l.tax_amount, 0);
      const amount = quantity * unitPrice - discountAmount;
      return {
        line_number: l.line_number, item_id: l.item_id, description: l.description,
        quantity, uom_id: l.uom_id, unit_price: unitPrice,
        discount_percent: num(l.discount_percent, 0), discount_amount: discountAmount,
        tax_code_id: l.tax_code_id, tax_amount: taxAmount, amount,
      };
    });
    const subtotal = soLines.reduce((s: number, l: any) => s + l.amount, 0);
    const taxTotal = soLines.reduce((s: number, l: any) => s + l.tax_amount, 0);
    const discountTotal = soLines.reduce((s: number, l: any) => s + l.discount_amount, 0);
    const shipping = num(qt.shipping_amount, 0);

    const soNumber = await generateTransactionNumber(companyId, 'sales_order', db);
    const soApprover = await resolveApprover(companyId, 'sales_orders', req.user!.id);
    const [so] = await db('sales_orders').insert({
      company_id: companyId, subsidiary_id: qt.subsidiary_id, so_number: soNumber,
      quotation_id: qt.id, customer_id: qt.customer_id, order_date: new Date().toISOString().split('T')[0],
      currency: qt.currency, exchange_rate: qt.exchange_rate || 1, payment_terms: req.body.paymentTerms,
      sales_rep_id: qt.sales_rep_id, location_id: qt.location_id, department_id: qt.department_id,
      status: 'pending_fulfillment', memo: qt.memo,
      subtotal, discount_amount: discountTotal, tax_amount: taxTotal,
      shipping_amount: shipping, total_amount: subtotal + taxTotal + shipping,
      approved_by: soApprover, approved_at: new Date(), created_by: req.user!.id,
    }).returning('*');
    if (soLines.length > 0) {
      await db('sales_order_lines').insert(soLines.map((l: any) => ({ so_id: so.id, ...l })));
    }
    await db('quotations').where({ id: qt.id }).update({ status: 'converted', updated_by: req.user!.id });
    res.json({ success: true, data: so, message: 'Quotation converted to Sales Order' });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to convert quotation' }); }
});

// ===== SALES ORDERS =====
router.get('/orders', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, sortDir, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    let query = db('sales_orders as so').join('customers as c', 'so.customer_id', 'c.id')
      .leftJoin('users as u', 'so.sales_rep_id', 'u.id')
      .leftJoin('locations as l', 'so.location_id', 'l.id')
      .where({ 'so.company_id': companyId, 'so.is_deleted': false })
      .select('so.*', 'c.name as customer_name', 'u.name as sales_rep_name', 'l.name as location_name');
    if (search) query = query.where((qb: any) => qb.whereILike('so.so_number', `%${search}%`).orWhereILike('c.name', `%${search}%`));
    if (req.query.status) query = query.where({ 'so.status': req.query.status });
    if (req.query.customerId) query = query.where({ 'so.customer_id': req.query.customerId });
    const total = parseInt((await query.clone().clearSelect().count('* as count').first() as any)?.count || '0');
    const data = await query.orderBy('so.order_date', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch sales orders' }); }
});

router.get('/orders/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const so = await db('sales_orders as so').join('customers as c', 'so.customer_id', 'c.id')
      .leftJoin('users as u', 'so.sales_rep_id', 'u.id')
      .leftJoin('locations as l', 'so.location_id', 'l.id')
      .leftJoin('departments as dep', 'so.department_id', 'dep.id')
      .leftJoin('subsidiaries as sub', 'so.subsidiary_id', 'sub.id')
      .leftJoin('accounts as da', 'so.discount_account_id', 'da.id')
      .leftJoin('users as ab', 'so.approved_by', 'ab.id')
      .where({ 'so.id': req.params.id, 'so.company_id': req.user!.companyId })
      .select('so.*', 'c.name as customer_name', 'c.email as customer_email', 'c.address as billing_address',
        'c.payment_terms as customer_payment_terms', 'u.name as sales_rep_name',
        'l.name as location_name', 'dep.name as department_name', 'sub.name as subsidiary_name',
        'da.code as discount_account_code', 'da.name as discount_account_name', 'ab.name as approved_by_name')
      .first();
    if (!so) { res.status(404).json({ success: false, error: 'Sales order not found' }); return; }
    const lines = await db('sales_order_lines as sol').join('items as i', 'sol.item_id', 'i.id')
      .leftJoin('units_of_measure as uom', 'sol.uom_id', 'uom.id')
      .leftJoin('tax_codes as tc', 'sol.tax_code_id', 'tc.id')
      .where({ 'sol.so_id': so.id }).orderBy('sol.line_number')
      .select('sol.*', 'i.item_code', 'i.name as item_name', 'uom.code as uom_code', 'uom.name as uom_name',
        'uom.conversion_rate_to_base as uom_rate', 'tc.code as tax_code', 'tc.rate as tax_rate');
    const fulfillments = await db('item_fulfillments').where({ so_id: so.id });
    const invoices = await db('invoices').where({ so_id: so.id, is_deleted: false });
    const journalEntries = await fetchJEWithLines('sales_order', so.id, db);
    res.json({ success: true, data: { ...so, lines, fulfillments, invoices, journalEntries } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch sales order' }); }
});

router.post('/orders', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    if (!d.customerId || !d.orderDate) {
      res.status(400).json({ success: false, error: 'Customer and order date are required' }); return;
    }
    await ensureSoDueDate();
    const soNumber = await resolveTransactionNumber(companyId, 'sales_order', d.documentNumber, db);
    const lines = d.lines || [];
    let subtotal = 0, taxAmount = 0, discountTotal = 0;
    for (const line of lines) {
      const gross = line.quantity * line.unitPrice;
      const lineDiscount = line.discountAmount != null ? Number(line.discountAmount) : gross * ((line.discountPercent || 0) / 100);
      subtotal += gross - lineDiscount;
      discountTotal += lineDiscount;
      taxAmount += line.taxAmount || 0;
    }
    const [so] = await db('sales_orders').insert({
      company_id: companyId, subsidiary_id: d.subsidiaryId || null, so_number: soNumber,
      customer_id: d.customerId, order_date: d.orderDate, expected_ship_date: d.expectedShipDate,
      due_date: d.dueDate || null,
      currency: d.currency || 'IDR', exchange_rate: d.exchangeRate || 1,
      payment_terms: d.paymentTerms, sales_rep_id: d.salesRepId || req.user!.id,
      location_id: d.locationId || null, department_id: d.departmentId || null,
      shipping_address: d.shippingAddress, shipping_method: d.shippingMethod,
      status: 'pending_approval', memo: d.memo,
      subtotal, discount_amount: discountTotal, discount_account_id: d.discountAccountId || null, tax_amount: taxAmount,
      shipping_amount: d.shippingAmount || 0,
      total_amount: subtotal + taxAmount + (d.shippingAmount || 0),
      created_by: req.user!.id,
    }).returning('*');
    if (lines.length > 0) {
      const soLineInserts = [];
      for (let idx = 0; idx < lines.length; idx++) {
        const l = lines[idx];
        const gross = l.quantity * l.unitPrice;
        const lineDiscount = l.discountAmount != null ? Number(l.discountAmount) : gross * ((l.discountPercent || 0) / 100);
        const taxCodeId = await resolveTaxCodeId(db, companyId, l.taxCodeId || l.taxCode);
        soLineInserts.push({
          so_id: so.id, line_number: idx + 1, item_id: l.itemId, description: l.description,
          quantity: l.quantity, uom_id: l.uomId || null, unit_price: l.unitPrice,
          discount_percent: l.discountPercent || 0, discount_amount: lineDiscount,
          discount_account_id: l.discountAccountId || null,
          tax_code_id: taxCodeId, tax_amount: l.taxAmount || 0,
          amount: gross - lineDiscount,
          expected_ship_date: l.expectedShipDate,
        });
      }
      await db('sales_order_lines').insert(soLineInserts);

      // NOTE: inventory is NOT committed at create. Available only reduces once the
      // SO is approved (see POST /orders/:id/approve). A pending_approval SO does
      // not reserve stock.
    }
    await createAuditLog({ companyId, userId: req.user!.id, action: 'create', entityType: 'sales_order', entityId: so.id, entityNumber: so.so_number });
    res.status(201).json({ success: true, data: so });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to create sales order' }); }
});

// Update Sales Order (edit)
router.put('/orders/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    const existing = await db('sales_orders').where({ id: req.params.id, company_id: companyId }).first();
    if (!existing) { res.status(404).json({ success: false, error: 'Sales order not found' }); return; }
    await ensureSoDueDate();

    const lines = d.lines || [];
    let subtotal = 0, taxAmount = 0, discountTotal = 0;
    for (const line of lines) {
      const gross = line.quantity * line.unitPrice;
      const lineDiscount = line.discountAmount != null ? Number(line.discountAmount) : gross * ((line.discountPercent || 0) / 100);
      subtotal += gross - lineDiscount;
      discountTotal += lineDiscount;
      taxAmount += line.taxAmount || 0;
    }

    // Inventory is only committed once the SO has been approved. A pending_approval
    // SO holds no reservation, so we only release/re-commit for committed SOs.
    const isCommitted = !['pending_approval', 'cancelled', 'draft'].includes(existing.status);

    // Release previous committed reservations for old lines (only if currently committed)
    if (isCommitted) {
      const oldLines = await db('sales_order_lines').where({ so_id: req.params.id });
      for (const ol of oldLines) {
        if (ol.item_id && Number(ol.quantity) > 0) {
          try {
            const baseQty = await InventoryEngine.toBaseQty(db, ol.uom_id || null, Number(ol.quantity));
            await InventoryEngine.releaseCommitted(db, companyId, ol.item_id, baseQty, existing.location_id || null);
          } catch (_) {}
        }
      }
    }

    const [so] = await db('sales_orders').where({ id: req.params.id }).update({
      customer_id: d.customerId ?? existing.customer_id,
      order_date: d.orderDate ?? existing.order_date,
      expected_ship_date: d.expectedShipDate || null,
      due_date: d.dueDate || null,
      currency: d.currency ?? existing.currency,
      exchange_rate: d.exchangeRate || existing.exchange_rate || 1,
      payment_terms: d.paymentTerms ?? existing.payment_terms,
      location_id: d.locationId || null, department_id: d.departmentId || null,
      subsidiary_id: d.subsidiaryId || null,
      memo: d.memo ?? existing.memo,
      subtotal, discount_amount: discountTotal, discount_account_id: d.discountAccountId || null, tax_amount: taxAmount,
      shipping_amount: d.shippingAmount || 0,
      total_amount: subtotal + taxAmount + (d.shippingAmount || 0),
      updated_by: req.user!.id, updated_at: new Date(),
    }).returning('*');

    // Upsert lines in place so fulfilled/invoiced lines (referenced via so_line_id) are preserved
    const existingSoLines = await db('sales_order_lines').where({ so_id: so.id });
    const keptSoIds: string[] = [];
    for (let idx = 0; idx < lines.length; idx++) {
      const l = lines[idx];
      const gross = l.quantity * l.unitPrice;
      const lineDiscount = l.discountAmount != null ? Number(l.discountAmount) : gross * ((l.discountPercent || 0) / 100);
      const taxCodeId = await resolveTaxCodeId(db, companyId, l.taxCodeId || l.taxCode);
      const row = {
        so_id: so.id, line_number: idx + 1, item_id: l.itemId, description: l.description,
        quantity: l.quantity, uom_id: l.uomId || null, unit_price: l.unitPrice,
        discount_percent: l.discountPercent || 0, discount_amount: lineDiscount,
        discount_account_id: l.discountAccountId || null,
        tax_code_id: taxCodeId, tax_amount: l.taxAmount || 0,
        amount: gross - lineDiscount, expected_ship_date: l.expectedShipDate,
      };
      if (l.lineId && existingSoLines.some((e: any) => e.id === l.lineId)) {
        await db('sales_order_lines').where({ id: l.lineId }).update(row);
        keptSoIds.push(l.lineId);
      } else {
        const [ins] = await db('sales_order_lines').insert(row).returning('id');
        keptSoIds.push(typeof ins === 'object' ? ins.id : ins);
      }
    }
    for (const e of existingSoLines) {
      if (keptSoIds.includes(e.id)) continue;
      const ff = await db('item_fulfillment_lines').where({ so_line_id: e.id }).first();
      const inv = await db('invoice_lines').where({ so_line_id: e.id }).first();
      if (ff || inv) {
        res.status(400).json({ success: false, error: 'Cannot remove a line that already has a fulfillment or invoice. Adjust quantity instead.' });
        return;
      }
      await db('sales_order_lines').where({ id: e.id }).del();
    }
    // Re-commit inventory for the updated lines (only if the SO is in a committed state)
    if (isCommitted) {
      for (const l of lines) {
        if (l.itemId && Number(l.quantity) > 0) {
          try {
            const baseQty = await InventoryEngine.toBaseQty(db, l.uomId || null, Number(l.quantity));
            await InventoryEngine.commitInventory(db, companyId, l.itemId, baseQty, d.locationId || null);
          } catch (_) {}
        }
      }
    }
    await createAuditLog({ companyId, userId: req.user!.id, action: 'update', entityType: 'sales_order', entityId: so.id, entityNumber: so.so_number });
    res.json({ success: true, data: so });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to update sales order' }); }
});

// Approve Sales Order
router.post('/orders/:id/approve', async (req: Request, res: Response): Promise<void> => {
  try {
    const so = await db('sales_orders').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!so) { res.status(404).json({ success: false, error: 'Sales order not found' }); return; }
    if (so.status !== 'pending_approval') {
      res.status(400).json({ success: false, error: `Cannot approve a sales order with status: ${so.status}` }); return;
    }
    const soApprover = await resolveApprover(req.user!.companyId, 'sales_orders', req.user!.id);
    const [updated] = await db('sales_orders').where({ id: so.id })
      .update({ status: 'pending_fulfillment', approved_by: soApprover, approved_at: new Date() })
      .returning('*');

    // Commit inventory on approval so Available (on_hand − committed) reduces now.
    const soLines = await db('sales_order_lines').where({ so_id: so.id });
    for (const l of soLines) {
      if (!l.item_id || !(Number(l.quantity) > 0)) continue;
      try {
        const baseQty = await InventoryEngine.toBaseQty(db, l.uom_id || null, Number(l.quantity));
        await InventoryEngine.commitInventory(db, req.user!.companyId, l.item_id, baseQty, so.location_id || null);
      } catch (invErr: any) { console.error('[INV WARNING] SO approve commit skipped:', invErr.message); }
    }

    await createAuditLog({ companyId: req.user!.companyId, userId: req.user!.id, action: 'approve', entityType: 'sales_order', entityId: so.id, entityNumber: so.so_number });
    res.json({ success: true, data: updated, message: 'Sales order approved' });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to approve sales order' }); }
});

router.post('/orders/:id/reject', async (req: Request, res: Response): Promise<void> => {
  try {
    const so = await db('sales_orders').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!so) { res.status(404).json({ success: false, error: 'Sales order not found' }); return; }
    if (!['pending_approval', 'pending_fulfillment'].includes(so.status)) {
      res.status(400).json({ success: false, error: `Cannot reject a sales order with status: ${so.status}` }); return;
    }
    const reason = req.body.reason || 'Rejected by approver';

    // If the SO was already approved (committed), release the reservation so Available is restored.
    if (so.status === 'pending_fulfillment') {
      const soLines = await db('sales_order_lines').where({ so_id: so.id });
      for (const l of soLines) {
        if (!l.item_id || !(Number(l.quantity) > 0)) continue;
        try {
          const baseQty = await InventoryEngine.toBaseQty(db, l.uom_id || null, Number(l.quantity));
          await InventoryEngine.releaseCommitted(db, req.user!.companyId, l.item_id, baseQty, so.location_id || null);
        } catch (invErr: any) { console.error('[INV WARNING] SO reject release skipped:', invErr.message); }
      }
    }

    const [updated] = await db('sales_orders').where({ id: so.id })
      .update({ status: 'cancelled', memo: `${so.memo || ''}\n[REJECTED] ${reason}`.trim(), updated_by: req.user!.id })
      .returning('*');
    await createAuditLog({ companyId: req.user!.companyId, userId: req.user!.id, action: 'reject', entityType: 'sales_order', entityId: so.id, entityNumber: so.so_number });
    res.json({ success: true, data: updated, message: 'Sales order rejected' });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to reject sales order' }); }
});

// Create Fulfillment from Sales Order
router.post('/orders/:id/fulfill', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const so = await db('sales_orders').where({ id: req.params.id, company_id: companyId }).first();
    if (!so) { res.status(404).json({ success: false, error: 'Sales order not found' }); return; }
    if (!['pending_fulfillment', 'partially_fulfilled'].includes(so.status)) {
      res.status(400).json({ success: false, error: `Sales order cannot be fulfilled in status: ${so.status}` }); return;
    }

    await db.transaction(async (trx) => {
      const ffNumber = await generateTransactionNumber(companyId, 'fulfillment', trx);
      const d = req.body;
      const [ff] = await trx('item_fulfillments').insert({
        company_id: companyId, fulfillment_number: ffNumber, so_id: so.id,
        customer_id: so.customer_id, fulfillment_date: d.fulfillmentDate || new Date().toISOString().split('T')[0],
        location_id: d.locationId || so.location_id, warehouse_id: d.warehouseId || null,
        subsidiary_id: d.subsidiaryId || so.subsidiary_id || null, department_id: d.departmentId || so.department_id || null,
        shipping_address: so.shipping_address, tracking_number: d.trackingNumber, carrier: d.carrier,
        status: 'shipped', memo: d.memo, created_by: req.user!.id,
      }).returning('*');

      const lines = d.lines || [];
      if (lines.length > 0) {
        await trx('item_fulfillment_lines').insert(lines.map((l: any) => ({
          fulfillment_id: ff.id, so_line_id: l.soLineId, item_id: l.itemId,
          quantity: l.quantity, uom_id: l.uomId || null, bin_id: l.binId || null,
          lot_number: l.lotNumber, serial_number: l.serialNumber,
        })));

        // Update SO line fulfilled quantities
        for (const line of lines) {
          await trx('sales_order_lines').where({ id: line.soLineId }).increment('qty_fulfilled', line.quantity);
          // Resolve the UOM for conversion: fulfillment line uom, else the SO line's uom
          let uomId = line.uomId || null;
          if (!uomId && line.soLineId) {
            const sol = await trx('sales_order_lines').where({ id: line.soLineId }).first();
            uomId = sol?.uom_id || null;
          }
          // Convert fulfilled qty to the item's BASE stock unit for inventory movements
          const baseQty = await InventoryEngine.toBaseQty(trx, uomId, Number(line.quantity));
          // Release the previously committed (reserved) qty FIRST so the availability check for the
          // outgoing movement sees this reservation as free (it belongs to this SO being shipped).
          try {
            await InventoryEngine.releaseCommitted(trx, companyId, line.itemId, baseQty, d.locationId || so.location_id);
          } catch (relErr: any) { console.error('[INV WARNING] release committed skipped:', relErr.message); }
          // Reduce On Hand (inventory OUT). Use adjustment type so it is a pure OUT (not a transfer that also adds elsewhere).
          await InventoryEngine.createTransaction({
            companyId, transactionType: 'inventory_adjustment',
            referenceType: 'item_fulfillment', referenceId: ff.id,
            transactionDate: ff.fulfillment_date,
            locationId: d.locationId || so.location_id, warehouseId: d.warehouseId,
            memo: `Fulfillment for SO ${so.so_number}`,
            lines: [{ itemId: line.itemId, quantity: baseQty, direction: 'out', locationId: d.locationId || so.location_id, warehouseId: d.warehouseId }],
            createdBy: req.user!.id, trx,
          });
        }
      }

      // Update SO status
      const allLines = await trx('sales_order_lines').where({ so_id: so.id });
      const allFulfilled = allLines.every((l: any) => l.qty_fulfilled >= l.quantity);
      const anyFulfilled = allLines.some((l: any) => l.qty_fulfilled > 0);
      const newStatus = allFulfilled ? 'pending_billing' : anyFulfilled ? 'partially_fulfilled' : so.status;
      await trx('sales_orders').where({ id: so.id }).update({ status: newStatus });

      // GL Impact: Dr. COGS  Cr. Finished Goods Inventory
      try {
        await AccountingEngine.postItemFulfillment(ff.id, req.user!.id, trx);
      } catch (glErr: any) {
        console.error('[GL WARNING] Item Fulfillment GL skipped:', glErr.message);
        // Non-blocking: fulfillment still completes even if GL has no cost data
      }

      res.json({ success: true, data: ff, message: 'Fulfillment created successfully' });
    });
  } catch (e: any) {
    console.error("[ERP ERROR]", e.message);
    res.status(500).json({ success: false, error: e.message || 'Failed to create fulfillment' });
  }
});

// Create Invoice from Sales Order
router.post('/orders/:id/invoice', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const so = await db('sales_orders').where({ id: req.params.id, company_id: companyId }).first();
    if (!so) { res.status(404).json({ success: false, error: 'Sales order not found' }); return; }
    if (!['pending_billing', 'partially_fulfilled', 'partially_billed'].includes(so.status)) {
      res.status(400).json({ success: false, error: `Cannot invoice sales order with status: ${so.status}` }); return;
    }

    await db.transaction(async (trx) => {
      const invNumber = await generateTransactionNumber(companyId, 'invoice', trx);
      const customer = await trx('customers').where({ id: so.customer_id }).first();
      const soLines = await trx('sales_order_lines').where({ so_id: so.id });
      const d = req.body;
      const invoiceDate = d.invoiceDate || new Date().toISOString().split('T')[0];

      // Calculate due date
      const terms = so.payment_terms || 'Net30';
      const days = parseInt(terms.replace('Net', '')) || 30;
      const fallbackDue = new Date(invoiceDate);
      fallbackDue.setDate(fallbackDue.getDate() + days);
      // Prefer the SO's Due Date (Order Date + terms) so it copies straight to the invoice.
      const invoiceDueDate = so.due_date ? String(so.due_date).split('T')[0] : fallbackDue.toISOString().split('T')[0];

      const [inv] = await trx('invoices').insert({
        company_id: companyId, subsidiary_id: so.subsidiary_id,
        invoice_number: invNumber, so_id: so.id, customer_id: so.customer_id,
        invoice_date: invoiceDate, due_date: invoiceDueDate,
        currency: so.currency, exchange_rate: so.exchange_rate,
        payment_terms: so.payment_terms, location_id: so.location_id, department_id: so.department_id,
        status: 'open', memo: d.memo || so.memo,
        subtotal: so.subtotal, discount_amount: so.discount_amount, tax_amount: so.tax_amount,
        shipping_amount: so.shipping_amount, total_amount: so.total_amount,
        amount_paid: 0, amount_due: so.total_amount,
        ar_account_id: customer.ar_account_id,
        is_posted: false, created_by: req.user!.id,
      }).returning('*');

      // Create invoice lines
      const lineInserts: any[] = [];
      for (const line of soLines) {
        const item = await trx('items').where({ id: line.item_id }).first();
        const unitCostForCOGS = item?.average_cost || 0;
        lineInserts.push({
          invoice_id: inv.id, so_line_id: line.id, line_number: line.line_number,
          item_id: line.item_id, description: line.description, quantity: line.quantity,
          uom_id: line.uom_id, unit_price: line.unit_price,
          discount_percent: line.discount_percent, discount_amount: line.discount_amount,
          tax_code_id: line.tax_code_id, tax_amount: line.tax_amount, amount: line.amount,
          income_account_id: item?.income_account_id, cogs_account_id: item?.cogs_account_id,
          cogs_amount: line.quantity * unitCostForCOGS,
        });
      }
      if (lineInserts.length > 0) await trx('invoice_lines').insert(lineInserts);

      // Auto-post invoice (create GL entries)
      await AccountingEngine.postInvoice(inv.id, req.user!.id, trx);

      // Update SO line billed quantities and status
      for (const line of soLines) {
        await trx('sales_order_lines').where({ id: line.id }).update({ qty_billed: line.quantity });
      }
      const allBilled = soLines.every((l: any) => l.quantity <= l.qty_billed + l.quantity);
      await trx('sales_orders').where({ id: so.id }).update({ status: allBilled ? 'billed' : 'partially_billed' });

      // Re-fetch invoice to get updated is_posted flag
      const finalInv = await trx('invoices').where({ id: inv.id }).first();
      res.json({ success: true, data: finalInv, message: 'Invoice created and posted' });
    });
  } catch (e: any) {
    console.error("[ERP ERROR]", e.message);
    res.status(500).json({ success: false, error: e.message || 'Failed to create invoice' });
  }
});

// ===== ITEM FULFILLMENTS =====
router.get('/fulfillments', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    let query = db('item_fulfillments as ff')
      .join('customers as c', 'ff.customer_id', 'c.id')
      .join('sales_orders as so', 'ff.so_id', 'so.id')
      .leftJoin('locations as l', 'ff.location_id', 'l.id')
      .where({ 'ff.company_id': companyId })
      .select('ff.*', 'c.name as customer_name', 'so.so_number', 'l.name as location_name');
    if (search) query = query.where((qb: any) => qb.whereILike('ff.fulfillment_number', `%${search}%`).orWhereILike('c.name', `%${search}%`));
    if (req.query.soId) query = query.where({ 'ff.so_id': req.query.soId });
    if (req.query.status) query = query.where({ 'ff.status': req.query.status });
    const total = parseInt((await query.clone().clearSelect().count('ff.id as count').first() as any)?.count || '0');
    const data = await query.orderBy('ff.fulfillment_date', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to fetch fulfillments' }); }
});

router.get('/fulfillments/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    // Some deployments may not have department_id/subsidiary_id on item_fulfillments
    // (added by the dept/location migration). Only join them when the column exists.
    const [hasDept, hasSub, hasWh] = await Promise.all([
      db.schema.hasColumn('item_fulfillments', 'department_id'),
      db.schema.hasColumn('item_fulfillments', 'subsidiary_id'),
      db.schema.hasColumn('item_fulfillments', 'warehouse_id'),
    ]);
    const ffQuery = db('item_fulfillments as ff')
      .join('customers as c', 'ff.customer_id', 'c.id')
      .join('sales_orders as so', 'ff.so_id', 'so.id')
      .leftJoin('locations as l', 'ff.location_id', 'l.id')
      .where({ 'ff.id': req.params.id, 'ff.company_id': req.user!.companyId });
    const ffSelect: any[] = ['ff.*', 'c.name as customer_name', 'c.address as billing_address', 'c.email as customer_email',
      'so.so_number', 'so.shipping_address', 'l.name as location_name'];
    if (hasDept) { ffQuery.leftJoin('departments as dep', 'ff.department_id', 'dep.id'); ffSelect.push('dep.name as department_name'); }
    if (hasSub)  { ffQuery.leftJoin('subsidiaries as sub', 'ff.subsidiary_id', 'sub.id'); ffSelect.push('sub.name as subsidiary_name'); }
    if (hasWh)   { ffQuery.leftJoin('warehouses as wh', 'ff.warehouse_id', 'wh.id'); ffSelect.push('wh.name as warehouse_name'); }
    const ff = await ffQuery.select(ffSelect).first();
    if (!ff) { res.status(404).json({ success: false, error: 'Fulfillment not found' }); return; }
    const lines = await db('item_fulfillment_lines as ffl')
      .join('items as i', 'ffl.item_id', 'i.id')
      .leftJoin('sales_order_lines as sol', 'ffl.so_line_id', 'sol.id')
      // Prefer the fulfillment line UOM, else the SO line UOM, else the item's base UOM
      .leftJoin('units_of_measure as uom', function (this: any) {
        this.on(db.raw('uom.id = COALESCE(ffl.uom_id, sol.uom_id, i.base_uom_id)'));
      })
      .where({ 'ffl.fulfillment_id': ff.id })
      .select('ffl.*', 'i.item_code', 'i.name as item_name', 'uom.code as uom_code', 'uom.name as uom_name',
        'uom.conversion_rate_to_base as uom_rate', 'sol.unit_price', 'sol.description');
    let journalEntries = await fetchJEWithLines('item_fulfillment', ff.id, db);
    // Lazy GL backfill: older fulfillments (or ones posted when item cost was 0) may have no COGS
    // journal yet. Post it on demand so GL Impact is populated.
    if ((!journalEntries || journalEntries.length === 0) && ff.status !== 'cancelled') {
      try {
        await db.transaction(async (trx) => { await AccountingEngine.postItemFulfillment(ff.id, req.user!.id, trx); });
        journalEntries = await fetchJEWithLines('item_fulfillment', ff.id, db);
      } catch (glErr: any) { console.error('[GL WARNING] Fulfillment GL backfill skipped:', glErr.message); }
    }
    res.json({ success: true, data: { ...ff, lines, journalEntries } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to fetch fulfillment' }); }
});

// ===== INVOICES =====
router.get('/invoices', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, sortDir, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    let query = db('invoices as i').join('customers as c', 'i.customer_id', 'c.id')
      .where({ 'i.company_id': companyId, 'i.is_deleted': false })
      .select('i.*', 'c.name as customer_name');
    if (search) query = query.where((qb: any) => qb.whereILike('i.invoice_number', `%${search}%`).orWhereILike('c.name', `%${search}%`));
    if (req.query.status) query = query.where({ 'i.status': req.query.status });
    if (req.query.customerId) query = query.where({ 'i.customer_id': req.query.customerId });
    if (req.query.overdue === 'true') query = query.where('i.due_date', '<', new Date()).whereNotIn('i.status', ['paid', 'voided']);
    const total = parseInt((await query.clone().clearSelect().count('* as count').first() as any)?.count || '0');
    const data = await query.orderBy('i.invoice_date', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch invoices' }); }
});

router.get('/invoices/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const invHasDept = await db.schema.hasColumn('invoices', 'department_id');
    const invHasSub = await db.schema.hasColumn('invoices', 'subsidiary_id');
    const invQuery = db('invoices as i').join('customers as c', 'i.customer_id', 'c.id')
      .leftJoin('locations as l', 'i.location_id', 'l.id')
      .where({ 'i.id': req.params.id, 'i.company_id': req.user!.companyId });
    const invSelect: any[] = ['i.*', 'c.name as customer_name', 'c.email as customer_email', 'c.address as billing_address', 'c.tax_id as customer_tax_id', 'l.name as location_name'];
    if (invHasDept) { invQuery.leftJoin('departments as dep', 'i.department_id', 'dep.id'); invSelect.push('dep.name as department_name'); }
    if (invHasSub)  { invQuery.leftJoin('subsidiaries as sub', 'i.subsidiary_id', 'sub.id'); invSelect.push('sub.name as subsidiary_name'); }
    const inv = await invQuery.select(invSelect).first();
    if (!inv) { res.status(404).json({ success: false, error: 'Invoice not found' }); return; }
    const lines = await db('invoice_lines as il').join('items as itm', 'il.item_id', 'itm.id')
      .leftJoin('tax_codes as tc', 'il.tax_code_id', 'tc.id')
      .leftJoin('units_of_measure as uom', 'il.uom_id', 'uom.id')
      .where({ 'il.invoice_id': inv.id }).orderBy('il.line_number')
      .select('il.*', 'itm.item_code', 'itm.name as item_name', 'tc.code as tax_code', 'tc.rate as tax_rate', 'uom.code as uom_code', 'uom.name as uom_name');
    const payments = await db('payment_applications as pa').join('customer_payments as cp', 'pa.payment_id', 'cp.id')
      .where({ 'pa.invoice_id': inv.id }).select('pa.*', 'cp.payment_number', 'cp.payment_date', 'cp.payment_method');
    const journalEntries = await fetchJEWithLines('invoice', inv.id, db);
    res.json({ success: true, data: { ...inv, lines, payments, journalEntries } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch invoice' }); }
});

// Insert invoice lines + post the invoice GL (shared by direct create and edit).
// GL Impact department/location are sourced from the line items (AR/tax use the header).
async function writeInvoiceLinesAndGL(
  trx: any, companyId: string, inv: any, invNumber: string, customerName: string, d: any,
  totals: { taxTotal: number; discountTotal: number; total: number }, userId: string,
): Promise<void> {
  const { taxTotal, discountTotal, total } = totals;
  const headerDept = d.departmentId || null;
  const headerLoc = d.locationId || null;

  // Insert lines (line dept/location fall back to the header)
  const savedLines: any[] = [];
  if (d.lines && d.lines.length > 0) {
    for (let idx = 0; idx < d.lines.length; idx++) {
      const l = d.lines[idx];
      const taxCodeId = await resolveTaxCodeId(trx, companyId, l.taxCodeId || l.taxCode);
      const [row] = await trx('invoice_lines').insert({
        invoice_id: inv.id,
        line_number: idx + 1,
        item_id: l.itemId || null,
        description: l.description,
        quantity: l.quantity,
        uom_id: l.uomId || null,
        unit_price: l.unitPrice,
        discount_percent: l.discountPercent || 0,
        discount_amount: l.discountAmount != null ? Number(l.discountAmount) : (l.quantity * l.unitPrice) * ((l.discountPercent || 0) / 100),
        discount_account_id: l.discountAccountId || null,
        tax_code_id: taxCodeId,
        tax_amount: l.taxAmount || 0,
        amount: l.amount,
        department_id: l.departmentId || headerDept,
        location_id: l.locationId || headerLoc,
      }).returning('*');
      savedLines.push({ ...row, incomeAccountId: null, srcLine: l });
    }
  }

  const arAccount = await trx('accounts').where({ company_id: companyId, subtype: 'receivable' }).orderBy('code').first()
    || await trx('accounts').where({ company_id: companyId, code: '1200' }).first();
  const revenueAccount = await trx('accounts').where({ company_id: companyId, type: 'income', subtype: 'income' }).orderBy('code').first()
    || await trx('accounts').where({ company_id: companyId, code: '5100' }).first();
  if (!arAccount || !revenueAccount) return;

  let discAcct: any = null;
  if (discountTotal > 0) {
    const lineDiscAcct = (d.lines || []).map((l: any) => l.discountAccountId).find((x: any) => !!x);
    const discId = d.discountAccountId || lineDiscAcct;
    discAcct = discId
      ? await trx('accounts').where({ id: discId, company_id: companyId }).first()
      : await trx('accounts').where({ company_id: companyId, subtype: 'sales_discount' }).first();
  }

  const jeNumber = await generateTransactionNumber(companyId, 'journal_entry', trx);
  const [je] = await trx('journal_entries').insert({
    company_id: companyId, journal_number: jeNumber, entry_date: inv.invoice_date,
    source_type: 'invoice', source_id: inv.id, status: 'posted',
    department_id: headerDept, location_id: headerLoc,
    memo: `Invoice ${invNumber} - ${customerName}`, created_by: userId,
  }).returning('*');

  const gross = total + (discAcct ? discountTotal : 0);
  const jeLines: any[] = [
    // Dr. AR — header dept/location
    { journal_id: je.id, account_id: arAccount.id, debit: total, credit: 0, department_id: headerDept, location_id: headerLoc, memo: `AR - ${customerName}` },
  ];
  if (discAcct && discountTotal > 0) {
    jeLines.push({ journal_id: je.id, account_id: discAcct.id, debit: discountTotal, credit: 0, department_id: headerDept, location_id: headerLoc, memo: `Sales discount - ${invNumber}` });
  }
  // Cr. Revenue per line so each carries its own department/location (GL Impact from line items)
  const revenueCreditTotal = gross - taxTotal;
  if (savedLines.length > 0) {
    for (const sl of savedLines) {
      const lineRevenue = (Number(sl.quantity) * Number(sl.unit_price)); // gross per line
      if (lineRevenue <= 0) continue;
      jeLines.push({
        journal_id: je.id, account_id: revenueAccount.id, debit: 0, credit: lineRevenue,
        department_id: sl.department_id || headerDept, location_id: sl.location_id || headerLoc,
        memo: `Revenue - ${sl.description || 'Item'}`,
      });
    }
  } else {
    jeLines.push({ journal_id: je.id, account_id: revenueAccount.id, debit: 0, credit: revenueCreditTotal, department_id: headerDept, location_id: headerLoc, memo: `Revenue - ${invNumber}` });
  }
  // Cr. Tax Payable (PPN Output)
  if (taxTotal > 0) {
    const taxAcct = await trx('accounts').where({ company_id: companyId, code: '2200' }).first()
      || await trx('accounts').where({ company_id: companyId, subtype: 'tax_payable' }).first();
    if (taxAcct) {
      jeLines.push({ journal_id: je.id, account_id: taxAcct.id, debit: 0, credit: taxTotal, department_id: headerDept, location_id: headerLoc, memo: `PPN Output - ${invNumber}` });
    }
  }

  // Standalone invoice (not from a Sales Order): recognize COGS here, since there is no
  // Item Fulfillment to post it. Dr = item COGS account, Cr = item Inventory/Asset account.
  // (Invoices created from an SO recognize COGS at fulfillment, so this is skipped for them.)
  const isStandalone = !inv.so_id;
  if (isStandalone && savedLines.length > 0) {
    const defaultCOGS = await trx('accounts').where({ company_id: companyId, code: '5100' }).first();
    const defaultInv = await trx('accounts').where({ company_id: companyId, code: '1230' }).first()
      || await trx('accounts').where({ company_id: companyId, code: '1200' }).first();
    for (const sl of savedLines) {
      if (!sl.item_id) continue;
      const item = await trx('items').where({ id: sl.item_id }).first();
      if (!item) continue;
      // Prefer moving average cost, then standard cost, then last purchase price.
      const unitCost = parseFloat(item.average_cost || item.standard_cost || item.last_purchase_price || '0');
      const cogsAmount = Number(sl.quantity) * unitCost;
      if (cogsAmount <= 0) continue;
      const cogsAcct = item.cogs_account_id || defaultCOGS?.id;
      const invAcct = item.inventory_account_id || item.asset_account_id || defaultInv?.id;
      if (!cogsAcct || !invAcct) continue;
      const dLoc = sl.department_id || headerDept;
      const lLoc = sl.location_id || headerLoc;
      jeLines.push({ journal_id: je.id, account_id: cogsAcct, debit: cogsAmount, credit: 0, department_id: dLoc, location_id: lLoc, memo: `COGS - ${sl.description || 'Item'}` });
      jeLines.push({ journal_id: je.id, account_id: invAcct, debit: 0, credit: cogsAmount, department_id: dLoc, location_id: lLoc, memo: `Inventory Out - ${sl.description || 'Item'}` });
    }
  }

  await trx('journal_entry_lines').insert(jeLines.map((jl: any, i: number) => ({ line_number: i + 1, ...jl })));
  await trx('invoices').where({ id: inv.id }).update({ is_posted: true });
}

// Create Invoice directly (manual invoice or from form)
router.post('/invoices', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    if (!d.customerId || !d.invoiceDate) {
      res.status(400).json({ success: false, error: 'Customer and invoice date are required' }); return;
    }

    const invoice = await db.transaction(async (trx) => {
      const invNumber = await resolveTransactionNumber(companyId, 'invoice', d.documentNumber, trx);
      const customer = await trx('customers').where({ id: d.customerId, company_id: companyId }).first();
      if (!customer) throw new AppError('Customer not found', 404);

      // Calculate due date if not provided
      let dueDate = d.dueDate;
      if (!dueDate && customer.payment_terms) {
        const days = parseInt(customer.payment_terms.replace(/\D/g, '')) || 30;
        const invDate = new Date(d.invoiceDate);
        invDate.setDate(invDate.getDate() + days);
        dueDate = invDate.toISOString().split('T')[0];
      }

      // Subtotal = GROSS (Qty x Unit Price) summed across lines; discount tracked separately.
      const grossSubtotal = (d.lines || []).reduce((s: number, l: any) => s + (parseFloat(l.quantity || 0) * parseFloat(l.unitPrice || 0)), 0);
      const taxTotal = (d.lines || []).reduce((s: number, l: any) => s + parseFloat(l.taxAmount || 0), 0);
      const discountTotal = (d.lines || []).reduce((s: number, l: any) => {
        const gross = parseFloat(l.quantity || 0) * parseFloat(l.unitPrice || 0);
        const disc = l.discountAmount != null ? Number(l.discountAmount) : gross * ((l.discountPercent || 0) / 100);
        return s + disc;
      }, 0);
      const subtotal = grossSubtotal;
      const total = grossSubtotal - discountTotal + taxTotal;

      const [inv] = await trx('invoices').insert({
        company_id: companyId,
        subsidiary_id: d.subsidiaryId || null,
        invoice_number: invNumber,
        customer_id: d.customerId,
        so_id: d.soId || null,
        invoice_date: d.invoiceDate,
        due_date: dueDate || d.invoiceDate,
        currency: d.currency || 'IDR',
        exchange_rate: d.exchangeRate || 1,
        payment_terms: d.paymentTerms || null,
        subtotal,
        discount_amount: discountTotal,
        discount_account_id: d.discountAccountId || null,
        tax_amount: taxTotal,
        shipping_amount: d.shippingAmount || 0,
        total_amount: total,
        amount_due: total,
        status: 'open',
        memo: d.memo || '',
        location_id: d.locationId || null,
        department_id: d.departmentId || null,
        created_by: req.user!.id,
      }).returning('*');

      // Insert lines + post GL (dept/location sourced from line items)
      await writeInvoiceLinesAndGL(trx, companyId, inv, invNumber, customer.name, d, { taxTotal, discountTotal, total }, req.user!.id);

      // Standalone invoice (not from an SO): reduce On Hand + Available now, since there is
      // no Sales Order commitment / Item Fulfillment to move the stock.
      if (!inv.so_id) {
        for (const l of (d.lines || [])) {
          if (!l.itemId || !(Number(l.quantity) > 0)) continue;
          try {
            const baseQty = await InventoryEngine.toBaseQty(trx, l.uomId || null, Number(l.quantity));
            await InventoryEngine.createTransaction({
              companyId, transactionType: 'inventory_adjustment',
              referenceType: 'invoice', referenceId: inv.id,
              transactionDate: d.invoiceDate,
              locationId: l.locationId || d.locationId || null,
              memo: `Invoice ${invNumber} - stock out`,
              lines: [{ itemId: l.itemId, quantity: baseQty, direction: 'out', locationId: l.locationId || d.locationId || null }],
              createdBy: req.user!.id, trx,
            });
          } catch (invErr: any) { console.error('[INV WARNING] Standalone invoice stock-out skipped:', invErr.message); }
        }
      }

      const finalInv = await trx('invoices').where({ id: inv.id }).first();
      return finalInv;
    });

    res.json({ success: true, data: invoice });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: e.message || 'Failed to create invoice' }); }
});

// Update Invoice (edit) — reverses old GL + payment applications guard, replaces lines, re-posts.
// Blocked once any payment has been applied.
router.put('/invoices/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    const existing = await db('invoices').where({ id: req.params.id, company_id: companyId, is_deleted: false }).first();
    if (!existing) { res.status(404).json({ success: false, error: 'Invoice not found' }); return; }
    if (parseFloat(existing.amount_paid || 0) > 0) {
      res.status(400).json({ success: false, error: 'Cannot edit an invoice that already has payments applied.' }); return;
    }

    await db.transaction(async (trx) => {
      const customer = await trx('customers').where({ id: d.customerId || existing.customer_id }).first();

      // 1) Reverse the old GL entry
      const oldJEs = await trx('journal_entries').where({ source_type: 'invoice', source_id: existing.id });
      for (const je of oldJEs) await trx('journal_entry_lines').where({ journal_id: je.id }).del();
      await trx('journal_entries').where({ source_type: 'invoice', source_id: existing.id }).del();

      // 2) Remove old lines (capture first, to reverse stock for standalone invoices)
      const oldInvLines = await trx('invoice_lines').where({ invoice_id: existing.id });
      // Reverse the standalone stock-out (add stock back) before replacing lines
      if (!existing.so_id) {
        for (const ol of oldInvLines) {
          if (!ol.item_id || !(Number(ol.quantity) > 0)) continue;
          try {
            const baseQty = await InventoryEngine.toBaseQty(trx, ol.uom_id || null, Number(ol.quantity));
            await InventoryEngine.createTransaction({
              companyId, transactionType: 'inventory_adjustment',
              referenceType: 'invoice', referenceId: existing.id,
              transactionDate: existing.invoice_date,
              locationId: ol.location_id || existing.location_id || null,
              memo: `Invoice ${existing.invoice_number} - stock reversal (edit)`,
              lines: [{ itemId: ol.item_id, quantity: baseQty, direction: 'in', locationId: ol.location_id || existing.location_id || null }],
              createdBy: req.user!.id, trx,
            });
          } catch (_) {}
        }
      }
      await trx('invoice_lines').where({ invoice_id: existing.id }).del();

      // 3) Totals (Subtotal = gross)
      const grossSubtotal = (d.lines || []).reduce((s: number, l: any) => s + (parseFloat(l.quantity || 0) * parseFloat(l.unitPrice || 0)), 0);
      const taxTotal = (d.lines || []).reduce((s: number, l: any) => s + parseFloat(l.taxAmount || 0), 0);
      const discountTotal = (d.lines || []).reduce((s: number, l: any) => {
        const gross = parseFloat(l.quantity || 0) * parseFloat(l.unitPrice || 0);
        const disc = l.discountAmount != null ? Number(l.discountAmount) : gross * ((l.discountPercent || 0) / 100);
        return s + disc;
      }, 0);
      const total = grossSubtotal - discountTotal + taxTotal;

      // 4) Update header
      const [inv] = await trx('invoices').where({ id: existing.id }).update({
        customer_id: d.customerId || existing.customer_id,
        invoice_date: d.invoiceDate || existing.invoice_date,
        due_date: d.dueDate || existing.due_date,
        currency: d.currency || existing.currency,
        exchange_rate: d.exchangeRate || existing.exchange_rate || 1,
        payment_terms: d.paymentTerms ?? existing.payment_terms,
        subtotal: grossSubtotal, discount_amount: discountTotal, discount_account_id: d.discountAccountId || null,
        tax_amount: taxTotal, shipping_amount: d.shippingAmount || 0,
        total_amount: total, amount_due: total,
        location_id: d.locationId || null, department_id: d.departmentId || null,
        subsidiary_id: d.subsidiaryId || null, memo: d.memo ?? existing.memo,
        is_posted: false, updated_at: new Date(),
      }).returning('*');

      // 5) Re-insert lines + re-post GL
      await writeInvoiceLinesAndGL(trx, companyId, inv, inv.invoice_number, customer?.name || '', d, { taxTotal, discountTotal, total }, req.user!.id);

      // 6) Re-apply stock-out for standalone invoices with the new lines
      if (!inv.so_id) {
        for (const l of (d.lines || [])) {
          if (!l.itemId || !(Number(l.quantity) > 0)) continue;
          try {
            const baseQty = await InventoryEngine.toBaseQty(trx, l.uomId || null, Number(l.quantity));
            await InventoryEngine.createTransaction({
              companyId, transactionType: 'inventory_adjustment',
              referenceType: 'invoice', referenceId: inv.id,
              transactionDate: d.invoiceDate || inv.invoice_date,
              locationId: l.locationId || d.locationId || null,
              memo: `Invoice ${inv.invoice_number} - stock out (edit)`,
              lines: [{ itemId: l.itemId, quantity: baseQty, direction: 'out', locationId: l.locationId || d.locationId || null }],
              createdBy: req.user!.id, trx,
            });
          } catch (_) {}
        }
      }

      const finalInv = await trx('invoices').where({ id: inv.id }).first();
      res.json({ success: true, data: finalInv, message: 'Invoice updated' });
    });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: e.message || 'Failed to update invoice' }); }
});

// Record Customer Payment
router.post('/payments', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    // Amount may be 0 when customer credits (deposits / unapplied payments) fully cover the invoices.
    if (!d.customerId || !d.paymentDate) {
      res.status(400).json({ success: false, error: 'Customer and date are required' }); return;
    }
    const hasCredits = Array.isArray(d.creditApplications) && d.creditApplications.some((c: any) => Number(c.amount) > 0);
    if ((d.amount == null || Number(d.amount) < 0) || (Number(d.amount) <= 0 && !hasCredits)) {
      res.status(400).json({ success: false, error: 'Amount is required' }); return;
    }
    await ensureCustomerPaymentArAccount();

    await db.transaction(async (trx) => {
      const payNumber = await resolveTransactionNumber(companyId, 'customer_payment', d.documentNumber, trx);
      const customer = await trx('customers').where({ id: d.customerId }).first();
      const [payment] = await trx('customer_payments').insert({
        company_id: companyId, payment_number: payNumber,
        customer_id: d.customerId, payment_date: d.paymentDate,
        payment_method: d.paymentMethod || 'bank_transfer', reference: d.reference,
        currency: d.currency || 'IDR', exchange_rate: d.exchangeRate || 1,
        amount: Number(d.amount) || 0, unapplied_amount: Number(d.amount) || 0,
        bank_account_id: d.bankAccountId || null, ar_account_id: customer?.ar_account_id,
        status: 'open', memo: d.memo, is_posted: false, created_by: req.user!.id,
      }).returning('*');

      // Apply customer credits (deposits / unapplied payments) — reduce cash needed
      const creditsApplied = await applyCustomerCredits(trx, companyId, payment.id, d.creditApplications || []);

      // Apply to invoices (settled by cash + credits)
      if (d.applications && d.applications.length > 0) {
        let remaining = parseFloat(d.amount) + creditsApplied;
        for (const app of d.applications) {
          if (remaining <= 0) break;
          const invoice = await trx('invoices').where({ id: app.invoiceId }).first();
          if (!invoice || invoice.amount_due <= 0) continue;
          const applyAmount = Math.min(remaining, parseFloat(invoice.amount_due), parseFloat(app.amount || invoice.amount_due));
          if (applyAmount <= 0) continue;
          await trx('payment_applications').insert({ payment_id: payment.id, invoice_id: app.invoiceId, applied_amount: applyAmount });
          const newAmountPaid = parseFloat(invoice.amount_paid) + applyAmount;
          const newAmountDue = parseFloat(invoice.total_amount) - newAmountPaid;
          const newStatus = newAmountDue <= 0 ? 'paid' : 'partially_paid';
          await trx('invoices').where({ id: app.invoiceId }).update({ amount_paid: newAmountPaid, amount_due: newAmountDue, status: newStatus });
          remaining -= applyAmount;
        }
        await trx('customer_payments').where({ id: payment.id }).update({ unapplied_amount: Math.max(0, remaining), status: remaining <= 0 ? 'applied' : 'open' });
      } else if (creditsApplied > 0) {
        await trx('customer_payments').where({ id: payment.id }).update({ unapplied_amount: parseFloat(d.amount) + creditsApplied });
      }

      // Post GL entry (credit-aware)
      await postCustomerPaymentWithCredits(trx, companyId, payment.id, creditsApplied, req.user!.id);
      const finalPayment = await trx('customer_payments').where({ id: payment.id }).first();

      res.status(201).json({ success: true, data: finalPayment, message: 'Payment recorded and posted' });
    });
  } catch (e: any) {
    console.error("[ERP ERROR]", e.message);
    res.status(500).json({ success: false, error: e.message || 'Failed to record payment' });
  }
});

router.get('/payments', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    const query = db('customer_payments as cp').join('customers as c', 'cp.customer_id', 'c.id')
      .where({ 'cp.company_id': companyId, 'cp.is_deleted': false })
      .select('cp.*', 'c.name as customer_name');
    const total = parseInt((await query.clone().clearSelect().count('* as count').first() as any)?.count || '0');
    const data = await query.orderBy('cp.payment_date', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch payments' }); }
});

router.get('/payments/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const payment = await db('customer_payments as cp')
      .join('customers as c', 'cp.customer_id', 'c.id')
      .leftJoin('accounts as ba', 'cp.bank_account_id', 'ba.id')
      .leftJoin('accounts as ara', 'cp.ar_account_id', 'ara.id')
      .where({ 'cp.id': req.params.id, 'cp.company_id': req.user!.companyId, 'cp.is_deleted': false })
      .select('cp.*', 'c.name as customer_name', 'c.email as customer_email',
        'ba.code as bank_account_code', 'ba.name as bank_account_name',
        'ara.code as ar_account_code', 'ara.name as ar_account_name')
      .first();
    if (!payment) { res.status(404).json({ success: false, error: 'Payment not found' }); return; }
    const applications = await db('payment_applications as pa')
      .join('invoices as i', 'pa.invoice_id', 'i.id')
      .where({ 'pa.payment_id': payment.id })
      .select('pa.*', 'i.invoice_number', 'i.invoice_date', 'i.due_date', 'i.total_amount', 'i.status as invoice_status');
    // Credits (deposits / unapplied payments) applied to reduce this payment's cash
    let creditApplications: any[] = [];
    if (await db.schema.hasTable('customer_credit_applications')) {
      creditApplications = await db('customer_credit_applications as cca')
        .leftJoin('customer_deposits as cd', function (this: any) { this.on('cca.credit_id', 'cd.id').andOn(db.raw("cca.credit_type = 'customer_deposit'")); })
        .leftJoin('customer_payments as sp', function (this: any) { this.on('cca.credit_id', 'sp.id').andOn(db.raw("cca.credit_type = 'customer_payment'")); })
        .where({ 'cca.payment_id': payment.id })
        .select('cca.*',
          db.raw("COALESCE(cd.deposit_number, sp.payment_number) as credit_number"),
          db.raw("COALESCE(cd.deposit_date, sp.payment_date) as credit_date"));
    }
    const journalEntries = await fetchJEWithLines('customer_payment', payment.id, db);
    res.json({ success: true, data: { ...payment, applications, creditApplications, journalEntries } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to fetch payment' }); }
});

router.get('/stock', async (req: Request, res: Response): Promise<void> => {
  try {
    const { itemIds, locationId } = req.query;
    if (!itemIds) { res.status(400).json({ success: false, error: 'itemIds required' }); return; }
    
    const ids = (itemIds as string).split(',');
    const query = db('inventory_balances as ib')
      .whereIn('ib.item_id', ids)
      .where({ 'ib.company_id': req.user!.companyId })
      .groupBy('ib.item_id')
      .select(
        'ib.item_id',
        db.raw('COALESCE(SUM(ib.qty_on_hand), 0) as qty_on_hand'),
        db.raw('COALESCE(SUM(ib.qty_committed), 0) as qty_committed'),
        db.raw('COALESCE(SUM(ib.qty_on_hand) - SUM(ib.qty_committed), 0) as qty_available')
      );
    
    if (locationId) query.where({ 'ib.location_id': locationId });
    
    const rows = await query;
    const stockMap = rows.reduce((acc: any, r: any) => {
      acc[r.item_id] = {
        onHand: parseFloat(r.qty_on_hand),
        committed: parseFloat(r.qty_committed),
        available: parseFloat(r.qty_available),
      };
      return acc;
    }, {});

    // Prevent 304/ETag caching so per-location/per-item queries always return fresh values.
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: stockMap });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to fetch stock' }); }
});

// ─── Customer Deposits ────────────────────────────────────────────────────────
router.get('/deposits', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('customer_deposits as cd')
      .leftJoin('customers as c', 'cd.customer_id', 'c.id')
      .where({ 'cd.company_id': req.user!.companyId })
      .select('cd.*', 'c.name as customer_name')
      .orderBy('cd.deposit_date', 'desc').limit(100);
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to fetch deposits' }); }
});

router.post('/deposits', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.customerId) { res.status(400).json({ success: false, error: 'Customer is required' }); return; }
    if (!d.amount || Number(d.amount) <= 0) { res.status(400).json({ success: false, error: 'Amount must be > 0' }); return; }
    if (!d.bankAccountId) { res.status(400).json({ success: false, error: 'Bank Account is required' }); return; }

    const depNumber = `CDEP-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const depInsert: any = {
      company_id: companyId,
      deposit_number: depNumber,
      customer_id: d.customerId,
      deposit_date: d.depositDate || new Date(),
      amount: Number(d.amount),
      bank_account_id: d.bankAccountId,
      payment_method: d.paymentMethod || 'bank_transfer',
      reference: d.reference || null,
      sales_order_id: d.salesOrderId || null,
      memo: d.memo || null,
      status: 'posted',
      created_by: req.user!.id,
    };
    const [depHasDept, depHasLoc, depHasSub] = await Promise.all([
      db.schema.hasColumn('customer_deposits', 'department_id'),
      db.schema.hasColumn('customer_deposits', 'location_id'),
      db.schema.hasColumn('customer_deposits', 'subsidiary_id'),
    ]);
    if (depHasDept) depInsert.department_id = d.departmentId || null;
    if (depHasLoc)  depInsert.location_id = d.locationId || null;
    if (depHasSub)  depInsert.subsidiary_id = d.subsidiaryId || null;

    // Deposit + its GL Journal Entry are committed atomically — a deposit is never
    // recorded without a posted Journal Entry (Dr. Bank / Cr. 2700 Customer Deposit).
    const deposit = await db.transaction(async (trx) => {
      const [dep] = await trx('customer_deposits').insert(depInsert).returning('*');
      await postCustomerDepositGL(trx, companyId, dep, req.user!.id);
      return dep;
    });

    res.status(201).json({ success: true, data: { ...deposit, deposit_number: depNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: e.message || 'Failed to record deposit' }); }
});

// Post the Customer Deposit GL: Dr. Bank / Cr. Customer Deposit (2700).
// Routed through AccountingEngine.createJournalEntry so it is ALWAYS a fully-posted
// Journal Entry (period, posted_by/at, balance check, base amounts).
async function postCustomerDepositGL(trx: any, companyId: string, deposit: any, userId: string): Promise<void> {
  const custDepAcct = await getCustomerDepositAccount(trx, companyId);
  const bankAcct = await trx('accounts').where({ id: deposit.bank_account_id }).first();
  if (!custDepAcct) throw new AppError('Customer Deposit account (2700) not configured.', 400);
  if (!bankAcct) throw new AppError('Bank account not configured for deposit.', 400);
  const amount = Number(deposit.amount);
  await AccountingEngine.createJournalEntry({
    companyId,
    subsidiaryId: deposit.subsidiary_id || undefined,
    date: typeof deposit.deposit_date === 'string' ? deposit.deposit_date.split('T')[0] : deposit.deposit_date,
    sourceType: 'customer_deposit',
    sourceId: deposit.id,
    memo: `Customer Deposit ${deposit.deposit_number}`,
    lines: [
      { accountId: bankAcct.id, debit: amount, credit: 0, entityCustomerId: deposit.customer_id, departmentId: deposit.department_id || undefined, locationId: deposit.location_id || undefined, memo: `Cash received from customer` },
      { accountId: custDepAcct.id, debit: 0, credit: amount, entityCustomerId: deposit.customer_id, departmentId: deposit.department_id || undefined, locationId: deposit.location_id || undefined, memo: `Customer deposit (2700)` },
    ],
    createdBy: userId,
    trx,
  });
}

// GET a single Customer Deposit (for the detail / view page)
router.get('/deposits/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const [hasDept, hasLoc, hasSub] = await Promise.all([
      db.schema.hasColumn('customer_deposits', 'department_id'),
      db.schema.hasColumn('customer_deposits', 'location_id'),
      db.schema.hasColumn('customer_deposits', 'subsidiary_id'),
    ]);
    const q = db('customer_deposits as cd')
      .leftJoin('customers as c', 'cd.customer_id', 'c.id')
      .leftJoin('accounts as ba', 'cd.bank_account_id', 'ba.id')
      .where({ 'cd.id': req.params.id, 'cd.company_id': companyId });
    const sel: any[] = ['cd.*', 'c.name as customer_name', 'c.email as customer_email',
      'ba.name as bank_account_name', 'ba.code as bank_account_code'];
    if (hasDept) { q.leftJoin('departments as dep', 'cd.department_id', 'dep.id'); sel.push('dep.name as department_name'); }
    if (hasLoc)  { q.leftJoin('locations as loc', 'cd.location_id', 'loc.id'); sel.push('loc.name as location_name'); }
    if (hasSub)  { q.leftJoin('subsidiaries as sub', 'cd.subsidiary_id', 'sub.id'); sel.push('sub.name as subsidiary_name'); }
    const deposit = await q.select(sel).first();
    if (!deposit) { res.status(404).json({ success: false, error: 'Deposit not found' }); return; }
    const journalEntries = await fetchJEWithLines('customer_deposit', deposit.id, db);
    // Related records: customer payments that consumed this deposit
    let applications: any[] = [];
    if (await db.schema.hasTable('customer_credit_applications')) {
      applications = await db('customer_credit_applications as cca')
        .join('customer_payments as cp', 'cca.payment_id', 'cp.id')
        .where({ 'cca.credit_type': 'customer_deposit', 'cca.credit_id': deposit.id })
        .select('cca.id', 'cca.applied_amount', 'cp.id as payment_id', 'cp.payment_number', 'cp.payment_date', 'cp.status as payment_status');
    }
    res.json({ success: true, data: { ...deposit, journalEntries, applications } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch deposit' }); }
});

// Edit Customer Deposit — reverse old GL, update, re-post. Blocked once applied.
router.put('/deposits/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    const existing = await db('customer_deposits').where({ id: req.params.id, company_id: companyId }).first();
    if (!existing) { res.status(404).json({ success: false, error: 'Deposit not found' }); return; }
    if (Number(existing.amount_applied || 0) > 0.009) {
      res.status(400).json({ success: false, error: 'Cannot edit a deposit that has already been applied.' }); return;
    }
    if (!d.customerId) { res.status(400).json({ success: false, error: 'Customer is required' }); return; }
    if (!d.amount || Number(d.amount) <= 0) { res.status(400).json({ success: false, error: 'Amount must be > 0' }); return; }
    if (!d.bankAccountId) { res.status(400).json({ success: false, error: 'Bank Account is required' }); return; }

    const [hasDept, hasLoc, hasSub] = await Promise.all([
      db.schema.hasColumn('customer_deposits', 'department_id'),
      db.schema.hasColumn('customer_deposits', 'location_id'),
      db.schema.hasColumn('customer_deposits', 'subsidiary_id'),
    ]);

    await db.transaction(async (trx) => {
      // Reverse old GL
      const oldJEs = await trx('journal_entries').where({ source_type: 'customer_deposit', source_id: existing.id });
      for (const je of oldJEs) await trx('journal_entry_lines').where({ journal_id: je.id }).del();
      await trx('journal_entries').where({ source_type: 'customer_deposit', source_id: existing.id }).del();

      const upd: any = {
        customer_id: d.customerId,
        deposit_date: d.depositDate || existing.deposit_date,
        amount: Number(d.amount),
        bank_account_id: d.bankAccountId,
        payment_method: d.paymentMethod || existing.payment_method,
        reference: d.reference ?? existing.reference,
        sales_order_id: d.salesOrderId || null,
        memo: d.memo ?? existing.memo,
      };
      if (hasDept) upd.department_id = d.departmentId || null;
      if (hasLoc)  upd.location_id = d.locationId || null;
      if (hasSub)  upd.subsidiary_id = d.subsidiaryId || null;
      const [deposit] = await trx('customer_deposits').where({ id: existing.id }).update(upd).returning('*');

      await postCustomerDepositGL(trx, companyId, deposit, req.user!.id);
      res.json({ success: true, data: deposit, message: 'Customer deposit updated' });
    });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: e.message || 'Failed to update deposit' }); }
});

// Available customer credits (customer deposits + customer payments with unapplied balance)
// applicable against a Customer Payment to reduce the cash received.
router.get('/customer-credits', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const customerId = req.query.customerId as string;
    if (!customerId) { res.json({ success: true, data: { deposits: [], payments: [] } }); return; }
    const excludePaymentId = (req.query.excludePaymentId as string) || null;
    await ensureCustomerCreditTables();

    const consumedByEdit: Record<string, number> = {};
    if (excludePaymentId && await db.schema.hasTable('customer_credit_applications')) {
      const rows = await db('customer_credit_applications').where({ company_id: companyId, payment_id: excludePaymentId });
      for (const r of rows) consumedByEdit[r.credit_id] = (consumedByEdit[r.credit_id] || 0) + Number(r.applied_amount || 0);
    }

    const depRows = await db('customer_deposits')
      .where({ company_id: companyId, customer_id: customerId })
      .whereNot('status', 'voided')
      .select('id', 'deposit_number', 'deposit_date', 'amount', 'amount_applied', 'reference', 'memo');
    const deposits = depRows
      .map((p: any) => ({ ...p, remaining: Number(p.amount) - Number(p.amount_applied || 0) + (consumedByEdit[p.id] || 0) }))
      .filter((p: any) => p.remaining > 0.009);

    let payQuery = db('customer_payments')
      .where({ company_id: companyId, customer_id: customerId, is_deleted: false });
    if (excludePaymentId) payQuery = payQuery.whereNot('id', excludePaymentId);
    const payRows = await payQuery
      .select('id', 'payment_number', 'payment_date', 'amount', 'unapplied_amount', 'reference', 'memo')
      .orderBy('payment_date', 'desc');
    const payments = payRows
      .map((p: any) => ({ ...p, unapplied_amount: Number(p.unapplied_amount || 0) + (consumedByEdit[p.id] || 0) }))
      .filter((p: any) => Number(p.unapplied_amount) > 0.009);

    res.json({ success: true, data: { deposits, payments } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch customer credits' }); }
});

// ─── Return Authorizations ────────────────────────────────────────────────────
router.get('/return-authorizations', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('return_authorizations as ra')
      .leftJoin('customers as c', 'ra.customer_id', 'c.id')
      .where({ 'ra.company_id': req.user!.companyId })
      .select('ra.*', 'c.name as customer_name')
      .orderBy('ra.return_date', 'desc').limit(100);
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to fetch return authorizations' }); }
});

router.get('/return-authorizations/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const ra = await db('return_authorizations as ra')
      .leftJoin('customers as c', 'ra.customer_id', 'c.id')
      .leftJoin('locations as l', 'ra.location_id', 'l.id')
      .leftJoin('users as u', 'ra.created_by', 'u.id')
      .where({ 'ra.id': req.params.id, 'ra.company_id': req.user!.companyId })
      .select('ra.*', 'c.name as customer_name', 'c.email as customer_email', 'c.address as billing_address',
        'l.name as location_name', 'u.name as created_by_name')
      .first();
    if (!ra) { res.status(404).json({ success: false, error: 'Return authorization not found' }); return; }
    const lines = await db('return_authorization_lines as l')
      .leftJoin('items as i', 'l.item_id', 'i.id')
      .where({ 'l.ra_id': ra.id })
      .select('l.*', 'i.item_code', 'i.name as item_name');
    res.json({ success: true, data: { ...ra, lines } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch return authorization' }); }
});

router.post('/return-authorizations', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.customerId) { res.status(400).json({ success: false, error: 'Customer is required' }); return; }

    const raNumber = `RA-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const totalAmount = (d.lines || []).reduce((s: number, l: any) => s + Number(l.qty || 0) * Number(l.unitPrice || 0), 0);

    const [ra] = await db('return_authorizations').insert({
      company_id: companyId,
      ra_number: raNumber,
      customer_id: d.customerId,
      return_date: d.returnDate || new Date(),
      original_invoice_number: d.originalInvoiceNumber || null,
      return_reason: d.returnReason || null,
      location_id: d.locationId || null,
      memo: d.memo || null,
      total_amount: totalAmount,
      status: 'open',
      created_by: req.user!.id,
    }).returning('*');

    for (const line of d.lines || []) {
      await db('return_authorization_lines').insert({
        ra_id: ra.id,
        item_id: line.itemId || null,
        description: line.description || null,
        qty: Number(line.qty || 0),
        unit_price: Number(line.unitPrice || 0),
      });
    }

    res.status(201).json({ success: true, data: { ...ra, ra_number: raNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to create return authorization' }); }
});

// ─── Credit Memos ─────────────────────────────────────────────────────────────
router.get('/credit-memos', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('credit_memos as cm')
      .leftJoin('customers as c', 'cm.customer_id', 'c.id')
      .where({ 'cm.company_id': req.user!.companyId })
      .select('cm.*', 'c.name as customer_name')
      .orderBy('cm.memo_date', 'desc').limit(100);
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to fetch credit memos' }); }
});

router.get('/credit-memos/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const cm = await db('credit_memos as cm')
      .leftJoin('customers as c', 'cm.customer_id', 'c.id')
      .leftJoin('users as u', 'cm.created_by', 'u.id')
      .where({ 'cm.id': req.params.id, 'cm.company_id': req.user!.companyId })
      .select('cm.*', 'c.name as customer_name', 'c.email as customer_email', 'c.address as billing_address',
        'u.name as created_by_name')
      .first();
    if (!cm) { res.status(404).json({ success: false, error: 'Credit memo not found' }); return; }
    const lines = await db('credit_memo_lines as l')
      .leftJoin('items as i', 'l.item_id', 'i.id')
      .where({ 'l.credit_memo_id': cm.id })
      .select('l.*', 'i.item_code', 'i.name as item_name');
    const journalEntries = await fetchJEWithLines('credit_memo', cm.id, db);
    res.json({ success: true, data: { ...cm, lines, journalEntries } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch credit memo' }); }
});

router.post('/credit-memos', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.customerId) { res.status(400).json({ success: false, error: 'Customer is required' }); return; }

    const cmNumber = `CM-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const subtotal = (d.lines || []).reduce((s: number, l: any) => s + Number(l.qty || 0) * Number(l.unitPrice || 0), 0);
    const taxAmount = subtotal * (Number(d.taxRate || 0) / 100);
    const totalAmount = subtotal + taxAmount;

    const [cm] = await db('credit_memos').insert({
      company_id: companyId,
      memo_number: cmNumber,
      customer_id: d.customerId,
      memo_date: d.creditDate || new Date(),
      original_invoice_number: d.originalInvoiceNumber || null,
      reason: d.reason || null,
      tax_rate: Number(d.taxRate || 0),
      subtotal, tax_amount: taxAmount, total_amount: totalAmount,
      memo: d.memo || null,
      status: 'open',
      created_by: req.user!.id,
    }).returning('*');

    for (const line of d.lines || []) {
      await db('credit_memo_lines').insert({
        credit_memo_id: cm.id,
        item_id: line.itemId || null,
        description: line.description || null,
        qty: Number(line.qty || 0),
        unit_price: Number(line.unitPrice || 0),
      });
    }

    // ── GL: Dr. Sales Revenue (4100) / Cr. Accounts Receivable (1100) ─────────
    if (totalAmount > 0) {
      try {
        const salesAcct = await db('accounts').where({ company_id: companyId, code: '4100' }).first(); // Sales Revenue
        const arAcct = await db('accounts').where({ company_id: companyId, code: '1100' }).first(); // AR
        if (salesAcct && arAcct) {
          const jeNum = `JE-CM-${String(Date.now()).slice(-8)}`;
          const [je] = await db('journal_entries').insert({
            company_id: companyId, journal_number: jeNum,
            entry_date: d.creditDate || new Date(),
            memo: `Credit Memo ${cmNumber}`,
            source_type: 'credit_memo', source_id: cm.id || cm,
            status: 'posted', created_by: req.user!.id,
          }).returning('id');
          const jeId = je?.id || je;
          await db('journal_entry_lines').insert([
            { journal_id: jeId, line_number: 1, account_id: salesAcct.id, debit: totalAmount, credit: 0,           memo: `Reduce sales revenue` },
            { journal_id: jeId, line_number: 2, account_id: arAcct.id,    debit: 0,           credit: totalAmount, memo: `Reduce AR balance` },
          ]);
        }
      } catch (glErr: any) { console.error('[GL ERROR] Credit Memo GL:', glErr.message); }
    }

    // Reduce invoice balance if invoice specified
    if (d.originalInvoiceNumber) {
      try {
        await db('invoices')
          .where({ company_id: companyId, invoice_number: d.originalInvoiceNumber })
          .increment('amount_paid', totalAmount)
          .decrement('amount_due', totalAmount);
      } catch (invErr: any) { console.error('[INVOICE ERROR] Credit Memo application:', invErr.message); }
    }

    res.status(201).json({ success: true, data: { ...cm, credit_memo_number: cmNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to create credit memo' }); }
});

// ─── Refunds ──────────────────────────────────────────────────────────────────
router.get('/refunds', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('customer_refunds as cr')
      .leftJoin('customers as c', 'cr.customer_id', 'c.id')
      .where({ 'cr.company_id': req.user!.companyId })
      .select('cr.*', 'c.name as customer_name')
      .orderBy('cr.refund_date', 'desc').limit(100);
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to fetch refunds' }); }
});

router.get('/refunds/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const cr = await db('customer_refunds as cr')
      .leftJoin('customers as c', 'cr.customer_id', 'c.id')
      .leftJoin('accounts as ba', 'cr.bank_account_id', 'ba.id')
      .leftJoin('users as u', 'cr.created_by', 'u.id')
      .where({ 'cr.id': req.params.id, 'cr.company_id': req.user!.companyId })
      .select('cr.*', 'c.name as customer_name', 'c.email as customer_email', 'c.address as billing_address',
        'ba.name as bank_account_name', 'ba.code as bank_account_code', 'u.name as created_by_name')
      .first();
    if (!cr) { res.status(404).json({ success: false, error: 'Refund not found' }); return; }
    const journalEntries = await fetchJEWithLines('customer_refund', cr.id, db);
    res.json({ success: true, data: { ...cr, journalEntries } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch refund' }); }
});

router.post('/refunds', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.customerId) { res.status(400).json({ success: false, error: 'Customer is required' }); return; }
    if (!d.amount || Number(d.amount) <= 0) { res.status(400).json({ success: false, error: 'Amount must be > 0' }); return; }
    if (!d.bankAccountId) { res.status(400).json({ success: false, error: 'Bank Account is required' }); return; }

    const refundNumber = `REF-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const [refund] = await db('customer_refunds').insert({
      company_id: companyId,
      refund_number: refundNumber,
      customer_id: d.customerId,
      refund_date: d.refundDate || new Date(),
      amount: Number(d.amount),
      bank_account_id: d.bankAccountId,
      payment_method: d.paymentMethod || 'bank_transfer',
      reference: d.reference || null,
      credit_memo_number: d.creditMemoNumber || null,
      reason: d.reason || null,
      memo: d.memo || null,
      status: 'posted',
      created_by: req.user!.id,
    }).returning('*');

    // ── GL: Dr. Accounts Receivable (1100) / Cr. Bank ─────────────────────────
    try {
      const arAcct = await db('accounts').where({ company_id: companyId, code: '1100' }).first(); // AR
      const bankAcct = await db('accounts').where({ id: d.bankAccountId }).first();
      if (arAcct && bankAcct) {
        const jeNum = `JE-REF-${String(Date.now()).slice(-8)}`;
        const [je] = await db('journal_entries').insert({
          company_id: companyId, journal_number: jeNum,
          entry_date: d.refundDate || new Date(),
          memo: `Customer Refund ${refundNumber}`,
          source_type: 'customer_refund', source_id: refund.id || refund,
          status: 'posted', created_by: req.user!.id,
        }).returning('id');
        const jeId = je?.id || je;
        await db('journal_entry_lines').insert([
          { journal_id: jeId, line_number: 1, account_id: arAcct.id,    debit: Number(d.amount), credit: 0,              memo: `Increase AR for refund` },
          { journal_id: jeId, line_number: 2, account_id: bankAcct.id, debit: 0,                credit: Number(d.amount), memo: `Cash refund paid` },
        ]);
      }
    } catch (glErr: any) { console.error('[GL ERROR] Customer Refund GL:', glErr.message); }

    res.status(201).json({ success: true, data: { ...refund, refund_number: refundNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to record refund' }); }
});

// ── Audit routes for System Information tab ───────────────────────────────────
attachAuditRoute(router, 'sales_order');
// These need separate sub-paths, so add them explicitly:
router.get('/invoices/:id/audit', async (req: any, res: any) => {
  try { const l = await (db as any)('transaction_audit_log').where({ company_id: req.user.companyId, source_type: 'invoice', source_id: req.params.id }).orderBy('performed_at','desc').limit(200); res.json({ success:true, data:l }); } catch(e:any){ res.status(500).json({success:false,error:e.message}); }
});
router.get('/quotations/:id/audit', async (req: any, res: any) => {
  try { const l = await (db as any)('transaction_audit_log').where({ company_id: req.user.companyId, source_type: 'quotation', source_id: req.params.id }).orderBy('performed_at','desc').limit(200); res.json({ success:true, data:l }); } catch(e:any){ res.status(500).json({success:false,error:e.message}); }
});
router.get('/payments/:id/audit', async (req: any, res: any) => {
  try { const l = await (db as any)('transaction_audit_log').where({ company_id: req.user.companyId, source_type: 'customer_payment', source_id: req.params.id }).orderBy('performed_at','desc').limit(200); res.json({ success:true, data:l }); } catch(e:any){ res.status(500).json({success:false,error:e.message}); }
});
router.get('/fulfillments/:id/audit', async (req: any, res: any) => {
  try { const l = await (db as any)('transaction_audit_log').where({ company_id: req.user.companyId, source_type: 'item_fulfillment', source_id: req.params.id }).orderBy('performed_at','desc').limit(200); res.json({ success:true, data:l }); } catch(e:any){ res.status(500).json({success:false,error:e.message}); }
});
router.get('/return-authorizations/:id/audit', async (req: any, res: any) => {
  try { const l = await (db as any)('transaction_audit_log').where({ company_id: req.user.companyId, source_type: 'return_authorization', source_id: req.params.id }).orderBy('performed_at','desc').limit(200); res.json({ success:true, data:l }); } catch(e:any){ res.status(500).json({success:false,error:e.message}); }
});
router.get('/credit-memos/:id/audit', async (req: any, res: any) => {
  try { const l = await (db as any)('transaction_audit_log').where({ company_id: req.user.companyId, source_type: 'credit_memo', source_id: req.params.id }).orderBy('performed_at','desc').limit(200); res.json({ success:true, data:l }); } catch(e:any){ res.status(500).json({success:false,error:e.message}); }
});
router.get('/deposits/:id/audit', async (req: any, res: any) => {
  try { const l = await (db as any)('transaction_audit_log').where({ company_id: req.user.companyId, source_type: 'customer_deposit', source_id: req.params.id }).orderBy('performed_at','desc').limit(200); res.json({ success:true, data:l }); } catch(e:any){ res.status(500).json({success:false,error:e.message}); }
});

export default router;
