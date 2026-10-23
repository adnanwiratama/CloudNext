import { Router, Request, Response } from 'express';
import db from '../../config/database';
import { authenticate, requireAdmin } from '../../middleware/auth';
import { clearPermCache } from '../../middleware/permissions';
import { IMPORT_TYPES, getImportType, ImportTypeDef } from './importSchema';
import { peekTransactionNumber } from '../../utils/sequence';
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

const MONTH_NAMES = ['january','february','march','april','may','june','july','august','september','october','november','december'];
// Coerce a fiscal-year-start value (month name or number) into an integer 1–12.
function coerceFiscalMonth(v: any): number | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number') return v >= 1 && v <= 12 ? v : undefined;
  const s = String(v).trim();
  if (/^\d+$/.test(s)) { const n = parseInt(s); return n >= 1 && n <= 12 ? n : undefined; }
  const idx = MONTH_NAMES.indexOf(s.toLowerCase());
  return idx >= 0 ? idx + 1 : undefined;
}

router.put('/company', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    // Build the patch from fields that actually exist on the companies table.
    // (No postal_code / timezone columns; fiscal_year_start is an integer month.)
    const patch: any = {
      name: d.name, legal_name: d.legalName, tax_id: d.taxId, email: d.email || null, phone: d.phone || null,
      website: d.website || null, address: d.address || null, city: d.city || null, country: d.country || null,
    };
    const fy = coerceFiscalMonth(d.fiscalYearStart);
    if (fy !== undefined) patch.fiscal_year_start = fy;
    const [updated] = await db('companies').where({ id: req.user!.companyId }).update(patch).returning('*');
    res.json({ success: true, data: updated });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to update company' }); }
});

// Upload / clear the company logo. Stored as a base64 data URL in companies.logo_url.
// Body: { logo: 'data:image/png;base64,...' } to set, or { logo: null } to clear.
router.put('/company/logo', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { logo } = req.body || {};
    if (logo) {
      if (typeof logo !== 'string' || !/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/.test(logo)) {
        res.status(400).json({ success: false, error: 'Invalid image. Use PNG, JPG, GIF, WEBP or SVG.' });
        return;
      }
      // Guard payload size (~2MB of base64 ≈ 1.5MB image).
      if (logo.length > 2_800_000) {
        res.status(400).json({ success: false, error: 'Image too large. Max ~2MB.' });
        return;
      }
    }
    const [updated] = await db('companies').where({ id: req.user!.companyId })
      .update({ logo_url: logo || null }).returning(['id', 'logo_url']);
    res.json({ success: true, data: updated });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to update logo' }); }
});

// Users
// Ensure users has department_id / location_id (employee dropdowns reference master lists).
let _userColsEnsured = false;
async function ensureUserColumns(): Promise<void> {
  if (_userColsEnsured) return;
  if (!(await db.schema.hasColumn('users', 'department_id'))) await db.schema.alterTable('users', (t: any) => t.uuid('department_id').nullable());
  if (!(await db.schema.hasColumn('users', 'location_id'))) await db.schema.alterTable('users', (t: any) => t.uuid('location_id').nullable());
  _userColsEnsured = true;
}

router.get('/users', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureUserColumns();
    const users = await db('users as u').leftJoin('roles as r', 'u.role_id', 'r.id')
      .leftJoin('subsidiaries as s', 'u.subsidiary_id', 's.id')
      .leftJoin('departments as dep', 'u.department_id', 'dep.id')
      .leftJoin('locations as loc', 'u.location_id', 'loc.id')
      .where({ 'u.company_id': req.user!.companyId })
      .select('u.id', 'u.name', 'u.email', 'u.phone', 'u.is_active', 'u.is_admin', 'u.last_login_at',
        'u.employee_number', 'u.department', 'u.position', 'u.role_id', 'u.department_id', 'u.location_id', 'u.subsidiary_id',
        'r.name as role_name', 's.name as subsidiary_name',
        db.raw('COALESCE(dep.name, u.department) as department_name'), 'loc.name as location_name')
      .orderBy('u.name');
    res.json({ success: true, data: users });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch users' }); }
});

router.post('/users', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureUserColumns();
    const d = req.body;
    if (!d.name || !d.email) {
      res.status(400).json({ success: false, error: 'Name and email are required' }); return;
    }
    // Give Access on → password required; off → store a random hash (no login) since the column is NOT NULL.
    const giveAccess = d.giveAccess !== false;
    if (giveAccess && !d.password) {
      res.status(400).json({ success: false, error: 'Password is required when giving access' }); return;
    }
    const hash = await bcrypt.hash(d.password || `noaccess-${Date.now()}-${Math.random()}`, 12);
    const [user] = await db('users').insert({
      company_id: req.user!.companyId, name: d.name, email: d.email.toLowerCase(),
      password_hash: hash, phone: d.phone, role_id: d.roleId || null,
      subsidiary_id: d.subsidiaryId || null,
      employee_number: d.employeeNumber || null, department: d.department || null, position: d.position || null,
      department_id: d.departmentId || null, location_id: d.locationId || null,
      is_active: d.giveAccess === false ? false : (d.isActive !== false), is_admin: d.isAdmin || false,
    }).returning(['id', 'name', 'email', 'phone', 'is_active', 'is_admin', 'role_id']);
    res.status(201).json({ success: true, data: user });
  } catch (e: any) {
    if (e.code === '23505') res.status(409).json({ success: false, error: 'A user with this email already exists.' });
    else res.status(500).json({ success: false, error: 'Failed to create user' });
  }
});

router.put('/users/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureUserColumns();
    const d = req.body;
    const update: any = { name: d.name, phone: d.phone, role_id: d.roleId || null, subsidiary_id: d.subsidiaryId || null, is_active: d.isActive, is_admin: d.isAdmin };
    if (d.employeeNumber !== undefined) update.employee_number = d.employeeNumber || null;
    if (d.department !== undefined) update.department = d.department || null;
    if (d.departmentId !== undefined) update.department_id = d.departmentId || null;
    if (d.locationId !== undefined) update.location_id = d.locationId || null;
    if (d.position !== undefined) update.position = d.position || null;
    if (d.password) update.password_hash = await bcrypt.hash(d.password, 12);
    const [updated] = await db('users').where({ id: req.params.id, company_id: req.user!.companyId }).update(update).returning(['id', 'name', 'email', 'is_active', 'is_admin']);
    res.json({ success: true, data: updated });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to update user' }); }
});

// Current user's effective permission levels (for the frontend to gate buttons).
router.get('/my-permissions', async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user!.isAdmin || !req.user!.roleId) { res.json({ success: true, data: { isAdmin: req.user!.isAdmin, permissions: {} } }); return; }
    const role = await db('roles').where({ id: req.user!.roleId }).first();
    let permissions: Record<string, string> = {};
    if (role?.permissions) { try { permissions = typeof role.permissions === 'string' ? JSON.parse(role.permissions) : role.permissions; } catch { permissions = {}; } }
    res.json({ success: true, data: { isAdmin: false, permissions } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to fetch permissions' }); }
});

// Roles
// The live `roles` table lacks is_active on some DBs; ensure it so filtering + soft-delete work.
let _roleColsEnsured = false;
async function ensureRoleColumns(): Promise<void> {
  if (_roleColsEnsured) return;
  if (!(await db.schema.hasColumn('roles', 'is_active'))) {
    await db.schema.alterTable('roles', (t: any) => t.boolean('is_active').defaultTo(true));
  }
  _roleColsEnsured = true;
}

router.get('/roles', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureRoleColumns();
    const roles = await db('roles').where({ company_id: req.user!.companyId }).andWhere((qb: any) => qb.where('is_active', true).orWhereNull('is_active')).orderBy('name');
    res.json({ success: true, data: roles });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch roles' }); }
});

router.post('/roles', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureRoleColumns();
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
    clearPermCache(req.params.id); // apply new permission levels immediately
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
// Some DBs were created from an older schema missing subsidiary_id/type/country — ensure them.
let _locColsEnsured = false;
async function ensureLocationColumns(): Promise<void> {
  if (_locColsEnsured) return;
  if (!(await db.schema.hasColumn('locations', 'subsidiary_id'))) await db.schema.alterTable('locations', (t: any) => t.uuid('subsidiary_id').nullable());
  if (!(await db.schema.hasColumn('locations', 'type'))) await db.schema.alterTable('locations', (t: any) => t.string('type', 50).defaultTo('warehouse'));
  if (!(await db.schema.hasColumn('locations', 'country'))) await db.schema.alterTable('locations', (t: any) => t.string('country', 100).defaultTo('Indonesia'));
  _locColsEnsured = true;
}

router.get('/locations', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('locations').where({ company_id: req.user!.companyId, is_active: true }).orderBy('code');
    res.json({ success: true, data });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch locations' }); }
});

router.post('/locations', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureLocationColumns();
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

// Currencies & exchange rates are handled by modules/settings/currency.routes.ts

// UOM (flat list of units — used by item/transaction dropdowns)
router.get('/uom', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('units_of_measure').where({ company_id: req.user!.companyId, is_active: true }).orderBy('code');
    res.json({ success: true, data });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch UOM' }); }
});

// ─── UOM Types + Unit Conversion ──────────────────────────────────────────────
// List UOM types with their units (supports search + includeInactive)
router.get('/uom-types', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const includeInactive = req.query.includeInactive === 'true';
    const search = (req.query.search as string || '').trim();

    let typesQ = db('uom_types').where({ company_id: companyId });
    if (!includeInactive) typesQ = typesQ.where({ is_active: true });
    const types = await typesQ.orderBy('name');

    const typeIds = types.map((t: any) => t.id);
    const units = typeIds.length
      ? await db('units_of_measure').where({ company_id: companyId }).whereIn('uom_type_id', typeIds).orderBy('code')
      : [];

    const byType: Record<string, any[]> = {};
    for (const u of units) {
      (byType[u.uom_type_id] = byType[u.uom_type_id] || []).push(u);
    }
    let data = types.map((t: any) => {
      const us = byType[t.id] || [];
      const base = us.find((u: any) => u.is_base_unit);
      return { ...t, units: us, base_unit_name: base?.name || null, base_unit_code: base?.code || null, unit_count: us.length };
    });
    if (search) {
      const s = search.toLowerCase();
      data = data.filter((t: any) =>
        String(t.name).toLowerCase().includes(s) ||
        (t.units || []).some((u: any) => String(u.name).toLowerCase().includes(s) || String(u.code || '').toLowerCase().includes(s)));
    }
    res.json({ success: true, data });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch UOM types' }); }
});

// Get a single UOM type with its units
router.get('/uom-types/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const type = await db('uom_types').where({ id: req.params.id, company_id: companyId }).first();
    if (!type) { res.status(404).json({ success: false, error: 'UOM type not found' }); return; }
    const units = await db('units_of_measure').where({ company_id: companyId, uom_type_id: type.id }).orderBy('code');
    res.json({ success: true, data: { ...type, units } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to fetch UOM type' }); }
});

// Helper: persist a type + its units atomically, enforcing exactly one base unit (rate 1)
async function saveUomTypeUnits(trx: any, companyId: string, typeId: string, units: any[]): Promise<void> {
  const incoming = Array.isArray(units) ? units : [];
  // Determine the base unit: explicit is_base_unit flag, else first row
  let baseIdx = incoming.findIndex((u: any) => u.isBaseUnit || u.is_base_unit);
  if (baseIdx < 0 && incoming.length > 0) baseIdx = 0;

  const keepIds: string[] = [];
  for (let i = 0; i < incoming.length; i++) {
    const u = incoming[i];
    const isBase = i === baseIdx;
    const rate = isBase ? 1 : (Number(u.conversionRateToBase ?? u.conversion_rate_to_base ?? 0) || 0);
    const row = {
      company_id: companyId,
      uom_type_id: typeId,
      code: (u.abbreviation || u.code || u.name || '').toString().slice(0, 20),
      name: u.name || u.code || '',
      abbreviation: u.abbreviation || null,
      plural_name: u.pluralName ?? u.plural_name ?? null,
      plural_abbreviation: u.pluralAbbreviation ?? u.plural_abbreviation ?? null,
      conversion_rate_to_base: rate,
      is_base_unit: isBase,
      is_active: u.isActive === false ? false : true,
    };
    if (u.id) {
      await trx('units_of_measure').where({ id: u.id, company_id: companyId }).update(row);
      keepIds.push(u.id);
    } else {
      const [ins] = await trx('units_of_measure').insert(row).returning('id');
      keepIds.push(typeof ins === 'object' ? ins.id : ins);
    }
  }
  // Remove units that belonged to this type but were deleted in the form,
  // unless they are referenced elsewhere (then just deactivate).
  const existing = await trx('units_of_measure').where({ company_id: companyId, uom_type_id: typeId });
  for (const ex of existing) {
    if (keepIds.includes(ex.id)) continue;
    const refs = await trx('items').where({ base_uom_id: ex.id }).orWhere({ purchase_uom_id: ex.id }).orWhere({ sales_uom_id: ex.id }).orWhere({ stock_uom_id: ex.id }).first();
    if (refs) await trx('units_of_measure').where({ id: ex.id }).update({ is_active: false });
    else await trx('units_of_measure').where({ id: ex.id }).del();
  }
}

// Create UOM type + units
router.post('/uom-types', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    if (!d.name) { res.status(400).json({ success: false, error: 'Type Name is required' }); return; }
    const result = await db.transaction(async (trx) => {
      const [type] = await trx('uom_types').insert({
        company_id: companyId, name: d.name, description: d.description || null,
        is_active: d.isActive === false ? false : true,
      }).returning('*');
      await saveUomTypeUnits(trx, companyId, type.id, d.units || []);
      const units = await trx('units_of_measure').where({ company_id: companyId, uom_type_id: type.id }).orderBy('code');
      return { ...type, units };
    });
    res.status(201).json({ success: true, data: result });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to create UOM type' }); }
});

// Update UOM type + units
router.put('/uom-types/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    const existing = await db('uom_types').where({ id: req.params.id, company_id: companyId }).first();
    if (!existing) { res.status(404).json({ success: false, error: 'UOM type not found' }); return; }
    const result = await db.transaction(async (trx) => {
      const [type] = await trx('uom_types').where({ id: req.params.id }).update({
        name: d.name ?? existing.name, description: d.description ?? existing.description,
        is_active: d.isActive === undefined ? existing.is_active : d.isActive,
        updated_at: new Date(),
      }).returning('*');
      if (d.units !== undefined) await saveUomTypeUnits(trx, companyId, type.id, d.units || []);
      const units = await trx('units_of_measure').where({ company_id: companyId, uom_type_id: type.id }).orderBy('code');
      return { ...type, units };
    });
    res.json({ success: true, data: result });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to update UOM type' }); }
});

// Delete (deactivate) UOM type
router.delete('/uom-types/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const type = await db('uom_types').where({ id: req.params.id, company_id: companyId }).first();
    if (!type) { res.status(404).json({ success: false, error: 'UOM type not found' }); return; }
    // Deactivate the type and its units (soft) to preserve any FK references
    await db.transaction(async (trx) => {
      await trx('uom_types').where({ id: type.id }).update({ is_active: false, updated_at: new Date() });
      await trx('units_of_measure').where({ company_id: companyId, uom_type_id: type.id }).update({ is_active: false });
    });
    res.json({ success: true, message: 'UOM type deactivated' });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to delete UOM type' }); }
});

// Convert a quantity between two units of the same type
router.get('/uom-convert', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const fromId = req.query.fromId as string;
    const toId = req.query.toId as string;
    const qty = Number(req.query.qty ?? 1);
    if (!fromId || !toId) { res.status(400).json({ success: false, error: 'fromId and toId are required' }); return; }
    const from = await db('units_of_measure').where({ id: fromId, company_id: companyId }).first();
    const to = await db('units_of_measure').where({ id: toId, company_id: companyId }).first();
    if (!from || !to) { res.status(404).json({ success: false, error: 'Unit not found' }); return; }
    if (from.uom_type_id !== to.uom_type_id) { res.status(400).json({ success: false, error: 'Units belong to different UOM types' }); return; }
    const fromRate = Number(from.conversion_rate_to_base || 0);
    const toRate = Number(to.conversion_rate_to_base || 0);
    if (toRate === 0) { res.status(400).json({ success: false, error: 'Target unit has no conversion rate' }); return; }
    // qty(from) -> base = qty * fromRate ; base -> to = /toRate
    const result = (qty * fromRate) / toRate;
    res.json({ success: true, data: { qty, from: from.name, to: to.name, result } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to convert' }); }
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

// ─── Import Assistant ─────────────────────────────────────────────────────────
// Expose the importable record types + their field definitions for the wizard.
router.get('/import-types', async (_req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: IMPORT_TYPES });
});

// Coerce a raw CSV string into the field's type.
function coerce(val: any, type?: string): any {
  if (val == null || val === '') return null;
  const s = String(val).trim();
  if (type === 'number') { const n = parseFloat(s.replace(/[^0-9.-]/g, '')); return isNaN(n) ? 0 : n; }
  if (type === 'boolean') return ['1', 'true', 'yes', 'y', 'active'].includes(s.toLowerCase());
  if (type === 'date') { const d = new Date(s); return isNaN(d.getTime()) ? s : d.toISOString().split('T')[0]; }
  return s;
}

// Generate the next sequential document/record number for a column given a prefix,
// e.g. CUST-000001. Used when the CSV doesn't provide the number.
async function nextNumber(trx: any, companyId: string, table: string, col: string, prefix: string): Promise<string> {
  const last = await trx(table).where({ company_id: companyId }).whereNotNull(col)
    .orderBy('created_at', 'desc').select(col).first().catch(() => null);
  const n = last && /\d+/.test(String(last[col])) ? parseInt(String(last[col]).replace(/\D/g, '')) : 0;
  return `${prefix}${String(n + 1).padStart(6, '0')}`;
}

// Columns (per table) that are NOT NULL and must be auto-filled if the CSV omits them.
const AUTO_NUMBER: Record<string, { col: string; prefix: string }> = {
  customers:       { col: 'customer_number', prefix: 'CUST-' },
  vendors:         { col: 'vendor_number',   prefix: 'VEND-' },
  items:           { col: 'item_code',       prefix: 'ITEM-' },
  accounts:        { col: 'code',            prefix: '' },
  journal_entries: { col: 'journal_number',  prefix: 'JE-' },
  sales_orders:    { col: 'order_number',    prefix: 'SO-' },
  purchase_orders: { col: 'po_number',       prefix: 'PO-' },
  invoices:        { col: 'invoice_number',  prefix: 'INV-' },
  vendor_bills:    { col: 'bill_number',     prefix: 'BILL-' },
  quotations:              { col: 'quotation_number',      prefix: 'QUO-' },
  purchase_requisitions:   { col: 'requisition_number',    prefix: 'PR-' },
  return_authorizations:   { col: 'ra_number',             prefix: 'RA-' },
  credit_memos:            { col: 'memo_number',           prefix: 'CM-' },
  expense_reports:         { col: 'report_number',         prefix: 'EXP-' },
  inventory_adjustments:   { col: 'adjustment_number',     prefix: 'ADJ-' },
  inventory_transfer_orders: { col: 'transfer_order_number', prefix: 'TO-' },
  work_orders:             { col: 'wo_number',             prefix: 'WO-' },
  bank_transfers:          { col: 'transfer_number',       prefix: 'TRF-' },
  customer_deposits:       { col: 'deposit_number',        prefix: 'CDEP-' },
  vendor_prepayments:      { col: 'prepayment_number',     prefix: 'VPRE-' },
  bank_checks:             { col: 'check_number',          prefix: 'CHK-' },
  bank_deposits:           { col: 'deposit_number',        prefix: 'DEP-' },
};

// Resolve a FK id by matching a human value (name/code) against a lookup table.
async function resolveId(trx: any, companyId: string, table: string, cols: string[], value: any): Promise<string | null> {
  if (!value) return null;
  const q = trx(table).where({ company_id: companyId });
  q.where((qb: any) => { for (const c of cols) qb.orWhereRaw(`LOWER(${c}) = ?`, [String(value).toLowerCase()]); });
  const row = await q.select('id').first();
  return row ? row.id : null;
}

// Build a { field: value } object for a row from the mapping + CSV row.
function mapRow(def: ImportTypeDef, mapping: Record<string, string>, row: Record<string, any>, lineOnly: boolean) {
  const out: Record<string, any> = {};
  for (const f of def.fields) {
    if (!!f.line !== lineOnly) continue;
    const csvCol = mapping[f.key];
    if (!csvCol) continue;
    out[f.key] = coerce(row[csvCol], f.type);
  }
  return out;
}

// Per-request cache of a table's column names so we can strip fields that don't
// exist on the target table (e.g. updated_at on inventory_adjustments).
async function tableColumns(trx: any, table: string, cache: Map<string, Set<string>>): Promise<Set<string>> {
  if (cache.has(table)) return cache.get(table)!;
  const info = await trx(table).columnInfo();
  const set = new Set(Object.keys(info));
  cache.set(table, set);
  return set;
}
// Return a copy of obj with only keys that are real columns on `table`.
async function filterCols(trx: any, table: string, obj: Record<string, any>, cache: Map<string, Set<string>>): Promise<Record<string, any>> {
  const cols = await tableColumns(trx, table, cache);
  const out: Record<string, any> = {};
  for (const k of Object.keys(obj)) if (cols.has(k)) out[k] = obj[k];
  return out;
}

// Header tables that have a NOT NULL due_date column to default.
const HAS_DUE_DATE = new Set(['invoices', 'vendor_bills']);
// Line tables that have a line_number column (others must not receive it).
const HAS_LINE_NUMBER = new Set([
  'invoice_lines', 'sales_order_lines', 'purchase_order_lines', 'vendor_bill_lines',
  'journal_entry_lines', 'quotation_lines', 'purchase_requisition_lines',
  'bank_check_lines', 'bank_deposit_lines',
]);

// Resolve human-readable reference fields on a transaction header into FK ids and
// remap any aliased keys onto their real column names. Mutates `header` in place.
async function resolveHeaderRefs(trx: any, companyId: string, def: ImportTypeDef, header: Record<string, any>): Promise<void> {
  if (header.customer_name !== undefined) { header.customer_id = await resolveId(trx, companyId, 'customers', ['name', 'customer_number'], header.customer_name); delete header.customer_name; }
  if (header.vendor_name !== undefined) { header.vendor_id = await resolveId(trx, companyId, 'vendors', ['name', 'vendor_number'], header.vendor_name); delete header.vendor_name; }
  // Account references (code or name → id).
  if (header.bank_account_code !== undefined) { header.bank_account_id = await resolveId(trx, companyId, 'accounts', ['code', 'name'], header.bank_account_code); delete header.bank_account_code; }
  if (header.from_account_code !== undefined) { header.from_account_id = await resolveId(trx, companyId, 'accounts', ['code', 'name'], header.from_account_code); delete header.from_account_code; }
  if (header.to_account_code !== undefined) { header.to_account_id = await resolveId(trx, companyId, 'accounts', ['code', 'name'], header.to_account_code); delete header.to_account_code; }
  // Write Check: the header-level account_code maps to expense_account_id.
  if (def.table === 'bank_checks' && header.account_code !== undefined) { header.expense_account_id = await resolveId(trx, companyId, 'accounts', ['code', 'name'], header.account_code); delete header.account_code; }
  // Location references (name → id).
  if (header.from_location_name !== undefined) { header.from_location_id = await resolveId(trx, companyId, 'locations', ['name', 'code'], header.from_location_name); delete header.from_location_name; }
  if (header.to_location_name !== undefined) { header.to_location_id = await resolveId(trx, companyId, 'locations', ['name', 'code'], header.to_location_name); delete header.to_location_name; }
  if (header.location_name !== undefined) { header.location_id = await resolveId(trx, companyId, 'locations', ['name', 'code'], header.location_name); delete header.location_name; }
  // Work Order finished-good item + planned quantity aliases.
  if (header.item_code_header !== undefined) { header.item_id = await resolveId(trx, companyId, 'items', ['item_code', 'name'], header.item_code_header); delete header.item_code_header; }
  if (header.planned_quantity_header !== undefined) { header.planned_quantity = header.planned_quantity_header; delete header.planned_quantity_header; }
  // Write Check header total alias.
  if (header.header_amount !== undefined) { header.amount = header.header_amount; delete header.header_amount; }
}

/**
 * POST /import-csv
 * Body: { type, mode: 'add'|'update'|'addupdate', mapping: {fieldKey: csvColumn}, rows: [{...}] }
 * Client parses the CSV; server validates mapping, resolves FKs and inserts/updates.
 */
router.post('/import-csv', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const companyId = req.user!.companyId;
  const userId = req.user!.id;
  const { type, mode = 'add', mapping = {}, rows = [] } = req.body || {};
  const def = getImportType(type);
  if (!def) { res.status(400).json({ success: false, error: `Unknown import type: ${type}` }); return; }
  if (!Array.isArray(rows) || rows.length === 0) { res.status(400).json({ success: false, error: 'No rows to import' }); return; }

  // Validate required header fields are mapped.
  const missing = def.fields.filter(f => f.required && !f.line && !mapping[f.key]).map(f => f.label);
  if (missing.length) { res.status(400).json({ success: false, error: `Missing required field mapping: ${missing.join(', ')}` }); return; }

  let success = 0;
  const errors: string[] = [];
  const colCache = new Map<string, Set<string>>();

  try {
    await db.transaction(async (trx) => {
      if (def.lineTable) {
        // ── Transaction import: group rows into documents by docKey ──
        const docKeyField = def.docKey!;
        const docKeyCsv = mapping[docKeyField];
        const groups: Record<string, any[]> = {};
        const order: string[] = [];
        rows.forEach((r: any) => {
          const k = docKeyCsv ? String(r[docKeyCsv] || '').trim() : `__row_${order.length}`;
          if (!groups[k]) { groups[k] = []; order.push(k); }
          groups[k].push(r);
        });

        for (const key of order) {
          const group = groups[key];
          try {
            // Each document in its own savepoint so one bad doc doesn't abort the rest.
            await trx.transaction(async (sp) => {
              const header = mapRow(def, mapping, group[0], false);
              await resolveHeaderRefs(sp, companyId, def, header);
              // due_date is NOT NULL on invoices/vendor_bills — default it to the primary document date when omitted.
              const primaryDate = header.invoice_date || header.order_date || header.bill_date || header.entry_date;
              if (!header.due_date && primaryDate && HAS_DUE_DATE.has(def.table)) header.due_date = primaryDate;

              const lines = group.map(r => mapRow(def, mapping, r, true)).filter(l => Object.values(l).some(v => v != null && v !== ''));
              for (const l of lines) {
                if (l.item_code !== undefined) { l.item_id = await resolveId(sp, companyId, 'items', ['item_code', 'name'], l.item_code); delete l.item_code; }
                if (l.account_code !== undefined) { l.account_id = await resolveId(sp, companyId, 'accounts', ['code', 'name'], l.account_code); delete l.account_code; }
                if (l.line_description !== undefined) { l.description = l.line_description; delete l.line_description; }
                if (l.line_memo !== undefined) { l.memo = l.line_memo; delete l.line_memo; }
                if (l.line_reason !== undefined) { l.reason = l.line_reason; delete l.line_reason; }
                // Compute line amount = quantity * unit_price only for line tables that have an amount column.
                if (def.computeLineAmount) {
                  if (l.quantity == null) l.quantity = 0;
                  if (l.unit_price == null) l.unit_price = 0;
                  l.amount = Number(l.quantity) * Number(l.unit_price);
                }
              }

              // Roll line amounts up into header total column when defined.
              if (def.totalColumn) {
                const lineTotal = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
                if (header[def.totalColumn] == null) header[def.totalColumn] = lineTotal;
                if (['invoices', 'sales_orders', 'purchase_orders', 'vendor_bills', 'quotations'].includes(def.table) && header.subtotal == null) header.subtotal = lineTotal;
                if (['invoices', 'vendor_bills'].includes(def.table) && header.amount_due == null) header.amount_due = lineTotal;
              }

              const nkVal = header[def.naturalKey];
              let existing = null;
              if (nkVal && mode !== 'add') existing = await sp(def.table).where({ company_id: companyId, [def.naturalKey]: nkVal }).first();
              if (mode === 'update' && !existing) throw new Error(`no existing ${def.label} to update`);

              let headerId: string;
              const headerData: any = { ...header, company_id: companyId, created_by: userId, updated_at: new Date() };
              if (existing) {
                const upd = await filterCols(sp, def.table, { ...header, updated_at: new Date() }, colCache);
                await sp(def.table).where({ id: existing.id }).update(upd);
                headerId = existing.id;
                await sp(def.lineTable!).where({ [def.lineFk!]: headerId }).del().catch(() => {});
              } else {
                const auto = AUTO_NUMBER[def.table];
                if (auto && !headerData[auto.col]) headerData[auto.col] = await nextNumber(sp, companyId, def.table, auto.col, auto.prefix);
                const ins = await sp(def.table).insert(await filterCols(sp, def.table, headerData, colCache)).returning('id');
                headerId = typeof ins[0] === 'object' ? ins[0].id : ins[0];
              }
              const withLineNo = HAS_LINE_NUMBER.has(def.lineTable!);
              let lineNo = 1;
              for (const l of lines) {
                const lineData: any = { [def.lineFk!]: headerId, ...l };
                if (withLineNo) lineData.line_number = lineNo++;
                await sp(def.lineTable!).insert(await filterCols(sp, def.lineTable!, lineData, colCache));
              }
            });
            success++;
          } catch (ge: any) { errors.push(`Row "${key}": ${ge.message}`); }
        }
      } else {
        // ── Master data import: one record per row (each in its own savepoint) ──
        for (let i = 0; i < rows.length; i++) {
          try {
            // Each row in its own savepoint so one bad row doesn't abort the whole transaction.
            await trx.transaction(async (sp) => {
              const rec = mapRow(def, mapping, rows[i], false);
              // Header-only transaction types (transfer funds / deposits / prepayments) need FK resolution too.
              if (def.category === 'Transactions') await resolveHeaderRefs(sp, companyId, def, rec);
              if (type === 'accounts' && rec.account_type) {
                // derive high-level type from account_type bucket (best-effort)
                const assetT = ['bank', 'accounts_receivable', 'other_current_asset', 'inventory', 'fixed_asset', 'other_asset', 'deferred_expense', 'unbilled_receivable'];
                const liabT = ['accounts_payable', 'credit_card', 'other_current_liability', 'long_term_liability', 'deferred_revenue'];
                rec.type = assetT.includes(rec.account_type) ? 'asset' : liabT.includes(rec.account_type) ? 'liability'
                  : rec.account_type === 'equity' ? 'equity' : ['income', 'other_income'].includes(rec.account_type) ? 'income'
                  : rec.account_type === 'cost_of_goods_sold' ? 'cost_of_goods' : 'expense';
              }
              const nkVal = rec[def.naturalKey];
              let existing = null;
              if (nkVal && mode !== 'add') existing = await sp(def.table).where({ company_id: companyId, [def.naturalKey]: nkVal }).first();
              if (mode === 'update' && !existing) throw new Error(`no existing ${def.label} ("${nkVal}") to update`);
              if (existing) {
                const upd = await filterCols(sp, def.table, { ...rec, updated_at: new Date() }, colCache);
                await sp(def.table).where({ id: existing.id }).update(upd);
              } else {
                const auto = AUTO_NUMBER[def.table];
                if (auto && !rec[auto.col]) rec[auto.col] = await nextNumber(sp, companyId, def.table, auto.col, auto.prefix);
                await sp(def.table).insert(await filterCols(sp, def.table, { ...rec, company_id: companyId, created_by: userId }, colCache));
              }
            });
            success++;
          } catch (re: any) { errors.push(`Row ${i + 2}: ${re.message}`); }
        }
      }
    });
    res.json({ success: true, data: { success, errors } });
  } catch (e: any) {
    console.error('[IMPORT ERROR]', e.message);
    res.status(500).json({ success: false, error: e.message || 'Failed to process import', data: { success, errors } });
  }
});

// ─── Saved CSV Imports ────────────────────────────────────────────────────────
// Persist a reusable import configuration (type, mode, delimiter, mapping) plus the
// CSV data so it can be re-run later from the "Saved CSV Import" page.
let _savedImportsEnsured = false;
async function ensureSavedImportsTable(): Promise<void> {
  if (_savedImportsEnsured) return;
  const exists = await db.schema.hasTable('saved_csv_imports');
  if (!exists) {
    await db.schema.createTable('saved_csv_imports', (t: any) => {
      t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      t.uuid('company_id').notNullable();
      t.string('name', 200).notNullable();
      t.string('record_type', 100).notNullable();
      t.string('mode', 20).notNullable().defaultTo('add');
      t.string('delimiter', 20).notNullable().defaultTo('comma');
      t.string('file_name', 300).nullable();
      t.jsonb('mapping').notNullable().defaultTo('{}');
      t.jsonb('headers').notNullable().defaultTo('[]');
      t.jsonb('rows').notNullable().defaultTo('[]');
      t.integer('row_count').notNullable().defaultTo(0);
      t.timestamp('last_run_at').nullable();
      t.uuid('created_by').nullable();
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.timestamp('updated_at').defaultTo(db.fn.now());
    });
  }
  _savedImportsEnsured = true;
}

// Normalize a stored row — knex/pg returns jsonb already parsed, but guard anyway.
const asJson = (v: any, fallback: any) => {
  if (v == null) return fallback;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fallback; } }
  return v;
};

// GET /saved-imports — list configurations (without heavy rows payload).
router.get('/saved-imports', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureSavedImportsTable();
    const list = await db('saved_csv_imports')
      .where({ company_id: req.user!.companyId })
      .select('id', 'name', 'record_type', 'mode', 'delimiter', 'file_name', 'row_count', 'last_run_at', 'created_at', 'updated_at')
      .orderBy('updated_at', 'desc');
    res.json({ success: true, data: list });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch saved imports' }); }
});

// GET /saved-imports/:id — full configuration incl. mapping, headers and rows.
router.get('/saved-imports/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureSavedImportsTable();
    const row = await db('saved_csv_imports').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!row) { res.status(404).json({ success: false, error: 'Saved import not found' }); return; }
    row.mapping = asJson(row.mapping, {});
    row.headers = asJson(row.headers, []);
    row.rows = asJson(row.rows, []);
    res.json({ success: true, data: row });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch saved import' }); }
});

// POST /saved-imports — create a new saved configuration.
router.post('/saved-imports', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureSavedImportsTable();
    const d = req.body || {};
    if (!d.name || !d.recordType) { res.status(400).json({ success: false, error: 'Name and record type are required' }); return; }
    const rows = Array.isArray(d.rows) ? d.rows : [];
    const [row] = await db('saved_csv_imports').insert({
      company_id: req.user!.companyId,
      name: d.name,
      record_type: d.recordType,
      mode: d.mode || 'add',
      delimiter: d.delimiter || 'comma',
      file_name: d.fileName || null,
      mapping: JSON.stringify(d.mapping || {}),
      headers: JSON.stringify(d.headers || []),
      rows: JSON.stringify(rows),
      row_count: rows.length,
      created_by: req.user!.id,
    }).returning('*');
    res.status(201).json({ success: true, data: row });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to save import' }); }
});

// PUT /saved-imports/:id — update an existing saved configuration.
router.put('/saved-imports/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureSavedImportsTable();
    const d = req.body || {};
    const patch: any = { updated_at: new Date() };
    if (d.name !== undefined) patch.name = d.name;
    if (d.recordType !== undefined) patch.record_type = d.recordType;
    if (d.mode !== undefined) patch.mode = d.mode;
    if (d.delimiter !== undefined) patch.delimiter = d.delimiter;
    if (d.fileName !== undefined) patch.file_name = d.fileName;
    if (d.mapping !== undefined) patch.mapping = JSON.stringify(d.mapping);
    if (d.headers !== undefined) patch.headers = JSON.stringify(d.headers);
    if (d.rows !== undefined) { patch.rows = JSON.stringify(d.rows); patch.row_count = Array.isArray(d.rows) ? d.rows.length : 0; }
    if (d.markRun) patch.last_run_at = new Date();
    const [row] = await db('saved_csv_imports').where({ id: req.params.id, company_id: req.user!.companyId }).update(patch).returning('*');
    if (!row) { res.status(404).json({ success: false, error: 'Saved import not found' }); return; }
    res.json({ success: true, data: row });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to update saved import' }); }
});

// DELETE /saved-imports/:id — remove a saved configuration.
router.delete('/saved-imports/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureSavedImportsTable();
    const n = await db('saved_csv_imports').where({ id: req.params.id, company_id: req.user!.companyId }).del();
    if (!n) { res.status(404).json({ success: false, error: 'Saved import not found' }); return; }
    res.json({ success: true });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to delete saved import' }); }
});

// ─── Auto Generated Number (transaction_sequences format) ─────────────────────
// Setup → Auto Generated Number: configure prefix/suffix/min digits/initial/current
// and allow-override per record type. generateTransactionNumber() consumes this.
let _seqColsEnsured = false;
async function ensureSequenceColumns(): Promise<void> {
  if (_seqColsEnsured) return;
  const add: Array<[string, (t: any) => void]> = [
    ['suffix', (t: any) => t.string('suffix', 20).nullable()],
    ['initial_number', (t: any) => t.integer('initial_number').defaultTo(1)],
    ['allow_override', (t: any) => t.boolean('allow_override').defaultTo(false)],
    ['label', (t: any) => t.string('label', 100).nullable()],
  ];
  for (const [col, fn] of add) {
    if (!(await db.schema.hasColumn('transaction_sequences', col))) {
      await db.schema.alterTable('transaction_sequences', fn);
    }
  }
  _seqColsEnsured = true;
}

// Friendly labels for each known transaction type.
const SEQ_LABELS: Record<string, string> = {
  journal_entry: 'Journal Entry', sales_order: 'Sales Order', quotation: 'Quotation',
  invoice: 'Invoice', fulfillment: 'Item Fulfillment', customer_payment: 'Customer Payment',
  purchase_requisition: 'Purchase Requisition', purchase_order: 'Purchase Order',
  item_receipt: 'Item Receipt', vendor_bill: 'Vendor Bill', vendor_payment: 'Vendor Payment',
  bank_check: 'Write Check', bank_deposit: 'Make Deposit', bank_transfer: 'Transfer Funds',
  expense_report: 'Expense Report', inventory_adjustment: 'Inventory Adjustment',
  inventory_transfer: 'Inventory Transfer', work_order: 'Work Order',
};

// GET /auto-numbers — list all number sequences for the company.
router.get('/auto-numbers', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureSequenceColumns();
    const rows = await db('transaction_sequences')
      .where({ company_id: req.user!.companyId })
      .orderBy('transaction_type')
      .select('id', 'transaction_type', 'label', 'prefix', 'suffix', 'min_digits',
        'initial_number', 'last_number', 'increment', 'include_year', 'allow_override');
    const data = rows.map((r: any) => ({
      ...r,
      display_label: r.label || SEQ_LABELS[r.transaction_type] ||
        r.transaction_type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    }));
    res.json({ success: true, data });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch auto numbers' }); }
});

// PUT /auto-numbers/:id — update a single sequence's format.
router.put('/auto-numbers/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureSequenceColumns();
    const d = req.body || {};
    const patch: any = {};
    if (d.prefix !== undefined) patch.prefix = d.prefix || null;
    if (d.suffix !== undefined) patch.suffix = d.suffix || null;
    if (d.minDigits !== undefined) patch.min_digits = Math.max(1, parseInt(d.minDigits) || 1);
    if (d.initialNumber !== undefined) patch.initial_number = Math.max(1, parseInt(d.initialNumber) || 1);
    if (d.increment !== undefined) patch.increment = Math.max(1, parseInt(d.increment) || 1);
    if (d.includeYear !== undefined) patch.include_year = !!d.includeYear;
    if (d.allowOverride !== undefined) patch.allow_override = !!d.allowOverride;
    // Current number: only adjustable explicitly (sets last_number).
    if (d.currentNumber !== undefined && d.currentNumber !== null && d.currentNumber !== '') {
      patch.last_number = Math.max(0, parseInt(d.currentNumber) || 0);
    }
    if (d.label !== undefined) patch.label = d.label || null;
    const [row] = await db('transaction_sequences')
      .where({ id: req.params.id, company_id: req.user!.companyId })
      .update(patch).returning('*');
    if (!row) { res.status(404).json({ success: false, error: 'Sequence not found' }); return; }
    res.json({ success: true, data: row });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to update auto number' }); }
});

// GET /auto-numbers/by-type/:type — config + live next-number preview for one record type.
// Used by transaction forms to know whether manual override is allowed and what the
// next auto number would be.
router.get('/auto-numbers/by-type/:type', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureSequenceColumns();
    const seq = await db('transaction_sequences')
      .where({ company_id: req.user!.companyId, transaction_type: req.params.type })
      .first();
    if (!seq) { res.json({ success: true, data: { exists: false, allowOverride: false, preview: null } }); return; }
    const preview = await peekTransactionNumber(req.user!.companyId, req.params.type);
    res.json({ success: true, data: { exists: true, allowOverride: !!seq.allow_override, preview, transactionType: req.params.type } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch number config' }); }
});

// ─── Sandbox Refresh (Option C) ────────────────────────────────────────────────
// Super-admin, production-only action: overwrite the sandbox database with a
// fresh copy of production. Blocked when the current session is the sandbox.
import { refreshSandbox, getSandboxRefreshMeta } from './sandboxRefresh';
import { SANDBOX_ENABLED } from '../../config/envDb';

// GET current environment + whether refresh is allowed + last-refresh metadata.
router.get('/sandbox/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const meta = await getSandboxRefreshMeta();
    res.json({
      success: true,
      data: {
        env: req.dbEnv || 'prod',
        sandboxEnabled: SANDBOX_ENABLED,
        canRefresh: SANDBOX_ENABLED && (req.dbEnv || 'prod') === 'prod',
        lastRefreshAt: meta.lastRefreshAt,
        refreshCount: meta.refreshCount,
      },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch sandbox status' });
  }
});

router.post('/sandbox/refresh', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!SANDBOX_ENABLED) {
      res.status(400).json({ success: false, error: 'Sandbox is not enabled on this server.' });
      return;
    }
    // Guard: cannot refresh FROM inside the sandbox (prevents self-overwrite / wrong direction).
    if ((req.dbEnv || 'prod') === 'sandbox') {
      res.status(403).json({ success: false, error: 'Sandbox refresh can only be run from the production environment.' });
      return;
    }
    const result = await refreshSandbox();
    res.json({ success: true, data: result });
  } catch (e: any) {
    console.error('[SANDBOX REFRESH ERROR]', e.message);
    res.status(500).json({ success: false, error: e.message || 'Failed to refresh sandbox' });
  }
});
