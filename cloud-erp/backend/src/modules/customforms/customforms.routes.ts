import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import db from '../../config/database';

const router = Router();
router.use(authenticate);

// ─── FORMS ────────────────────────────────────────────────────────────────────

// GET /custom-forms — list all forms for company
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { module } = req.query;
    let q = db('custom_forms').where({ company_id: req.user!.companyId });
    if (module) q = q.where({ module });
    const forms = await q.orderBy('name');
    res.json({ success: true, data: forms });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /custom-forms/:id — full form with tabs, fields, groups, sublists
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const form = await db('custom_forms').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!form) { res.status(404).json({ success: false, error: 'Form not found' }); return; }
    const [tabs, fields, groups, sublists, roles] = await Promise.all([
      db('custom_form_tabs').where({ form_id: form.id }).orderBy('sequence'),
      db('custom_form_fields').where({ form_id: form.id }).orderBy('sequence'),
      db('custom_form_field_groups').where({ form_id: form.id }).orderBy('sequence'),
      db('custom_form_sublists').where({ form_id: form.id }).orderBy('sequence'),
      db('custom_form_roles').where({ form_id: form.id }),
    ]);
    const sublistIds = sublists.map((s:any) => s.id);
    const sublistFields = sublistIds.length > 0
      ? await db('custom_form_sublist_fields').whereIn('sublist_id', sublistIds).orderBy('sequence')
      : [];
    res.json({ success: true, data: { ...form, tabs, fields, groups, sublists, sublistFields, roles } });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /custom-forms — create form
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    const [form] = await db('custom_forms').insert({
      company_id: companyId,
      code: d.code || `CF-${Date.now()}`,
      name: d.name,
      description: d.description || null,
      module: d.module || null,
      transaction_type: d.transactionType || null,
      printing_type: d.printingType || 'basic',
      is_active: d.isActive !== false,
      allow_add_multiple: d.allowAddMultiple || false,
      store_form_with_record: d.storeFormWithRecord !== false,
      form_is_preferred: d.formIsPreferred || false,
      custom_script: d.customScript || null,
      created_by: req.user!.id,
    }).returning('*');

    // Log history
    await db('custom_form_history').insert({ form_id: form.id, action: 'created', description: `Form "${form.name}" created`, performed_by: req.user!.id, performed_by_name: (req as any).user?.name || 'System' }).catch(() => {});

    res.status(201).json({ success: true, data: form });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// PUT /custom-forms/:id — update form header
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const [form] = await db('custom_forms')
      .where({ id: req.params.id, company_id: req.user!.companyId })
      .update({
        name: d.name, description: d.description, module: d.module,
        transaction_type: d.transactionType, printing_type: d.printingType,
        is_active: d.isActive, allow_add_multiple: d.allowAddMultiple,
        store_form_with_record: d.storeFormWithRecord,
        form_is_preferred: d.formIsPreferred,
        custom_script: d.customScript, updated_by: req.user!.id, updated_at: new Date(),
      }).returning('*');
    await db('custom_form_history').insert({ form_id: req.params.id, action: 'updated', description: `Form header updated`, performed_by: req.user!.id, performed_by_name: (req as any).user?.name }).catch(() => {});
    res.json({ success: true, data: form });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// DELETE /custom-forms/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await db('custom_forms').where({ id: req.params.id, company_id: req.user!.companyId }).delete();
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── TABS ──────────────────────────────────────────────────────────────────────

router.get('/:formId/tabs', async (req: Request, res: Response): Promise<void> => {
  try {
    const tabs = await db('custom_form_tabs').where({ form_id: req.params.formId }).orderBy('sequence');
    res.json({ success: true, data: tabs });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/:formId/tabs', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const maxSeq = await db('custom_form_tabs').where({ form_id: req.params.formId }).max('sequence as m').first();
    const [tab] = await db('custom_form_tabs').insert({
      form_id: req.params.formId, tab_id: d.tabId || `tab_${Date.now()}`,
      label: d.label, sequence: (maxSeq?.m || 0) + 10, is_visible: d.isVisible !== false, is_system: false,
    }).returning('*');
    res.status(201).json({ success: true, data: tab });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:formId/tabs/:tabId', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const [tab] = await db('custom_form_tabs').where({ id: req.params.tabId, form_id: req.params.formId })
      .update({ label: d.label, sequence: d.sequence, is_visible: d.isVisible }).returning('*');
    res.json({ success: true, data: tab });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:formId/tabs/:tabId', async (req: Request, res: Response): Promise<void> => {
  try {
    const tab = await db('custom_form_tabs').where({ id: req.params.tabId }).first();
    if (tab?.is_system) { res.status(400).json({ success: false, error: 'Cannot delete system tab' }); return; }
    await db('custom_form_tabs').where({ id: req.params.tabId, form_id: req.params.formId }).delete();
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── FIELDS ───────────────────────────────────────────────────────────────────

router.get('/:formId/fields', async (req: Request, res: Response): Promise<void> => {
  try {
    const fields = await db('custom_form_fields').where({ form_id: req.params.formId }).orderBy('sequence');
    res.json({ success: true, data: fields });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/:formId/fields', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const maxSeq = await db('custom_form_fields').where({ form_id: req.params.formId }).max('sequence as m').first();
    const [field] = await db('custom_form_fields').insert({
      form_id: req.params.formId,
      tab_id: d.tabId || null,
      group_id: d.groupId || null,
      field_id: d.fieldId || `field_${Date.now()}`,
      label: d.label,
      field_type: d.fieldType || 'text',
      subtype: d.subtype || null,
      section: d.section || 'header',
      is_visible: d.isVisible !== false,
      is_mandatory: d.isMandatory || false,
      is_readonly: d.isReadOnly || false,
      display_type: d.displayType || 'Normal',
      placeholder: d.placeholder || null,
      help_text: d.helpText || null,
      width: d.width || null,
      sequence: (maxSeq?.m || 0) + 10,
      column_break: d.columnBreak || false,
      space_before: d.spaceBefore || false,
      same_row_as_previous: d.sameRowAsPrevious || false,
      checkbox_default: d.checkboxDefault || null,
      default_value: d.defaultValue || null,
      formula: d.formula || null,
      validation_rules: d.validationRules ? JSON.stringify(d.validationRules) : null,
      datasource: d.datasource || null,
      datasource_filter: d.datasourceFilter || null,
      options: d.options ? JSON.stringify(d.options) : null,
      is_searchable: d.isSearchable || false,
      is_printable: d.isPrintable !== false,
      audit_trail: d.auditTrail !== false,
      conditions: d.conditions ? JSON.stringify(d.conditions) : null,
      permissions: d.permissions ? JSON.stringify(d.permissions) : null,
      is_system: false,
      is_custom: true,
      created_by: req.user!.id,
    }).returning('*');
    res.status(201).json({ success: true, data: field });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:formId/fields/:fieldId', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const [field] = await db('custom_form_fields')
      .where({ id: req.params.fieldId, form_id: req.params.formId })
      .update({
        label: d.label, field_type: d.fieldType, subtype: d.subtype, section: d.section,
        tab_id: d.tabId, group_id: d.groupId,
        is_visible: d.isVisible, is_mandatory: d.isMandatory, is_readonly: d.isReadOnly,
        display_type: d.displayType, placeholder: d.placeholder, help_text: d.helpText,
        width: d.width, sequence: d.sequence, column_break: d.columnBreak,
        space_before: d.spaceBefore, same_row_as_previous: d.sameRowAsPrevious,
        checkbox_default: d.checkboxDefault, default_value: d.defaultValue, formula: d.formula,
        validation_rules: d.validationRules ? JSON.stringify(d.validationRules) : null,
        datasource: d.datasource, datasource_filter: d.datasourceFilter,
        options: d.options ? JSON.stringify(d.options) : null,
        is_searchable: d.isSearchable, is_printable: d.isPrintable, audit_trail: d.auditTrail,
        conditions: d.conditions ? JSON.stringify(d.conditions) : null,
        permissions: d.permissions ? JSON.stringify(d.permissions) : null,
        updated_at: new Date(),
      }).returning('*');
    res.json({ success: true, data: field });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// PATCH sequence (bulk reorder)
router.patch('/:formId/fields/reorder', async (req: Request, res: Response): Promise<void> => {
  try {
    const { items } = req.body; // [{id, sequence}]
    await Promise.all(items.map((item: any) =>
      db('custom_form_fields').where({ id: item.id, form_id: req.params.formId }).update({ sequence: item.sequence })
    ));
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:formId/fields/:fieldId', async (req: Request, res: Response): Promise<void> => {
  try {
    const field = await db('custom_form_fields').where({ id: req.params.fieldId }).first();
    if (field?.is_system) { res.status(400).json({ success: false, error: 'Cannot delete system field' }); return; }
    await db('custom_form_fields').where({ id: req.params.fieldId, form_id: req.params.formId }).delete();
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── FIELD GROUPS ─────────────────────────────────────────────────────────────

router.get('/:formId/groups', async (req: Request, res: Response): Promise<void> => {
  try {
    const groups = await db('custom_form_field_groups').where({ form_id: req.params.formId }).orderBy('sequence');
    res.json({ success: true, data: groups });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/:formId/groups', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const [group] = await db('custom_form_field_groups').insert({
      form_id: req.params.formId, tab_id: d.tabId || null,
      group_id: d.groupId || `grp_${Date.now()}`, label: d.label,
      columns: d.columns || 2, sequence: d.sequence || 0,
      is_collapsible: d.isCollapsible || false, is_collapsed: d.isCollapsed || false,
    }).returning('*');
    res.status(201).json({ success: true, data: group });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:formId/groups/:groupId', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const [group] = await db('custom_form_field_groups').where({ id: req.params.groupId })
      .update({ label: d.label, columns: d.columns, sequence: d.sequence, tab_id: d.tabId, is_collapsible: d.isCollapsible, is_collapsed: d.isCollapsed }).returning('*');
    res.json({ success: true, data: group });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:formId/groups/:groupId', async (req: Request, res: Response): Promise<void> => {
  try {
    await db('custom_form_field_groups').where({ id: req.params.groupId, form_id: req.params.formId }).delete();
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── SUBLISTS ─────────────────────────────────────────────────────────────────

router.get('/:formId/sublists', async (req: Request, res: Response): Promise<void> => {
  try {
    const sublists = await db('custom_form_sublists').where({ form_id: req.params.formId }).orderBy('sequence');
    res.json({ success: true, data: sublists });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/:formId/sublists', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const [sublist] = await db('custom_form_sublists').insert({
      form_id: req.params.formId, tab_id: d.tabId || null,
      sublist_id: d.sublistId || `sl_${Date.now()}`, label: d.label,
      sublist_type: d.sublistType || 'list', sequence: d.sequence || 0, is_visible: d.isVisible !== false,
    }).returning('*');
    res.status(201).json({ success: true, data: sublist });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/:formId/sublists/:sublistId/fields', async (req: Request, res: Response): Promise<void> => {
  try {
    const fields = await db('custom_form_sublist_fields').where({ sublist_id: req.params.sublistId }).orderBy('sequence');
    res.json({ success: true, data: fields });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/:formId/sublists/:sublistId/fields', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const [field] = await db('custom_form_sublist_fields').insert({
      sublist_id: req.params.sublistId, field_id: d.fieldId || `sf_${Date.now()}`,
      label: d.label, field_type: d.fieldType || 'text',
      is_visible: d.isVisible !== false, is_mandatory: d.isMandatory || false,
      sequence: d.sequence || 0, datasource: d.datasource || null, options: d.options ? JSON.stringify(d.options) : null,
    }).returning('*');
    res.status(201).json({ success: true, data: field });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:formId/sublists/:sublistId/fields/:fieldId', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const [field] = await db('custom_form_sublist_fields').where({ id: req.params.fieldId })
      .update({ label: d.label, is_visible: d.isVisible, is_mandatory: d.isMandatory, sequence: d.sequence }).returning('*');
    res.json({ success: true, data: field });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── ROLES ────────────────────────────────────────────────────────────────────

router.get('/:formId/roles', async (req: Request, res: Response): Promise<void> => {
  try {
    const roles = await db('custom_form_roles').where({ form_id: req.params.formId });
    res.json({ success: true, data: roles });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/:formId/roles', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const [role] = await db('custom_form_roles').insert({
      form_id: req.params.formId, role_id: d.roleId, role_name: d.roleName,
      can_view: d.canView !== false, can_create: d.canCreate || false,
      can_edit: d.canEdit || false, can_delete: d.canDelete || false,
    }).returning('*');
    res.status(201).json({ success: true, data: role });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:formId/roles/:roleId', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const [role] = await db('custom_form_roles').where({ id: req.params.roleId })
      .update({ can_view: d.canView, can_create: d.canCreate, can_edit: d.canEdit, can_delete: d.canDelete }).returning('*');
    res.json({ success: true, data: role });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── HISTORY ──────────────────────────────────────────────────────────────────

router.get('/:formId/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const history = await db('custom_form_history').where({ form_id: req.params.formId }).orderBy('performed_at', 'desc').limit(100);
    res.json({ success: true, data: history });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── TRANSACTION FIELD VALUES (EAV) ───────────────────────────────────────────

router.post('/values', async (req: Request, res: Response): Promise<void> => {
  try {
    const { transactionType, transactionId, formId, values } = req.body;
    const companyId = req.user!.companyId;
    // Upsert each value
    for (const [fieldKey, value] of Object.entries(values || {})) {
      const existing = await db('transaction_field_values')
        .where({ company_id: companyId, transaction_type: transactionType, transaction_id: transactionId, field_key: fieldKey })
        .first();
      const strVal = value === null || value === undefined ? null : typeof value === 'object' ? JSON.stringify(value) : String(value);
      if (existing) {
        await db('transaction_field_values').where({ id: existing.id }).update({ value: strVal, updated_at: new Date() });
      } else {
        await db('transaction_field_values').insert({
          company_id: companyId, transaction_type: transactionType,
          transaction_id: transactionId, form_id: formId || null,
          field_key: fieldKey, value: strVal,
        });
      }
    }
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/values/:transactionType/:transactionId', async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await db('transaction_field_values')
      .where({ company_id: req.user!.companyId, transaction_type: req.params.transactionType, transaction_id: req.params.transactionId });
    const result: Record<string, any> = {};
    rows.forEach((r: any) => { result[r.field_key] = r.value; });
    res.json({ success: true, data: result });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── COPY FORM ────────────────────────────────────────────────────────────────
router.post('/:formId/copy', async (req: Request, res: Response): Promise<void> => {
  try {
    const original = await db('custom_forms').where({ id: req.params.formId }).first();
    if (!original) { res.status(404).json({ success: false, error: 'Form not found' }); return; }
    const { name } = req.body;
    const [newForm] = await db('custom_forms').insert({
      ...original, id: undefined,
      code: `${original.code}-COPY-${Date.now()}`,
      name: name || `${original.name} (Copy)`,
      created_by: req.user!.id, created_at: new Date(), updated_at: new Date(),
    }).returning('*');
    // Copy tabs, fields, groups
    const tabs = await db('custom_form_tabs').where({ form_id: original.id });
    for (const t of tabs) { await db('custom_form_tabs').insert({ ...t, id: undefined, form_id: newForm.id }).catch(() => {}); }
    const groups = await db('custom_form_field_groups').where({ form_id: original.id });
    for (const g of groups) { await db('custom_form_field_groups').insert({ ...g, id: undefined, form_id: newForm.id }).catch(() => {}); }
    const fields = await db('custom_form_fields').where({ form_id: original.id });
    for (const f of fields) { await db('custom_form_fields').insert({ ...f, id: undefined, form_id: newForm.id, created_at: new Date(), updated_at: new Date() }).catch(() => {}); }
    res.status(201).json({ success: true, data: newForm });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

export default router;
