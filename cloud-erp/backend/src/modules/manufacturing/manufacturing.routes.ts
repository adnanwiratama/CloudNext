import { Router, Request, Response } from 'express';
import db from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { getPaginationParams, buildPaginatedResult } from '../../utils/pagination';
import { generateTransactionNumber } from '../../utils/sequence';
import { createAuditLog } from '../../utils/audit';
import { AccountingEngine } from '../../engines/accounting/accountingEngine';
import { InventoryEngine } from '../../engines/inventory/inventoryEngine';

const router = Router();
router.use(authenticate);

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
    const { page, limit, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    let query = db('boms as b').join('items as i', 'b.finished_good_id', 'i.id')
      .where({ 'b.company_id': companyId, 'b.is_deleted': false })
      .select('b.*', 'i.item_code', 'i.name as item_name');
    if (search) query = query.where((qb: any) => qb.whereILike('b.bom_number', `%${search}%`).orWhereILike('i.name', `%${search}%`));
    if (req.query.status) query = query.where({ 'b.status': req.query.status });
    const total = parseInt((await query.clone().clearSelect().count('* as count').first() as any)?.count || '0');
    const data = await query.orderBy('b.bom_number').limit(limit!).offset(((page || 1) - 1) * (limit || 25));
    res.json({ success: true, ...buildPaginatedResult(data, total, page || 1, limit || 25) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch BOMs' }); }
});

router.get('/boms/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const bom = await db('boms as b').join('items as i', 'b.finished_good_id', 'i.id')
      .leftJoin('units_of_measure as uom', 'b.uom_id', 'uom.id')
      .where({ 'b.id': req.params.id, 'b.company_id': req.user!.companyId })
      .select('b.*', 'i.item_code', 'i.name as item_name', 'uom.code as uom_code').first();
    if (!bom) { res.status(404).json({ success: false, error: 'BOM not found' }); return; }
    const components = await db('bom_components as bc').join('items as i', 'bc.item_id', 'i.id')
      .leftJoin('units_of_measure as uom', 'bc.uom_id', 'uom.id')
      .where({ 'bc.bom_id': bom.id }).orderBy('bc.sequence')
      .select('bc.*', 'i.item_code', 'i.name as item_name', 'i.standard_cost', 'i.average_cost', 'uom.code as uom_code');
    res.json({ success: true, data: { ...bom, components } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch BOM' }); }
});

router.post('/boms', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    if (!d.finishedGoodId || !d.name) {
      res.status(400).json({ success: false, error: 'Finished good and name are required' }); return;
    }

    // Auto-number
    const lastBom = await db('boms').where({ company_id: companyId }).orderBy('created_at', 'desc').first();
    const lastNum = lastBom ? parseInt(lastBom.bom_number.replace('BOM-2026-', '')) : 0;
    const bomNumber = d.bomNumber || `BOM-${new Date().getFullYear()}-${String(lastNum + 1).padStart(6, '0')}`;

    const [bom] = await db('boms').insert({
      company_id: companyId, bom_number: bomNumber, name: d.name,
      finished_good_id: d.finishedGoodId, revision: d.revision || '1',
      effective_date: d.effectiveDate, expiry_date: d.expiryDate,
      quantity: d.quantity || 1, uom_id: d.uomId || null,
      yield_percent: d.yieldPercent || 100, status: d.status || 'active',
      description: d.description, created_by: req.user!.id,
    }).returning('*');

    if (d.components?.length > 0) {
      await db('bom_components').insert(d.components.map((c: any, idx: number) => ({
        bom_id: bom.id, sequence: c.sequence || (idx + 1) * 10,
        item_id: c.itemId, quantity: c.quantity, uom_id: c.uomId || null,
        scrap_percent: c.scrapPercent || 0, supply_type: c.supplyType || 'pull', notes: c.notes,
      })));
    }

    await createAuditLog({ companyId, userId: req.user!.id, action: 'create', entityType: 'bom', entityId: bom.id, entityNumber: bom.bom_number });
    res.status(201).json({ success: true, data: bom });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to create BOM' }); }
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
    const wo = await db('work_orders as wo')
      .join('items as i', 'wo.item_id', 'i.id')
      .leftJoin('boms as b', 'wo.bom_id', 'b.id')
      .leftJoin('routings as r', 'wo.routing_id', 'r.id')
      .leftJoin('locations as l', 'wo.location_id', 'l.id')
      .leftJoin('warehouses as w', 'wo.warehouse_id', 'w.id')
      .where({ 'wo.id': req.params.id, 'wo.company_id': req.user!.companyId })
      .select('wo.*', 'i.item_code', 'i.name as item_name', 'b.bom_number', 'b.name as bom_name',
        'r.name as routing_name', 'l.name as location_name', 'w.name as warehouse_name')
      .first();
    if (!wo) { res.status(404).json({ success: false, error: 'Work order not found' }); return; }
    const materials = await db('work_order_materials as wom').join('items as i', 'wom.item_id', 'i.id')
      .leftJoin('units_of_measure as uom', 'wom.uom_id', 'uom.id')
      .where({ 'wom.wo_id': wo.id })
      .select('wom.*', 'i.item_code', 'i.name as item_name', 'uom.code as uom_code');
    const operations = await db('work_order_operations as woo').join('work_centers as wc', 'woo.work_center_id', 'wc.id')
      .where({ 'woo.wo_id': wo.id }).orderBy('woo.sequence')
      .select('woo.*', 'wc.name as work_center_name');
    const issues = await db('material_issues').where({ wo_id: wo.id });
    const completions = await db('work_order_completions').where({ wo_id: wo.id });
    res.json({ success: true, data: { ...wo, materials, operations, issues, completions } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch work order' }); }
});

router.post('/work-orders', async (req: Request, res: Response): Promise<void> => {
  try {
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

    const woNumber = await generateTransactionNumber(companyId, 'work_order', db);

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
