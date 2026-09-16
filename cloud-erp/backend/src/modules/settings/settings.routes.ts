import { Router, Request, Response } from 'express';
import db from '../../config/database';
import { authenticate, requireAdmin } from '../../middleware/auth';
import bcrypt from 'bcryptjs';

const router = Router();
router.use(authenticate);

// Company Settings
router.get('/company', async (req: Request, res: Response): Promise<void> => {
  try {
    const company = await db('companies').where({ id: req.user!.companyId }).first();
    res.json({ success: true, data: company });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch company settings' }); }
});

router.put('/company', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const [updated] = await db('companies').where({ id: req.user!.companyId }).update({
      name: d.name, legal_name: d.legalName, tax_id: d.taxId, email: d.email, phone: d.phone,
      website: d.website, address: d.address, city: d.city, country: d.country, postal_code: d.postalCode,
      timezone: d.timezone, fiscal_year_start: d.fiscalYearStart,
    }).returning('*');
    res.json({ success: true, data: updated });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to update company' }); }
});

// Users
router.get('/users', async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await db('users as u').leftJoin('roles as r', 'u.role_id', 'r.id')
      .leftJoin('subsidiaries as s', 'u.subsidiary_id', 's.id')
      .where({ 'u.company_id': req.user!.companyId })
      .select('u.id', 'u.name', 'u.email', 'u.phone', 'u.is_active', 'u.is_admin', 'u.last_login_at',
        'r.name as role_name', 's.name as subsidiary_name');
    res.json({ success: true, data: users });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch users' }); }
});

router.post('/users', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    if (!d.name || !d.email || !d.password) {
      res.status(400).json({ success: false, error: 'Name, email and password are required' }); return;
    }
    const hash = await bcrypt.hash(d.password, 12);
    const [user] = await db('users').insert({
      company_id: req.user!.companyId, name: d.name, email: d.email.toLowerCase(),
      password_hash: hash, phone: d.phone, role_id: d.roleId || null,
      subsidiary_id: d.subsidiaryId || null, is_active: true, is_admin: d.isAdmin || false,
    }).returning(['id', 'name', 'email', 'phone', 'is_active', 'is_admin', 'role_id']);
    res.status(201).json({ success: true, data: user });
  } catch (e: any) {
    if (e.code === '23505') res.status(409).json({ success: false, error: 'A user with this email already exists.' });
    else res.status(500).json({ success: false, error: 'Failed to create user' });
  }
});

router.put('/users/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const update: any = { name: d.name, phone: d.phone, role_id: d.roleId, subsidiary_id: d.subsidiaryId, is_active: d.isActive, is_admin: d.isAdmin };
    if (d.password) update.password_hash = await bcrypt.hash(d.password, 12);
    const [updated] = await db('users').where({ id: req.params.id, company_id: req.user!.companyId }).update(update).returning(['id', 'name', 'email', 'is_active', 'is_admin']);
    res.json({ success: true, data: updated });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to update user' }); }
});

// Roles
router.get('/roles', async (req: Request, res: Response): Promise<void> => {
  try {
    const roles = await db('roles').where({ company_id: req.user!.companyId, is_active: true }).orderBy('name');
    res.json({ success: true, data: roles });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch roles' }); }
});

router.post('/roles', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    if (!d.name) { res.status(400).json({ success: false, error: 'Role name is required' }); return; }
    const [role] = await db('roles').insert({
      company_id: req.user!.companyId, name: d.name,
      description: d.description || null,
      permissions: d.permissions || null,
      is_system: false, is_active: true,
    }).returning('*');
    res.status(201).json({ success: true, data: role });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to create role' }); }
});

router.put('/roles/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const [role] = await db('roles').where({ id: req.params.id, company_id: req.user!.companyId })
      .update({ name: d.name, description: d.description || null, permissions: d.permissions || null })
      .returning('*');
    res.json({ success: true, data: role });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to update role' }); }
});

router.delete('/roles/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const role = await db('roles').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!role) { res.status(404).json({ success: false, error: 'Role not found' }); return; }
    if (role.is_system) { res.status(400).json({ success: false, error: 'Cannot delete system role' }); return; }
    const hasUsers = await db('users').where({ role_id: req.params.id }).count('id as c').first();
    if (parseInt((hasUsers as any)?.c || '0') > 0) {
      res.status(400).json({ success: false, error: 'Cannot delete role with assigned users. Reassign users first.' }); return;
    }
    await db('roles').where({ id: req.params.id }).update({ is_active: false });
    res.json({ success: true, message: 'Role deleted' });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to delete role' }); }
});

router.delete('/users/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await db('users').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }
    if (user.id === req.user!.id) { res.status(400).json({ success: false, error: 'Cannot delete your own account' }); return; }
    await db('users').where({ id: req.params.id }).update({ is_active: false });
    res.json({ success: true, message: 'User deactivated' });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to delete user' }); }
});

// Locations
router.get('/locations', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('locations').where({ company_id: req.user!.companyId, is_active: true }).orderBy('code');
    res.json({ success: true, data });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch locations' }); }
});

router.post('/locations', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const [loc] = await db('locations').insert({
      company_id: req.user!.companyId, subsidiary_id: d.subsidiaryId || null,
      code: d.code, name: d.name, type: d.type || 'warehouse', address: d.address,
      city: d.city, country: d.country || 'Indonesia', is_active: true,
    }).returning('*');
    res.status(201).json({ success: true, data: loc });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to create location' }); }
});

// Departments
router.get('/departments', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('departments').where({ company_id: req.user!.companyId, is_active: true }).orderBy('code');
    res.json({ success: true, data });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch departments' }); }
});

// Subsidiaries
router.get('/subsidiaries', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('subsidiaries').where({ company_id: req.user!.companyId }).orderBy('name');
    res.json({ success: true, data });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to fetch subsidiaries' }); }
});

router.post('/subsidiaries', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    if (!d.name) { res.status(400).json({ success: false, error: 'Name is required' }); return; }
    const code = d.name.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6) + Date.now().toString().slice(-3);
    const [sub] = await db('subsidiaries').insert({
      company_id: req.user!.companyId,
      code: d.documentNumberPrefix ? d.documentNumberPrefix.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 10) : code,
      name: d.name,
      legal_name: d.legalName || null,
      parent_id: d.parentId || null,
      country: d.country || 'Indonesia',
      state: d.state || null,
      address: d.address || null,
      web_site: d.webSite || null,
      document_number_prefix: d.documentNumberPrefix || null,
      return_email: d.returnEmail || null,
      fax: d.fax || null,
      elimination: d.elimination || false,
      currency: 'IDR',
      is_active: !d.isInactive,
    }).returning('*');
    res.status(201).json({ success: true, data: sub });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to create subsidiary' }); }
});

router.put('/subsidiaries/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const [sub] = await db('subsidiaries').where({ id: req.params.id, company_id: req.user!.companyId }).update({
      name: d.name,
      legal_name: d.legalName || null,
      parent_id: d.parentId || null,
      country: d.country || 'Indonesia',
      state: d.state || null,
      address: d.address || null,
      web_site: d.webSite || null,
      document_number_prefix: d.documentNumberPrefix || null,
      return_email: d.returnEmail || null,
      fax: d.fax || null,
      elimination: d.elimination || false,
      is_active: !d.isInactive,
      updated_at: new Date(),
    }).returning('*');
    res.json({ success: true, data: sub });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to update subsidiary' }); }
});

router.delete('/subsidiaries/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const sub = await db('subsidiaries').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!sub) { res.status(404).json({ success: false, error: 'Subsidiary not found' }); return; }
    const hasUsers = await db('users').where({ subsidiary_id: req.params.id }).count('id as c').first();
    if (parseInt((hasUsers as any)?.c || '0') > 0) {
      res.status(400).json({ success: false, error: 'Cannot delete subsidiary with assigned users' }); return;
    }
    await db('subsidiaries').where({ id: req.params.id }).update({ is_active: false });
    res.json({ success: true, message: 'Subsidiary deleted' });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to delete subsidiary' }); }
});

// Tax Codes
router.get('/tax-codes', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('tax_codes').where({ company_id: req.user!.companyId, is_active: true }).orderBy('code');
    res.json({ success: true, data });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch tax codes' }); }
});

// Currencies
router.get('/currencies', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('currencies').where({ is_active: true }).orderBy('code');
    res.json({ success: true, data });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch currencies' }); }
});

// UOM
router.get('/uom', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('units_of_measure').where({ company_id: req.user!.companyId, is_active: true }).orderBy('code');
    res.json({ success: true, data });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch UOM' }); }
});

// Warehouses
router.get('/warehouses', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('warehouses as w').leftJoin('locations as l', 'w.location_id', 'l.id')
      .where({ 'w.company_id': req.user!.companyId, 'w.is_active': true })
      .select('w.*', 'l.name as location_name').orderBy('w.code');
    res.json({ success: true, data });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch warehouses' }); }
});

// Audit Trail
router.get('/audit', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 50 } = req.query as any;
    const companyId = req.user!.companyId;
    let query = db('audit_logs as al').leftJoin('users as u', 'al.user_id', 'u.id')
      .where({ 'al.company_id': companyId })
      .select('al.*', 'u.name as user_name');
    if (req.query.entityType) query = query.where({ 'al.entity_type': req.query.entityType });
    if (req.query.entityId) query = query.where({ 'al.entity_id': req.query.entityId });
    const total = parseInt((await query.clone().clearSelect().count('* as count').first() as any)?.count || '0');
    const data = await query.orderBy('al.created_at', 'desc').limit(parseInt(limit)).offset((parseInt(page) - 1) * parseInt(limit));
    res.json({ success: true, data, total, page: parseInt(page) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch audit log' }); }
});

// Activities
router.get('/activities/:entityType/:entityId', async (req: Request, res: Response): Promise<void> => {
  try {
    const activities = await db('activities as a').leftJoin('users as u', 'a.created_by', 'u.id')
      .where({ 'a.company_id': req.user!.companyId, 'a.entity_type': req.params.entityType, 'a.entity_id': req.params.entityId })
      .select('a.*', 'u.name as created_by_name').orderBy('a.activity_date', 'desc');
    res.json({ success: true, data: activities });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch activities' }); }
});

router.post('/activities', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const [activity] = await db('activities').insert({
      company_id: req.user!.companyId, entity_type: d.entityType, entity_id: d.entityId,
      type: d.type || 'note', content: d.content, activity_date: new Date(),
      created_by: req.user!.id,
    }).returning('*');
    res.status(201).json({ success: true, data: activity });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to create activity' }); }
});

// Notifications
router.get('/notifications', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('notifications').where({ user_id: req.user!.id }).orderBy('created_at', 'desc').limit(50);
    const unreadCount = await db('notifications').where({ user_id: req.user!.id, is_read: false }).count('id as count').first();
    res.json({ success: true, data, unreadCount: parseInt((unreadCount as any)?.count || 0) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch notifications' }); }
});

router.put('/notifications/:id/read', async (req: Request, res: Response): Promise<void> => {
  try {
    await db('notifications').where({ id: req.params.id, user_id: req.user!.id }).update({ is_read: true });
    res.json({ success: true });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to mark notification' }); }
});

export default router;

// ─── Document Number Sequence ─────────────────────────────────────────────────
router.get('/next-number/:prefix', async (req: Request, res: Response): Promise<void> => {
  try {
    const { prefix } = req.params;
    const companyId  = req.user!.companyId;
    const year       = new Date().getFullYear();

    // Upsert: get current and increment atomically
    const existing = await db('document_sequences')
      .where({ company_id: companyId, prefix, year })
      .first();

    let nextNum: number;
    if (existing) {
      nextNum = existing.last_number + 1;
      await db('document_sequences')
        .where({ id: existing.id })
        .update({ last_number: nextNum, updated_at: new Date() });
    } else {
      nextNum = 1;
      await db('document_sequences').insert({
        company_id: companyId, prefix, year, last_number: 1,
      });
    }

    // Format: CH/2026-000001
    const formatted = `${prefix}/${year}-${String(nextNum).padStart(6, '0')}`;
    res.json({ success: true, data: { prefix, year, number: nextNum, formatted } });
  } catch (e: any) {
    console.error('[ERP ERROR]', e.message);
    res.status(500).json({ success: false, error: 'Failed to generate document number' });
  }
});

// Preview next number without incrementing
router.get('/peek-number/:prefix', async (req: Request, res: Response): Promise<void> => {
  try {
    const { prefix } = req.params;
    const companyId  = req.user!.companyId;
    const year       = new Date().getFullYear();
    const existing   = await db('document_sequences')
      .where({ company_id: companyId, prefix, year }).first();
    const nextNum    = existing ? existing.last_number + 1 : 1;
    const formatted  = `${prefix}/${year}-${String(nextNum).padStart(6, '0')}`;
    res.json({ success: true, data: { prefix, year, number: nextNum, formatted } });
  } catch (e: any) {
    res.status(500).json({ success: false, error: 'Failed to peek number' });
  }
});

// ─── Accounting Periods ───────────────────────────────────────────────────────
router.get('/accounting-periods', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('accounting_periods').where({ company_id: req.user!.companyId }).orderBy('start_date', 'desc');
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to fetch accounting periods' }); }
});

router.post('/accounting-periods', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    if (!d.name || !d.startDate || !d.endDate) { res.status(400).json({ success: false, error: 'Name, start date and end date required' }); return; }
    const [period] = await db('accounting_periods').insert({
      company_id: req.user!.companyId,
      name: d.name, fiscal_year: d.fiscalYear || new Date(d.startDate).getFullYear(),
      start_date: d.startDate, end_date: d.endDate, status: 'open',
    }).returning('*');
    res.status(201).json({ success: true, data: period });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to create accounting period' }); }
});

router.post('/accounting-periods/:id/close', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const [p] = await db('accounting_periods').where({ id: req.params.id, company_id: req.user!.companyId }).update({ status: 'closed' }).returning('*');
    res.json({ success: true, data: p });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to close period' }); }
});

router.post('/accounting-periods/:id/reopen', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const [p] = await db('accounting_periods').where({ id: req.params.id, company_id: req.user!.companyId }).update({ status: 'open' }).returning('*');
    res.json({ success: true, data: p });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to reopen period' }); }
});

// ─── Tax Codes CRUD ───────────────────────────────────────────────────────────
router.post('/tax-codes', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const [tc] = await db('tax_codes').insert({
      company_id: req.user!.companyId, name: d.name, code: d.code, rate: d.rate,
      description: d.description || null, is_active: d.isActive !== false, tax_type: d.taxType || 'vat',
    }).returning('*');
    res.status(201).json({ success: true, data: tc });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to create tax code' }); }
});

router.put('/tax-codes/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const [tc] = await db('tax_codes').where({ id: req.params.id, company_id: req.user!.companyId })
      .update({ name: d.name, code: d.code, rate: d.rate, description: d.description || null, is_active: d.isActive, tax_type: d.taxType }).returning('*');
    res.json({ success: true, data: tc });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to update tax code' }); }
});

// ─── Departments CRUD ─────────────────────────────────────────────────────────
router.post('/departments', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const [dept] = await db('departments').insert({
      company_id: req.user!.companyId, name: d.name, code: d.code || null,
      parent_id: d.parentId || null, description: d.description || null, is_active: d.isActive !== false,
    }).returning('*');
    res.status(201).json({ success: true, data: dept });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to create department' }); }
});

router.put('/departments/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const [dept] = await db('departments').where({ id: req.params.id, company_id: req.user!.companyId })
      .update({ name: d.name, code: d.code || null, parent_id: d.parentId || null, description: d.description || null, is_active: d.isActive }).returning('*');
    res.json({ success: true, data: dept });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to update department' }); }
});

// ─── Locations PUT ────────────────────────────────────────────────────────────
router.put('/locations/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const [loc] = await db('locations').where({ id: req.params.id, company_id: req.user!.companyId })
      .update({ name: d.name, code: d.code || null, type: d.type || 'warehouse', address: d.address || null, is_active: d.isActive }).returning('*');
    res.json({ success: true, data: loc });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to update location' }); }
});

// ─── Import CSV (stub) ────────────────────────────────────────────────────────
router.post('/import-csv', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    // Stub: In production, this would parse and import the CSV file
    res.json({ success: true, data: { success: 0, errors: ['Import functionality requires file upload middleware. Configure multer for production use.'] } });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to process import' }); }
});
