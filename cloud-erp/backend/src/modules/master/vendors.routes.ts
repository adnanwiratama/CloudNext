import { Router, Request, Response } from 'express';
import db from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { getPaginationParams, buildPaginatedResult } from '../../utils/pagination';
import { createAuditLog } from '../../utils/audit';

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, sortBy, sortDir, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;

    let query = db('vendors as v')
      .leftJoin('subsidiaries as s', 'v.subsidiary_id', 's.id')
      .where({ 'v.company_id': companyId, 'v.is_deleted': false })
      .select('v.*', 's.name as subsidiary_name');

    if (search) {
      query = query.where((q: any) => {
        q.whereILike('v.name', `%${search}%`).orWhereILike('v.vendor_number', `%${search}%`).orWhereILike('v.email', `%${search}%`);
      });
    }
    if (req.query.status) query = query.where({ 'v.status': req.query.status });

    const total = parseInt((await query.clone().clearSelect().count('* as count').first() as any)?.count || '0');
    const data = await query.orderBy(sortBy ? `v.${sortBy}` : 'v.vendor_number', sortDir).limit(limit).offset((page - 1) * limit);

    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch vendors' }); }
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const vendor = await db('vendors').where({ id: req.params.id, company_id: req.user!.companyId, is_deleted: false }).first();
    if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }
    const contacts = await db('vendor_contacts').where({ vendor_id: vendor.id });
    const billStats = await db('vendor_bills').where({ vendor_id: vendor.id, is_deleted: false })
      .select(db.raw('COUNT(*) as total_bills'), db.raw('COALESCE(SUM(total_amount), 0) as total_billed'), db.raw('COALESCE(SUM(amount_due), 0) as total_outstanding')).first();
    res.json({ success: true, data: { ...vendor, contacts, stats: billStats } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch vendor' }); }
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    if (!d.name) { res.status(400).json({ success: false, error: 'Vendor name is required' }); return; }

    // Auto-generate vendor number
    const lastVendor = await db('vendors').where({ company_id: companyId }).orderBy('created_at', 'desc').first();
    const lastNum = lastVendor ? parseInt(lastVendor.vendor_number.replace('V-', '')) : 0;
    const vendorNumber = d.vendorNumber || `V-${String(lastNum + 1).padStart(6, '0')}`;

    const [vendor] = await db('vendors').insert({
      company_id: companyId, subsidiary_id: d.subsidiaryId || null,
      vendor_number: vendorNumber, name: d.name, type: d.type || 'company',
      email: d.email, phone: d.phone, tax_id: d.taxId, address: d.address,
      city: d.city, state: d.state, country: d.country || 'Indonesia', postal_code: d.postalCode,
      currency: d.currency || 'IDR', payment_terms: d.paymentTerms, credit_limit: d.creditLimit || 0,
      ap_account_id: d.apAccountId || null, expense_account_id: d.expenseAccountId || null,
      department_id: d.departmentId || null, status: d.status || 'active', notes: d.notes,
      created_by: req.user!.id,
    }).returning('*');

    await createAuditLog({ companyId, userId: req.user!.id, action: 'create', entityType: 'vendor', entityId: vendor.id, entityNumber: vendor.vendor_number, newValues: vendor, ipAddress: req.ip });
    res.status(201).json({ success: true, data: vendor });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to create vendor' }); }
});

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = await db('vendors').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!existing) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }
    const d = req.body;
    const [updated] = await db('vendors').where({ id: req.params.id }).update({
      name: d.name ?? existing.name, type: d.type ?? existing.type, email: d.email ?? existing.email,
      phone: d.phone ?? existing.phone, tax_id: d.taxId ?? existing.tax_id, address: d.address ?? existing.address,
      city: d.city ?? existing.city, country: d.country ?? existing.country, currency: d.currency ?? existing.currency,
      payment_terms: d.paymentTerms ?? existing.payment_terms, credit_limit: d.creditLimit ?? existing.credit_limit,
      ap_account_id: d.apAccountId ?? existing.ap_account_id, status: d.status ?? existing.status,
      notes: d.notes ?? existing.notes, updated_by: req.user!.id, updated_at: new Date(),
    }).returning('*');
    await createAuditLog({ companyId: req.user!.companyId, userId: req.user!.id, action: 'update', entityType: 'vendor', entityId: req.params.id, entityNumber: existing.vendor_number, oldValues: existing, newValues: updated, ipAddress: req.ip });
    res.json({ success: true, data: updated });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to update vendor' }); }
});

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = await db('vendors').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!existing) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }
    await db('vendors').where({ id: req.params.id }).update({ is_deleted: true, updated_by: req.user!.id });
    res.json({ success: true, message: 'Vendor deleted' });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to delete vendor' }); }
});

export default router;
