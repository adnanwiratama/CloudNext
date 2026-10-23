import { Router, Request, Response } from 'express';
import db from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { enforcePermissions } from '../../middleware/permissions';
import { getPaginationParams, buildPaginatedResult } from '../../utils/pagination';
import { createAuditLog } from '../../utils/audit';
import { generateTransactionNumber } from '../../utils/sequence';
import { AppError } from '../../middleware/errorHandler';

const router = Router();
router.use(authenticate);
router.use(enforcePermissions);

// Ensure the customers table has the columns the form/handler use. The live DB
// drifted from the code (missing company_name/mobile/website/billing_*/shipping_*
// /credit_limit/price_level/territory/notes), so add anything missing at runtime.
let _customerColsEnsured = false;
async function ensureCustomerColumns(): Promise<void> {
  if (_customerColsEnsured) return;
  const add = async (col: string, build: (t: any) => void) => {
    if (!(await db.schema.hasColumn('customers', col))) await db.schema.alterTable('customers', build);
  };
  await add('company_name',     (t: any) => t.string('company_name', 200).nullable());
  await add('mobile',           (t: any) => t.string('mobile', 50).nullable());
  await add('website',          (t: any) => t.string('website', 200).nullable());
  await add('billing_address',  (t: any) => t.text('billing_address').nullable());
  await add('billing_city',     (t: any) => t.string('billing_city', 100).nullable());
  await add('billing_state',    (t: any) => t.string('billing_state', 100).nullable());
  await add('billing_country',  (t: any) => t.string('billing_country', 100).nullable());
  await add('billing_postal',   (t: any) => t.string('billing_postal', 30).nullable());
  await add('shipping_address', (t: any) => t.text('shipping_address').nullable());
  await add('shipping_city',    (t: any) => t.string('shipping_city', 100).nullable());
  await add('shipping_state',   (t: any) => t.string('shipping_state', 100).nullable());
  await add('shipping_country', (t: any) => t.string('shipping_country', 100).nullable());
  await add('shipping_postal',  (t: any) => t.string('shipping_postal', 30).nullable());
  await add('credit_limit',     (t: any) => t.decimal('credit_limit', 20, 2).defaultTo(0));
  await add('price_level',      (t: any) => t.string('price_level', 50).nullable());
  await add('territory',        (t: any) => t.string('territory', 100).nullable());
  await add('notes',            (t: any) => t.text('notes').nullable());
  await add('updated_by',       (t: any) => t.uuid('updated_by').nullable());
  _customerColsEnsured = true;
}

// GET /api/customers
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, sortBy, sortDir, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;

    let query = db('customers as c')
      .leftJoin('users as u', 'c.sales_rep_id', 'u.id')
      .leftJoin('subsidiaries as s', 'c.subsidiary_id', 's.id')
      .where({ 'c.company_id': companyId, 'c.is_deleted': false })
      .select('c.*', 'u.name as sales_rep_name', 's.name as subsidiary_name');

    if (search) {
      query = query.where((q: any) => {
        q.whereILike('c.name', `%${search}%`)
          .orWhereILike('c.customer_number', `%${search}%`)
          .orWhereILike('c.email', `%${search}%`)
          .orWhereILike('c.company_name', `%${search}%`)
          .orWhereILike('c.tax_id', `%${search}%`);
      });
    }

    if (req.query.status) query = query.where({ 'c.status': req.query.status });
    if (req.query.subsidiaryId) query = query.where({ 'c.subsidiary_id': req.query.subsidiaryId });

    const totalQuery = query.clone().clearSelect().count('* as count').first();
    const total = parseInt((await totalQuery as any)?.count || '0');

    const allowedSort = ['customer_number', 'name', 'email', 'status', 'created_at'];
    const orderBy = allowedSort.includes(sortBy || '') ? `c.${sortBy}` : 'c.customer_number';
    const data = await query.orderBy(orderBy, sortDir).limit(limit).offset((page - 1) * limit);

    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
  } catch (e: any) {
    console.error("[ERP ERROR]", e.message);
    res.status(500).json({ success: false, error: 'Failed to fetch customers' });
  }
});

// GET /api/customers/:id
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const customer = await db('customers as c')
      .leftJoin('users as u', 'c.sales_rep_id', 'u.id')
      .leftJoin('subsidiaries as s', 'c.subsidiary_id', 's.id')
      .leftJoin('accounts as ar', 'c.ar_account_id', 'ar.id')
      .where({ 'c.id': req.params.id, 'c.company_id': req.user!.companyId, 'c.is_deleted': false })
      .select('c.*', 'u.name as sales_rep_name', 's.name as subsidiary_name', 'ar.name as ar_account_name')
      .first();

    if (!customer) {
      res.status(404).json({ success: false, error: 'Customer not found' });
      return;
    }

    const contacts = (await db.schema.hasTable('customer_contacts'))
      ? await db('customer_contacts').where({ customer_id: customer.id }).catch(() => [])
      : [];

    // Summary stats
    const invoiceStats = await db('invoices')
      .where({ customer_id: customer.id, is_deleted: false })
      .select(
        db.raw('COUNT(*) as total_invoices'),
        db.raw('COALESCE(SUM(total_amount), 0) as total_billed'),
        db.raw('COALESCE(SUM(amount_due), 0) as total_outstanding')
      )
      .first();

    res.json({ success: true, data: { ...customer, contacts, stats: invoiceStats } });
  } catch (e: any) {
    console.error("[ERP ERROR]", e.message);
    res.status(500).json({ success: false, error: 'Failed to fetch customer' });
  }
});

// POST /api/customers
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureCustomerColumns();
    const companyId = req.user!.companyId;
    const data = req.body;

    if (!data.name) {
      res.status(400).json({ success: false, error: 'Customer name is required' });
      return;
    }

    // Use the configured sequence if one exists; otherwise fall back to a computed
    // C-000001 style number (not every company has a 'customer' sequence seeded).
    let customerNumber: string;
    try {
      customerNumber = await generateTransactionNumber(companyId, 'customer', db);
    } catch {
      const last = await db('customers').where({ company_id: companyId }).orderBy('created_at', 'desc').first();
      const n = last && /\d+/.test(String(last.customer_number)) ? parseInt(String(last.customer_number).replace(/\D/g, '')) : 0;
      customerNumber = `C-${String(n + 1).padStart(6, '0')}`;
    }

    const [customer] = await db('customers').insert({
      company_id: companyId,
      subsidiary_id: data.subsidiaryId || null,
      customer_number: data.customerNumber || customerNumber,
      name: data.name,
      company_name: data.companyName,
      type: data.type || 'company',
      email: data.email,
      phone: data.phone,
      mobile: data.mobile,
      website: data.website,
      tax_id: data.taxId,
      billing_address: data.billingAddress,
      billing_city: data.billingCity,
      billing_state: data.billingState,
      billing_country: data.billingCountry || 'Indonesia',
      billing_postal: data.billingPostal,
      shipping_address: data.shippingAddress,
      shipping_city: data.shippingCity,
      shipping_state: data.shippingState,
      shipping_country: data.shippingCountry || 'Indonesia',
      shipping_postal: data.shippingPostal,
      currency: data.currency || 'IDR',
      payment_terms: data.paymentTerms,
      credit_limit: data.creditLimit || 0,
      sales_rep_id: data.salesRepId || null,
      price_level: data.priceLevel,
      territory: data.territory,
      ar_account_id: data.arAccountId || null,
      department_id: data.departmentId || null,
      status: data.status || 'active',
      notes: data.notes,
      created_by: req.user!.id,
    }).returning('*');

    await createAuditLog({
      companyId, userId: req.user!.id, action: 'create',
      entityType: 'customer', entityId: customer.id, entityNumber: customer.customer_number,
      newValues: customer, ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: customer });
  } catch (e: any) {
    console.error("[ERP ERROR]", e.message);
    res.status(500).json({ success: false, error: 'Failed to create customer' });
  }
});

// PUT /api/customers/:id
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureCustomerColumns();
    const companyId = req.user!.companyId;
    const existing = await db('customers').where({ id: req.params.id, company_id: companyId, is_deleted: false }).first();
    if (!existing) {
      res.status(404).json({ success: false, error: 'Customer not found' });
      return;
    }

    const data = req.body;
    const [updated] = await db('customers').where({ id: req.params.id }).update({
      name: data.name ?? existing.name,
      company_name: data.companyName ?? existing.company_name,
      type: data.type ?? existing.type,
      email: data.email ?? existing.email,
      phone: data.phone ?? existing.phone,
      mobile: data.mobile ?? existing.mobile,
      website: data.website ?? existing.website,
      tax_id: data.taxId ?? existing.tax_id,
      billing_address: data.billingAddress ?? existing.billing_address,
      billing_city: data.billingCity ?? existing.billing_city,
      billing_state: data.billingState ?? existing.billing_state,
      billing_country: data.billingCountry ?? existing.billing_country,
      billing_postal: data.billingPostal ?? existing.billing_postal,
      shipping_address: data.shippingAddress ?? existing.shipping_address,
      currency: data.currency ?? existing.currency,
      payment_terms: data.paymentTerms ?? existing.payment_terms,
      credit_limit: data.creditLimit ?? existing.credit_limit,
      sales_rep_id: data.salesRepId ?? existing.sales_rep_id,
      ar_account_id: data.arAccountId ?? existing.ar_account_id,
      status: data.status ?? existing.status,
      notes: data.notes ?? existing.notes,
      subsidiary_id: data.subsidiaryId ?? existing.subsidiary_id,
      updated_by: req.user!.id,
      updated_at: new Date(),
    }).returning('*');

    await createAuditLog({
      companyId, userId: req.user!.id, action: 'update',
      entityType: 'customer', entityId: req.params.id, entityNumber: existing.customer_number,
      oldValues: existing, newValues: updated, ipAddress: req.ip,
    });

    res.json({ success: true, data: updated });
  } catch (e: any) {
    console.error("[ERP ERROR]", e.message);
    res.status(500).json({ success: false, error: 'Failed to update customer' });
  }
});

// DELETE /api/customers/:id (soft delete)
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const existing = await db('customers').where({ id: req.params.id, company_id: companyId }).first();
    if (!existing) {
      res.status(404).json({ success: false, error: 'Customer not found' });
      return;
    }

    // Check for open transactions
    const openInvoices = await db('invoices').where({ customer_id: req.params.id, is_deleted: false }).whereNotIn('status', ['paid', 'voided']).count('id as count').first();
    if (parseInt((openInvoices as any)?.count || '0') > 0) {
      res.status(400).json({ success: false, error: 'Cannot delete customer with open invoices. Please close or void all open transactions first.' });
      return;
    }

    await db('customers').where({ id: req.params.id }).update({ is_deleted: true, updated_by: req.user!.id });

    await createAuditLog({
      companyId, userId: req.user!.id, action: 'delete',
      entityType: 'customer', entityId: req.params.id, entityNumber: existing.customer_number, ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Customer deleted successfully' });
  } catch (e: any) {
    console.error("[ERP ERROR]", e.message);
    res.status(500).json({ success: false, error: 'Failed to delete customer' });
  }
});

// GET /api/customers/:id/transactions
router.get('/:id/transactions', async (req: Request, res: Response): Promise<void> => {
  try {
    const invoices = await db('invoices').where({ customer_id: req.params.id, is_deleted: false }).orderBy('invoice_date', 'desc').limit(50);
    const salesOrders = await db('sales_orders').where({ customer_id: req.params.id, is_deleted: false }).orderBy('order_date', 'desc').limit(20);
    const payments = await db('customer_payments').where({ customer_id: req.params.id, is_deleted: false }).orderBy('payment_date', 'desc').limit(20);

    res.json({ success: true, data: { invoices, salesOrders, payments } });
  } catch (e: any) {
    console.error("[ERP ERROR]", e.message);
    res.status(500).json({ success: false, error: 'Failed to fetch customer transactions' });
  }
});

export default router;
