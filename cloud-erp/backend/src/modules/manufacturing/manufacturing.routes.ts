import { Router, Request, Response } from 'express';
import db from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { enforcePermissions } from '../../middleware/permissions';
import { getPaginationParams, buildPaginatedResult } from '../../utils/pagination';
import { generateTransactionNumber, resolveTransactionNumber } from '../../utils/sequence';
import { createAuditLog } from '../../utils/audit';
import { AccountingEngine } from '../../engines/accounting/accountingEngine';
import { InventoryEngine } from '../../engines/inventory/inventoryEngine';

const router = Router();
router.use(authenticate);
router.use(enforcePermissions);

// ─────────────────────────────────────────────────────────────────────────────
// Schema reconciliation (runtime-ensure). The live DB diverged from the code:
// boms used `version` (not `revision`) and lacked effective/expiry/yield/memo;
// the component table is `bom_components` here. Create/patch anything missing so
// BOM, Work Order and Assembly Build all work consistently.
// ─────────────────────────────────────────────────────────────────────────────
let _mfgEnsured = false;
async function ensureMfgSchema(): Promise<void> {
  if (_mfgEnsured) return;
  const addCol = async (table: string, col: string, build: (t: any) => void) => {
    if (await db.schema.hasTable(table) && !(await db.schema.hasColumn(table, col))) {
      await db.schema.alterTable(table, build);
    }
  };
  // boms header columns
  await addCol('boms', 'revision', (t: any) => t.string('revision', 20).defaultTo('1'));
  await addCol('boms', 'effective_date', (t: any) => t.date('effective_date').nullable());
  await addCol('boms', 'expiry_date', (t: any) => t.date('expiry_date').nullable());
  await addCol('boms', 'yield_percent', (t: any) => t.decimal('yield_percent', 10, 4).defaultTo(100));
  await addCol('boms', 'description', (t: any) => t.text('description').nullable());
  await addCol('boms', 'memo', (t: any) => t.text('memo').nullable());
  await addCol('boms', 'is_active', (t: any) => t.boolean('is_active').defaultTo(true));
  await addCol('boms', 'updated_by', (t: any) => t.uuid('updated_by').nullable());

  // bom_components table (code uses this name)
  if (!(await db.schema.hasTable('bom_components'))) {
    await db.schema.createTable('bom_components', (t: any) => {
      t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      t.uuid('bom_id').notNullable().references('id').inTable('boms').onDelete('CASCADE');
      t.integer('sequence').notNullable().defaultTo(1);
      t.uuid('item_id').notNullable();
      t.text('description').nullable();
      t.decimal('quantity', 20, 6).notNullable().defaultTo(1);
      t.decimal('bom_quantity', 20, 6).defaultTo(1);
      t.decimal('component_yield', 10, 4).defaultTo(100);
      t.uuid('uom_id').nullable();
      t.decimal('scrap_percent', 10, 4).defaultTo(0);
      t.string('supply_type', 30).defaultTo('pull');
      t.text('notes').nullable();
      t.timestamps(true, true);
    });
  } else {
    await addCol('bom_components', 'description', (t: any) => t.text('description').nullable());
    await addCol('bom_components', 'bom_quantity', (t: any) => t.decimal('bom_quantity', 20, 6).defaultTo(1));
    await addCol('bom_components', 'component_yield', (t: any) => t.decimal('component_yield', 10, 4).defaultTo(100));
  }

  // assembly_build_lines (components consumed per build)
  if (!(await db.schema.hasTable('assembly_build_lines'))) {
    await db.schema.createTable('assembly_build_lines', (t: any) => {
      t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      t.uuid('build_id').notNullable().references('id').inTable('assembly_builds').onDelete('CASCADE');
      t.uuid('item_id').notNullable();
      t.decimal('quantity', 20, 6).notNullable();
      t.uuid('uom_id').nullable();
      t.decimal('unit_cost', 20, 4).defaultTo(0);
      t.decimal('total_cost', 20, 4).defaultTo(0);
      t.timestamps(true, true);
    });
  }
  // work_orders columns missing on some DBs (routing/warehouse/variance/sales order)
  await addCol('work_orders', 'routing_id', (t: any) => t.uuid('routing_id').nullable());
  await addCol('work_orders', 'warehouse_id', (t: any) => t.uuid('warehouse_id').nullable());
  await addCol('work_orders', 'variance_amount', (t: any) => t.decimal('variance_amount', 20, 4).defaultTo(0));
  await addCol('work_orders', 'sales_order_id', (t: any) => t.uuid('sales_order_id').nullable());

  // assembly_builds extra columns
  await addCol('assembly_builds', 'work_order_id', (t: any) => t.uuid('work_order_id').nullable());
  await addCol('assembly_builds', 'bom_id', (t: any) => t.uuid('bom_id').nullable());
  await addCol('assembly_builds', 'memo', (t: any) => t.text('memo').nullable());
  await addCol('assembly_builds', 'total_cost', (t: any) => t.decimal('total_cost', 20, 4).defaultTo(0));
  await addCol('assembly_builds', 'unit_cost', (t: any) => t.decimal('unit_cost', 20, 4).defaultTo(0));
  _mfgEnsured = true;
}

// ===== WORK CENTERS =====
router.get('/work-centers', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('work_centers').where({ company_id: req.user!.companyId, is_active: true }).orderBy('code');
    res.json({ success: true, data });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch work centers' }); }
});

router.post('/work-centers', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const [wc] = await db('work_centers').insert({
      company_id: req.user!.companyId, code: d.code, name: d.name,
      location_id: d.locationId || null, capacity: d.capacity || 8,
      machine_description: d.machineDescription, labor_rate: d.laborRate || 0,
      machine_rate: d.machineRate || 0, overhead_rate: d.overheadRate || 0,
      efficiency_percent: d.efficiencyPercent || 100, is_active: true,
    }).returning('*');
    res.status(201).json({ success: true, data: wc });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to create work center' }); }
});

// ===== BILL OF MATERIALS =====
router.get('/boms', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureMfgSchema();
    const { page, limit, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    let query = db('boms as b').join('items as i', 'b.finished_good_id', 'i.id')
      .where({ 'b.company_id': companyId, 'b.is_deleted': false })
      .select('b.*', 'i.item_code', 'i.name as item_name');
    if (search) query = query.where((qb: any) => qb.whereILike('b.bom_number', `%${search}%`).orWhereILike('i.name', `%${search}%`));
    if (req.query.status) query = query.where({ 'b.status': req.query.status });
    if (req.query.finishedGoodId) query = query.where({ 'b.finished_good_id': req.query.finishedGoodId });
    const total = parseInt((await query.clone().clearSelect().count('* as count').first() as any)?.count || '0');
    const data = await query.orderBy('b.bom_number').limit(limit!).offset(((page || 1) - 1) * (limit || 25));
    res.json({ success: true, ...buildPaginatedResult(data, total, page || 1, limit || 25) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch BOMs' }); }
});

router.get('/boms/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureMfgSchema();
    const bom = await db('boms as b').join('items as i', 'b.finished_good_id', 'i.id')
      .leftJoin('units_of_measure as uom', 'b.uom_id', 'uom.id')
      .where({ 'b.id': req.params.id, 'b.company_id': req.user!.companyId })
      .select('b.*', 'i.item_code', 'i.name as item_name', 'uom.code as uom_code').first();
    if (!bom) { res.status(404).json({ success: false, error: 'BOM not found' }); return; }
    const components = await db('bom_components as bc').join('items as i', 'bc.item_id', 'i.id')
      .leftJoin('units_of_measure as uom', 'bc.uom_id', 'uom.id')
      .where({ 'bc.bom_id': bom.id }).orderBy('bc.sequence')
      .select('bc.*', 'i.item_code', 'i.name as item_name', 'i.standard_cost', 'i.average_cost',
        'uom.code as uom_code', 'uom.name as uom_name');
    // alias for frontends that expect `lines`
    res.json({ success: true, data: { ...bom, components, lines: components } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch BOM' }); }
});

function bomComponentRows(bomId: string, components: any[]): any[] {
  return (components || []).filter((c: any) => c.itemId).map((c: any, idx: number) => ({
    bom_id: bomId, sequence: c.sequence || (idx + 1),
    item_id: c.itemId, description: c.description || null,
    quantity: Number(c.quantity ?? 1),
    bom_quantity: Number(c.bomQuantity ?? c.bom_quantity ?? 1),
    component_yield: Number(c.componentYield ?? c.component_yield ?? 100),
    uom_id: c.uomId || null,
    scrap_percent: Number(c.scrapPercent || 0), supply_type: c.supplyType || 'pull', notes: c.notes || null,
  }));
}

router.post('/boms', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureMfgSchema();
    const companyId = req.user!.companyId;
    const d = req.body;
    if (!d.finishedGoodId || !d.name) {
      res.status(400).json({ success: false, error: 'Finished good and name are required' }); return;
    }

    const lastBom = await db('boms').where({ company_id: companyId }).orderBy('created_at', 'desc').first();
    const lastNum = lastBom?.bom_number ? parseInt(String(lastBom.bom_number).replace(/\D/g, '').slice(-6)) || 0 : 0;
    const bomNumber = d.bomNumber || `BOM-${new Date().getFullYear()}-${String(lastNum + 1).padStart(6, '0')}`;

    const [bom] = await db('boms').insert({
      company_id: companyId, bom_number: bomNumber, name: d.name,
      finished_good_id: d.finishedGoodId, revision: d.revision || '1',
      effective_date: d.effectiveDate || null, expiry_date: d.expiryDate || null,
      quantity: d.quantity || 1, uom_id: d.uomId || null,
      yield_percent: d.yieldPercent || 100,
      status: d.inactive ? 'inactive' : (d.status || 'active'),
      is_active: d.inactive ? false : true,
      description: d.description || null, memo: d.memo || null, created_by: req.user!.id,
    }).returning('*');

    if (d.components?.length > 0) {
      await db('bom_components').insert(bomComponentRows(bom.id, d.components));
    }

    await createAuditLog({ companyId, userId: req.user!.id, action: 'create', entityType: 'bom', entityId: bom.id, entityNumber: bom.bom_number });
    res.status(201).json({ success: true, data: bom });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to create BOM' }); }
});

router.put('/boms/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureMfgSchema();
    const companyId = req.user!.companyId;
    const d = req.body;
    const existing = await db('boms').where({ id: req.params.id, company_id: companyId, is_deleted: false }).first();
    if (!existing) { res.status(404).json({ success: false, error: 'BOM not found' }); return; }
    const [bom] = await db('boms').where({ id: existing.id }).update({
      name: d.name ?? existing.name,
      finished_good_id: d.finishedGoodId || existing.finished_good_id,
      revision: d.revision ?? existing.revision,
      effective_date: d.effectiveDate || null, expiry_date: d.expiryDate || null,
      quantity: d.quantity || existing.quantity, uom_id: d.uomId || null,
      yield_percent: d.yieldPercent ?? existing.yield_percent,
      status: d.inactive ? 'inactive' : (d.status || 'active'),
      is_active: d.inactive ? false : true,
      description: d.description ?? existing.description, memo: d.memo ?? existing.memo,
      updated_by: req.user!.id, updated_at: new Date(),
    }).returning('*');
    await db('bom_components').where({ bom_id: existing.id }).del();
    if (d.components?.length > 0) {
      await db('bom_components').insert(bomComponentRows(existing.id, d.components));
    }
    res.json({ success: true, data: bom });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to update BOM' }); }
});

router.delete('/boms/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const bom = await db('boms').where({ id: req.params.id, company_id: companyId }).first();
    if (!bom) { res.status(404).json({ success: false, error: 'BOM not found' }); return; }
    const woUsing = await db('work_orders').where({ bom_id: bom.id, is_deleted: false }).first();
    if (woUsing) { res.status(400).json({ success: false, error: 'Cannot delete a BOM referenced by a work order' }); return; }
    await db('boms').where({ id: bom.id }).update({ is_deleted: true });
    res.json({ success: true, message: 'BOM deleted' });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to delete BOM' }); }
});

// ===== WORK ORDERS =====
router.get('/work-orders', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    let query = db('work_orders as wo').join('items as i', 'wo.item_id', 'i.id')
      .leftJoin('locations as l', 'wo.location_id', 'l.id')
      .leftJoin('boms as b', 'wo.bom_id', 'b.id')
      .where({ 'wo.company_id': companyId, 'wo.is_deleted': false })
      .select('wo.*', 'i.item_code', 'i.name as item_name', 'l.name as location_name', 'b.bom_number');
    if (search) query = query.where((qb: any) => qb.whereILike('wo.wo_number', `%${search}%`).orWhereILike('i.name', `%${search}%`));
    if (req.query.status) query = query.where({ 'wo.status': req.query.status });
    const total = parseInt((await query.clone().clearSelect().count('* as count').first() as any)?.count || '0');
    const data = await query.orderBy('wo.planned_start_date', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch work orders' }); }
});

router.get('/work-orders/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureMfgSchema();
    // Only join tables that exist in this DB (routings/warehouses may be absent on some installs).
    const [hasRoutings, hasWarehouses] = await Promise.all([
      db.schema.hasTable('routings'), db.schema.hasTable('warehouses'),
    ]);
    const woQuery = db('work_orders as wo')
      .join('items as i', 'wo.item_id', 'i.id')
      .leftJoin('boms as b', 'wo.bom_id', 'b.id')
      .leftJoin('locations as l', 'wo.location_id', 'l.id')
      .leftJoin('departments as dep', 'wo.department_id', 'dep.id')
      .leftJoin('subsidiaries as sub', 'wo.subsidiary_id', 'sub.id')
      .where({ 'wo.id': req.params.id, 'wo.company_id': req.user!.companyId });
    const woSelect: any[] = ['wo.*', 'i.item_code', 'i.name as item_name', 'b.bom_number', 'b.name as bom_name',
      'l.name as location_name', 'dep.name as department_name', 'sub.name as subsidiary_name'];
    if (hasRoutings) { woQuery.leftJoin('routings as r', 'wo.routing_id', 'r.id'); woSelect.push('r.name as routing_name'); }
    if (hasWarehouses) { woQuery.leftJoin('warehouses as w', 'wo.warehouse_id', 'w.id'); woSelect.push('w.name as warehouse_name'); }
    const wo = await woQuery.select(woSelect).first();
    if (!wo) { res.status(404).json({ success: false, error: 'Work order not found' }); return; }
    const materials = await db('work_order_materials as wom').join('items as i', 'wom.item_id', 'i.id')
      .leftJoin('units_of_measure as uom', 'wom.uom_id', 'uom.id')
      .where({ 'wom.wo_id': wo.id })
      .select('wom.*', 'i.item_code', 'i.name as item_name', 'uom.code as uom_code');
    const hasOps = await db.schema.hasTable('work_order_operations');
    const operations = hasOps ? await db('work_order_operations as woo').join('work_centers as wc', 'woo.work_center_id', 'wc.id')
      .where({ 'woo.wo_id': wo.id }).orderBy('woo.sequence')
      .select('woo.*', 'wc.name as work_center_name') : [];
    const issues = (await db.schema.hasTable('material_issues')) ? await db('material_issues').where({ wo_id: wo.id }) : [];
    const completions = (await db.schema.hasTable('work_order_completions')) ? await db('work_order_completions').where({ wo_id: wo.id }) : [];
    // GL: material-issue + wo-completion journals linked to this WO's issues/completions
    const sourceIds = [...issues.map((i: any) => i.id), ...completions.map((c: any) => c.id)];
    let journalEntries: any[] = [];
    if (sourceIds.length > 0) {
      const jes = await db('journal_entries').where({ company_id: req.user!.companyId })
        .whereIn('source_type', ['material_issue', 'wo_completion'])
        .whereIn('source_id', sourceIds).select('*');
      for (const je of jes as any[]) {
        je.lines = await db('journal_entry_lines as jel').leftJoin('accounts as a', 'jel.account_id', 'a.id')
          .where({ 'jel.journal_id': je.id }).orderBy('jel.line_number')
          .select('jel.*', 'a.code as account_code', 'a.name as account_name');
      }
      journalEntries = jes;
    }
    res.json({ success: true, data: { ...wo, materials, operations, issues, completions, journalEntries } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch work order' }); }
});

router.post('/work-orders', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureMfgSchema();
    const companyId = req.user!.companyId;
    const d = req.body;
    if (!d.itemId || !d.quantity) {
      res.status(400).json({ success: false, error: 'Item and quantity are required' }); return;
    }

    // BOM is optional
    const bom = d.bomId ? await db('boms').where({ id: d.bomId, company_id: companyId }).first() : null;
    const components = bom ? await db('bom_components as bc').join('items as i', 'bc.item_id', 'i.id')
      .where({ 'bc.bom_id': d.bomId }).select('bc.*', 'i.standard_cost', 'i.average_cost') : [];

    // Use quantity (from frontend form) or plannedQuantity
    const plannedQty = d.quantity || d.plannedQuantity || 1;

    const woNumber = await resolveTransactionNumber(companyId, 'work_order', req.body?.documentNumber, db);

    // Calculate estimated costs
    let estimatedMaterialCost = 0;
    const materials: any[] = [];
    for (const comp of components) {
      const requiredQty = (comp.quantity * plannedQty / (bom?.quantity || 1)) * (1 + comp.scrap_percent / 100);
      const cost = (comp.standard_cost || comp.average_cost || 0);
      estimatedMaterialCost += requiredQty * cost;
      materials.push({ itemId: comp.item_id, plannedQuantity: requiredQty, uomId: comp.uom_id, standardCost: cost });
    }

    const [wo] = await db('work_orders').insert({
      company_id: companyId, subsidiary_id: d.subsidiaryId || null, wo_number: woNumber,
      item_id: d.itemId, planned_quantity: plannedQty, uom_id: d.uomId || null,
      bom_id: d.bomId || null, routing_id: d.routingId || null,
      location_id: d.locationId || null, warehouse_id: d.warehouseId || null,
      planned_start_date: d.plannedStartDate, planned_end_date: d.plannedEndDate,
      status: 'planned', memo: d.memo,
      estimated_material_cost: estimatedMaterialCost,
      estimated_labor_cost: d.estimatedLaborCost || 0,
      estimated_machine_cost: d.estimatedMachineCost || 0,
      estimated_overhead_cost: d.estimatedOverheadCost || 0,
      sales_order_id: d.salesOrderId || null,
      created_by: req.user!.id,
    }).returning('*');

    // Create WO materials
    if (materials.length > 0) {
      await db('work_order_materials').insert(materials.map(m => ({
        wo_id: wo.id, item_id: m.itemId, planned_quantity: m.plannedQuantity,
        uom_id: m.uomId || null, standard_cost: m.standardCost,
      })));
    }

    // Create WO operations from routing
    if (d.routingId) {
      const routingOps = await db('routing_operations').where({ routing_id: d.routingId }).orderBy('sequence');
      if (routingOps.length > 0) {
        await db('work_order_operations').insert(routingOps.map((op: any) => ({
          wo_id: wo.id, routing_op_id: op.id, sequence: op.sequence,
          operation_name: op.operation_name, work_center_id: op.work_center_id,
          planned_setup_hours: op.setup_time,
          planned_run_hours: op.run_time_per_unit * d.plannedQuantity,
          planned_labor_cost: (op.setup_time + op.run_time_per_unit * d.plannedQuantity) * op.labor_cost_per_hour,
          status: 'pending',
        })));
      }
    }

    await createAuditLog({ companyId, userId: req.user!.id, action: 'create', entityType: 'work_order', entityId: wo.id, entityNumber: wo.wo_number });
    res.status(201).json({ success: true, data: wo });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to create work order' }); }
});

// Release Work Order
router.post('/work-orders/:id/release', async (req: Request, res: Response): Promise<void> => {
  try {
    const wo = await db('work_orders').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!wo) { res.status(404).json({ success: false, error: 'Work order not found' }); return; }
    if (wo.status !== 'planned') {
      res.status(400).json({ success: false, error: `Cannot release WO with status: ${wo.status}` }); return;
    }
    const [updated] = await db('work_orders').where({ id: wo.id })
      .update({ status: 'released', actual_start_date: new Date().toISOString().split('T')[0] }).returning('*');
    res.json({ success: true, data: updated, message: 'Work order released' });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to release work order' }); }
});

// Issue Materials to Work Order
router.post('/work-orders/:id/issue-materials', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const wo = await db('work_orders').where({ id: req.params.id, company_id: companyId }).first();
    if (!wo) { res.status(404).json({ success: false, error: 'Work order not found' }); return; }
    if (!['released', 'in_progress'].includes(wo.status)) {
      res.status(400).json({ success: false, error: `Cannot issue materials to WO with status: ${wo.status}` }); return;
    }

    await db.transaction(async (trx) => {
      const d = req.body;
      const issueNumber = await generateTransactionNumber(companyId, 'material_issue', trx);
      const [issue] = await trx('material_issues').insert({
        company_id: companyId, issue_number: issueNumber, wo_id: wo.id,
        issue_date: d.issueDate || new Date().toISOString().split('T')[0],
        from_warehouse_id: d.fromWarehouseId || wo.warehouse_id,
        status: 'issued', memo: d.memo, created_by: req.user!.id,
      }).returning('*');

      const lines = d.lines || [];
      let totalMaterialCost = 0;
      const issueLineInserts: any[] = [];
      const inventoryLines: any[] = [];

      for (const line of lines) {
        const item = await trx('items').where({ id: line.itemId }).first();
        const unitCost = item?.average_cost || 0;
        const totalCost = line.quantity * unitCost;
        totalMaterialCost += totalCost;

        issueLineInserts.push({
          issue_id: issue.id, wo_material_id: line.woMaterialId || null,
          item_id: line.itemId, quantity: line.quantity, uom_id: line.uomId || null,
          bin_id: line.binId || null, lot_number: line.lotNumber, serial_number: line.serialNumber,
          unit_cost: unitCost, total_cost: totalCost,
        });

        inventoryLines.push({ itemId: line.itemId, quantity: line.quantity, direction: 'out' as const, warehouseId: d.fromWarehouseId || wo.warehouse_id });

        if (line.woMaterialId) {
          await trx('work_order_materials').where({ id: line.woMaterialId }).increment('issued_quantity', line.quantity);
        }
      }

      if (issueLineInserts.length > 0) await trx('material_issue_lines').insert(issueLineInserts);

      // Move inventory out
      if (inventoryLines.length > 0) {
        await InventoryEngine.createTransaction({
          companyId, transactionType: 'wo_issue',
          referenceType: 'material_issue', referenceId: issue.id,
          transactionDate: issue.issue_date,
          warehouseId: d.fromWarehouseId || wo.warehouse_id,
          memo: `Material issue for WO ${wo.wo_number}`,
          lines: inventoryLines, createdBy: req.user!.id, trx,
        });
      }

      // Update WO status and actual cost
      await trx('work_orders').where({ id: wo.id }).update({
        status: 'in_progress',
        actual_material_cost: trx.raw('actual_material_cost + ?', [totalMaterialCost]),
      });

      // Post GL: WIP debit, Inventory credit
      await AccountingEngine.postMaterialIssue(issue.id, req.user!.id, trx);

      res.json({ success: true, data: issue, message: 'Materials issued successfully' });
    });
  } catch (e: any) {
    console.error("[ERP ERROR]", e.message);
    res.status(500).json({ success: false, error: e.message || 'Failed to issue materials' });
  }
});

// Complete Work Order
router.post('/work-orders/:id/complete', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const wo = await db('work_orders').where({ id: req.params.id, company_id: companyId }).first();
    if (!wo) { res.status(404).json({ success: false, error: 'Work order not found' }); return; }
    if (!['in_progress', 'released'].includes(wo.status)) {
      res.status(400).json({ success: false, error: `Cannot complete WO with status: ${wo.status}` }); return;
    }

    await db.transaction(async (trx) => {
      const d = req.body;
      const completionNumber = await generateTransactionNumber(companyId, 'wo_completion', trx);
      const completedQty = parseFloat(d.completedQuantity);
      const scrappedQty = parseFloat(d.scrappedQuantity || 0);

      const actualMaterialCost = parseFloat(wo.actual_material_cost || 0);
      const actualLaborCost = parseFloat(d.actualLaborCost || wo.estimated_labor_cost || 0);
      const actualMachineCost = parseFloat(d.actualMachineCost || wo.estimated_machine_cost || 0);
      const actualOverheadCost = parseFloat(d.actualOverheadCost || wo.estimated_overhead_cost || 0);
      const totalCost = actualMaterialCost + actualLaborCost + actualMachineCost + actualOverheadCost;
      const unitCost = completedQty > 0 ? totalCost / completedQty : 0;

      const [completion] = await trx('work_order_completions').insert({
        company_id: companyId, completion_number: completionNumber, wo_id: wo.id,
        completion_date: d.completionDate || new Date().toISOString().split('T')[0],
        completed_quantity: completedQty, scrapped_quantity: scrappedQty,
        to_warehouse_id: d.toWarehouseId || wo.warehouse_id,
        bin_id: d.binId || null, lot_number: d.lotNumber,
        actual_material_cost: actualMaterialCost, actual_labor_cost: actualLaborCost,
        actual_machine_cost: actualMachineCost, actual_overhead_cost: actualOverheadCost,
        total_cost: totalCost, unit_cost: unitCost, memo: d.memo, created_by: req.user!.id,
      }).returning('*');

      // Add finished goods to inventory
      if (completedQty > 0) {
        await InventoryEngine.createTransaction({
          companyId, transactionType: 'wo_completion',
          referenceType: 'wo_completion', referenceId: completion.id,
          transactionDate: completion.completion_date,
          warehouseId: d.toWarehouseId || wo.warehouse_id,
          memo: `WO Completion ${completionNumber}`,
          lines: [{ itemId: wo.item_id, quantity: completedQty, direction: 'in', unitCost: unitCost, warehouseId: d.toWarehouseId || wo.warehouse_id }],
          createdBy: req.user!.id, trx,
        });
      }

      // Post GL entries
      await AccountingEngine.postWorkOrderCompletion(completion.id, req.user!.id, trx);

      // Update WO
      const newCompleted = parseFloat(wo.completed_quantity) + completedQty;
      const newScrapped = parseFloat(wo.scrapped_quantity) + scrappedQty;
      const variance = totalCost - (parseFloat(wo.estimated_material_cost) + parseFloat(wo.estimated_labor_cost) + parseFloat(wo.estimated_machine_cost) + parseFloat(wo.estimated_overhead_cost));

      const isFullyComplete = newCompleted >= wo.planned_quantity;
      await trx('work_orders').where({ id: wo.id }).update({
        completed_quantity: newCompleted, scrapped_quantity: newScrapped,
        actual_labor_cost: actualLaborCost, actual_machine_cost: actualMachineCost,
        actual_overhead_cost: actualOverheadCost, variance_amount: variance,
        actual_end_date: isFullyComplete ? new Date().toISOString().split('T')[0] : null,
        status: isFullyComplete ? 'completed' : 'in_progress',
      });

      // Update item average cost
      await trx('items').where({ id: wo.item_id }).update({ average_cost: unitCost });

      res.json({
        success: true,
        data: completion,
        message: `Work order completion recorded. ${completedQty} units completed at ${unitCost.toLocaleString('id-ID', { style: 'currency', currency: 'IDR' })}/unit`,
      });
    });
  } catch (e: any) {
    console.error("[ERP ERROR]", e.message);
    res.status(500).json({ success: false, error: e.message || 'Failed to complete work order' });
  }
});

// Update Work Order (only before completion)
router.put('/work-orders/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    const wo = await db('work_orders').where({ id: req.params.id, company_id: companyId }).first();
    if (!wo) { res.status(404).json({ success: false, error: 'Work order not found' }); return; }
    if (['completed', 'closed', 'cancelled'].includes(wo.status)) {
      res.status(400).json({ success: false, error: `Cannot edit a ${wo.status} work order` }); return;
    }
    const plannedQty = d.quantity || d.plannedQuantity || wo.planned_quantity;
    const [updated] = await db('work_orders').where({ id: wo.id }).update({
      item_id: d.itemId || wo.item_id, planned_quantity: plannedQty,
      bom_id: d.bomId || wo.bom_id, location_id: d.locationId || null,
      department_id: d.departmentId || null, subsidiary_id: d.subsidiaryId || null,
      planned_start_date: d.plannedStartDate || wo.planned_start_date,
      planned_end_date: d.plannedEndDate || null, memo: d.memo ?? wo.memo,
      updated_by: req.user!.id, updated_at: new Date(),
    }).returning('*');
    // Rebuild materials from the BOM if not yet issued
    const anyIssued = await db('work_order_materials').where({ wo_id: wo.id }).andWhere('issued_quantity', '>', 0).first();
    if (!anyIssued && (d.bomId || wo.bom_id)) {
      const bomId = d.bomId || wo.bom_id;
      const bom = await db('boms').where({ id: bomId }).first();
      const comps = await db('bom_components as bc').join('items as i', 'bc.item_id', 'i.id')
        .where({ 'bc.bom_id': bomId }).select('bc.*', 'i.standard_cost', 'i.average_cost');
      await db('work_order_materials').where({ wo_id: wo.id }).del();
      if (comps.length > 0) {
        await db('work_order_materials').insert(comps.map((comp: any) => {
          const req2 = (Number(comp.quantity) * plannedQty / (bom?.quantity || 1)) * (1 + Number(comp.scrap_percent || 0) / 100);
          return { wo_id: wo.id, item_id: comp.item_id, planned_quantity: req2, uom_id: comp.uom_id || null, standard_cost: comp.standard_cost || comp.average_cost || 0 };
        }));
      }
    }
    res.json({ success: true, data: updated });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to update work order' }); }
});

// ===== ASSEMBLY BUILDS =====
// An assembly build produces finished-goods from a BOM's components.
// GL: Dr. Finished-Good Inventory account / Cr. each component's Inventory account.
router.get('/assembly-builds', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureMfgSchema();
    const { page, limit, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    let query = db('assembly_builds as ab').leftJoin('items as i', 'ab.item_id', 'i.id')
      .leftJoin('locations as l', 'ab.location_id', 'l.id')
      .where({ 'ab.company_id': companyId, 'ab.is_deleted': false })
      .select('ab.*', 'i.item_code', 'i.name as item_name', 'l.name as location_name');
    if (search) query = query.where((qb: any) => qb.whereILike('ab.build_number', `%${search}%`).orWhereILike('i.name', `%${search}%`));
    const total = parseInt((await query.clone().clearSelect().count('* as count').first() as any)?.count || '0');
    const data = await query.orderBy('ab.build_date', 'desc').limit(limit!).offset(((page || 1) - 1) * (limit || 25));
    res.json({ success: true, ...buildPaginatedResult(data, total, page || 1, limit || 25) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch assembly builds' }); }
});

router.get('/assembly-builds/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureMfgSchema();
    const ab = await db('assembly_builds as ab').leftJoin('items as i', 'ab.item_id', 'i.id')
      .leftJoin('locations as l', 'ab.location_id', 'l.id')
      .leftJoin('departments as dep', 'ab.department_id', 'dep.id')
      .leftJoin('subsidiaries as sub', 'ab.subsidiary_id', 'sub.id')
      .leftJoin('work_orders as wo', 'ab.work_order_id', 'wo.id')
      .leftJoin('users as u', 'ab.created_by', 'u.id')
      .where({ 'ab.id': req.params.id, 'ab.company_id': req.user!.companyId })
      .select('ab.*', 'i.item_code', 'i.name as item_name', 'l.name as location_name',
        'dep.name as department_name', 'sub.name as subsidiary_name', 'wo.wo_number', 'u.name as created_by_name')
      .first();
    if (!ab) { res.status(404).json({ success: false, error: 'Assembly build not found' }); return; }
    const lines = await db('assembly_build_lines as abl').leftJoin('items as i', 'abl.item_id', 'i.id')
      .leftJoin('units_of_measure as uom', 'abl.uom_id', 'uom.id')
      .where({ 'abl.build_id': ab.id })
      .select('abl.*', 'i.item_code', 'i.name as item_name', 'uom.code as uom_code');
    const jes = await db('journal_entries').where({ company_id: req.user!.companyId, source_type: 'assembly_build', source_id: ab.id }).select('*');
    for (const je of jes as any[]) {
      je.lines = await db('journal_entry_lines as jel').leftJoin('accounts as a', 'jel.account_id', 'a.id')
        .where({ 'jel.journal_id': je.id }).orderBy('jel.line_number')
        .select('jel.*', 'a.code as account_code', 'a.name as account_name');
    }
    res.json({ success: true, data: { ...ab, lines, journalEntries: jes } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch assembly build' }); }
});

router.post('/assembly-builds', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureMfgSchema();
    const companyId = req.user!.companyId;
    const d = req.body;
    const itemId = d.assemblyItemId || d.itemId;
    const buildQty = Number(d.buildQty ?? d.quantity ?? 0);
    if (!itemId) { res.status(400).json({ success: false, error: 'Assembly item is required' }); return; }
    if (!buildQty || buildQty <= 0) { res.status(400).json({ success: false, error: 'Build quantity must be > 0' }); return; }
    if (!d.locationId) { res.status(400).json({ success: false, error: 'Location is required' }); return; }

    await db.transaction(async (trx) => {
      // Resolve the BOM: explicit, else the item's active BOM
      let bomId = d.bomId || null;
      if (!bomId) {
        const activeBom = await trx('boms').where({ company_id: companyId, finished_good_id: itemId, is_deleted: false })
          .andWhere((qb: any) => qb.where('status', 'active').orWhere('is_active', true)).orderBy('created_at', 'desc').first();
        bomId = activeBom?.id || null;
      }
      const bom = bomId ? await trx('boms').where({ id: bomId }).first() : null;
      const components = bomId ? await trx('bom_components as bc').join('items as i', 'bc.item_id', 'i.id')
        .where({ 'bc.bom_id': bomId })
        .select('bc.*', 'i.inventory_account_id', 'i.asset_account_id', 'i.average_cost', 'i.standard_cost') : [];

      const buildNumber = `AB-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
      const [ab] = await trx('assembly_builds').insert({
        company_id: companyId, subsidiary_id: d.subsidiaryId || null, build_number: buildNumber,
        item_id: itemId, quantity: buildQty, build_date: d.buildDate || new Date().toISOString().split('T')[0],
        location_id: d.locationId, department_id: d.departmentId || null,
        work_order_id: d.workOrderId || null, bom_id: bomId, memo: d.memo || null,
        status: 'built', created_by: req.user!.id,
      }).returning('*');

      // Consume components (inventory OUT) + build finished good (inventory IN)
      let totalComponentCost = 0;
      const bomBaseQty = Number(bom?.quantity || 1) || 1;
      const outLines: any[] = [];
      for (const comp of components as any[]) {
        const reqQty = (Number(comp.quantity) * buildQty / bomBaseQty) * (1 + Number(comp.scrap_percent || 0) / 100);
        const unitCost = Number(comp.average_cost || comp.standard_cost || 0);
        const lineCost = reqQty * unitCost;
        totalComponentCost += lineCost;
        await trx('assembly_build_lines').insert({
          build_id: ab.id, item_id: comp.item_id, quantity: reqQty, uom_id: comp.uom_id || null,
          unit_cost: unitCost, total_cost: lineCost,
        });
        outLines.push({ itemId: comp.item_id, quantity: reqQty, direction: 'out' as const, locationId: d.locationId });
      }
      // Inventory movements
      if (outLines.length > 0) {
        await InventoryEngine.createTransaction({
          companyId, transactionType: 'assembly_build', referenceType: 'assembly_build', referenceId: ab.id,
          transactionDate: ab.build_date, locationId: d.locationId,
          memo: `Assembly Build ${buildNumber} — components consumed`,
          lines: outLines, createdBy: req.user!.id, trx,
        });
      }
      const unitCost = buildQty > 0 ? totalComponentCost / buildQty : 0;
      await InventoryEngine.createTransaction({
        companyId, transactionType: 'assembly_build', referenceType: 'assembly_build', referenceId: ab.id,
        transactionDate: ab.build_date, locationId: d.locationId,
        memo: `Assembly Build ${buildNumber} — finished good`,
        lines: [{ itemId, quantity: buildQty, direction: 'in' as const, unitCost, locationId: d.locationId }],
        createdBy: req.user!.id, trx,
      });

      await trx('assembly_builds').where({ id: ab.id }).update({ total_cost: totalComponentCost, unit_cost: unitCost });
      // Keep the finished good's average cost in sync
      if (unitCost > 0) await trx('items').where({ id: itemId }).update({ average_cost: unitCost });

      // GL: Dr. Finished-Good Inventory account / Cr. each component's Inventory account
      try {
        await postAssemblyBuildGL(trx, companyId, ab.id, buildNumber, ab.build_date, itemId, totalComponentCost, components, buildQty, bomBaseQty, req.user!.id);
      } catch (glErr: any) { console.error('[GL ERROR] Assembly Build GL:', glErr.message); }

      res.status(201).json({ success: true, data: ab });
    });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: e.message || 'Failed to record assembly build' }); }
});

// GL for an assembly build. Dr finished-good inventory account for the total build value;
// Cr each component's inventory/asset account for its consumed value.
async function postAssemblyBuildGL(trx: any, companyId: string, buildId: string, buildNumber: string, date: any,
  fgItemId: string, totalCost: number, components: any[], buildQty: number, bomBaseQty: number, userId: string): Promise<void> {
  if (totalCost <= 0.009) return;
  const fgItem = await trx('items').where({ id: fgItemId }).first();
  const fgAcct = fgItem?.inventory_account_id || fgItem?.asset_account_id
    || (await trx('accounts').where({ company_id: companyId, code: '1200' }).first())?.id;
  if (!fgAcct) return;

  const jeLines: any[] = [{ account_id: fgAcct, debit: totalCost, credit: 0, memo: `Finished good built — ${buildNumber}` }];
  // Credit each component inventory account by its consumed value
  const byAccount: Record<string, number> = {};
  for (const comp of components as any[]) {
    const reqQty = (Number(comp.quantity) * buildQty / (bomBaseQty || 1)) * (1 + Number(comp.scrap_percent || 0) / 100);
    const unitCost = Number(comp.average_cost || comp.standard_cost || 0);
    const lineCost = reqQty * unitCost;
    if (lineCost <= 0) continue;
    const acct = comp.inventory_account_id || comp.asset_account_id
      || (await trx('accounts').where({ company_id: companyId, code: '1200' }).first())?.id;
    if (!acct) continue;
    byAccount[acct] = (byAccount[acct] || 0) + lineCost;
  }
  let line = 2;
  for (const [acct, amt] of Object.entries(byAccount)) {
    jeLines.push({ account_id: acct, debit: 0, credit: amt, memo: `Component consumed — ${buildNumber}` });
    line++;
  }
  const jeNum = `JE-AB-${String(Date.now()).slice(-8)}`;
  const [je] = await trx('journal_entries').insert({
    company_id: companyId, journal_number: jeNum, entry_date: date,
    memo: `Assembly Build ${buildNumber}`, source_type: 'assembly_build', source_id: buildId,
    status: 'posted', created_by: userId,
  }).returning('id');
  const jeId = je?.id || je;
  await trx('journal_entry_lines').insert(jeLines.map((l, i) => ({ journal_id: jeId, line_number: i + 1, ...l })));
}

// ===== ROUTINGS =====
router.get('/routings', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('routings').where({ company_id: req.user!.companyId }).orderBy('routing_number');
    res.json({ success: true, data });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch routings' }); }
});

router.get('/routings/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const routing = await db('routings').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!routing) { res.status(404).json({ success: false, error: 'Routing not found' }); return; }
    const operations = await db('routing_operations as ro').join('work_centers as wc', 'ro.work_center_id', 'wc.id')
      .where({ 'ro.routing_id': routing.id }).orderBy('ro.sequence')
      .select('ro.*', 'wc.code as wc_code', 'wc.name as wc_name');
    res.json({ success: true, data: { ...routing, operations } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch routing' }); }
});

export default router;

// ── Audit routes ──────────────────────────────────────────────────────────────
router.get('/work-orders/:id/audit', async (req: any, res: any) => {
  try { const l = await (db as any)('transaction_audit_log').where({ company_id: req.user.companyId, source_type: 'work_order', source_id: req.params.id }).orderBy('performed_at','desc').limit(200); res.json({ success:true, data:l }); } catch(e:any){ res.status(500).json({success:false,error:e.message}); }
});
