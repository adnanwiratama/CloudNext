import { Router, Request, Response } from 'express';
import db from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { enforcePermissions } from '../../middleware/permissions';
import { InventoryEngine } from '../../engines/inventory/inventoryEngine';
import { AccountingEngine } from '../../engines/accounting/accountingEngine';
import { resolveApprover, creationApprovalState } from '../../utils/approvals';
import { getConfiguredApproverInfo } from '../../utils/approvals';

const router = Router();
router.use(authenticate);
router.use(enforcePermissions);

// Normalize optional uuid inputs: '' / undefined / null -> null (avoids Postgres uuid cast errors)
const uid = (v: any): string | null => (v === '' || v === undefined || v === null ? null : v);

// Resolve the Inventory/Asset account for an item: item.inventory_account_id → item.asset_account_id → company 1200
async function resolveItemInventoryAccount(companyId: string, itemId: string): Promise<string | null> {
  const item = await db('items').where({ id: itemId }).first();
  if (item?.inventory_account_id) return item.inventory_account_id;
  if (item?.asset_account_id) return item.asset_account_id;
  const inv = await db('accounts').where({ company_id: companyId, code: '1200' }).first();
  return inv?.id || null;
}

/**
 * Post the GL for an Inventory Adjustment.
 * For every line the INVENTORY side is taken from the line item's master
 * Inventory/Asset Account. The opposite (offset) side is the header adjustment
 * account (or code 5200 fallback).
 *   Increase (qty > 0): Dr. Item Inventory Account / Cr. Adjustment Account
 *   Decrease (qty < 0): Dr. Adjustment Account       / Cr. Item Inventory Account
 */
async function postAdjustmentGL(
  companyId: string, adjId: string, adjNumber: string, entryDate: any,
  lines: any[], accountId: string | null | undefined, userId: string,
  nonPosting: boolean = false,
): Promise<void> {
  let adjustAcct = accountId ? await db('accounts').where({ id: accountId }).first() : null;
  if (!adjustAcct) adjustAcct = await db('accounts').where({ company_id: companyId, code: '5200' }).first();
  if (!adjustAcct) return;

  // Build per-line GL entries
  const glLines: any[] = [];
  for (const line of lines || []) {
    const value = Number(line.adjustQty) * Number(line.unitCost || 0);
    if (Math.abs(value) <= 0.001) continue;
    const invAcctId = await resolveItemInventoryAccount(companyId, line.itemId);
    if (!invAcctId) continue;
    if (value > 0) {
      glLines.push({ account_id: invAcctId, debit: value, credit: 0, memo: 'Inventory increase' });
      glLines.push({ account_id: adjustAcct.id, debit: 0, credit: value, memo: 'Adjustment offset' });
    } else {
      glLines.push({ account_id: adjustAcct.id, debit: Math.abs(value), credit: 0, memo: 'Adjustment offset' });
      glLines.push({ account_id: invAcctId, debit: 0, credit: Math.abs(value), memo: 'Inventory decrease' });
    }
  }
  if (glLines.length === 0) return;

  const jeNum = `JE-ADJ-${String(Date.now()).slice(-8)}`;
  const [je] = await db('journal_entries').insert({
    company_id: companyId, journal_number: jeNum, entry_date: entryDate,
    memo: `Inventory Adjustment ${adjNumber}`, source_type: 'inventory_adjustment', source_id: adjId,
    status: nonPosting ? 'non_posting' : 'posted',
    posted_by: nonPosting ? null : userId, posted_at: nonPosting ? null : new Date(),
    created_by: userId,
  }).returning('id');
  const jeId = je?.id || je;
  await db('journal_entry_lines').insert(glLines.map((l, i) => ({ journal_id: jeId, line_number: i + 1, ...l })));
}

// ─── Inventory Adjustments ────────────────────────────────────────────────────
router.get('/adjustments', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('inventory_adjustments as ia')
      .leftJoin('users as u', 'ia.created_by', 'u.id')
      .where({ 'ia.company_id': req.user!.companyId })
      .select('ia.*', 'u.name as created_by_name')
      .orderBy('ia.adjustment_date', 'desc').limit(100);
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to fetch adjustments' }); }
});

router.post('/adjustments', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.lines || d.lines.length === 0) { res.status(400).json({ success: false, error: 'At least one adjustment line required' }); return; }

    const adjNumber = `ADJ-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const adjAppr = await creationApprovalState(companyId, 'inventory_adjustments');

    const [adj] = await db('inventory_adjustments').insert({
      company_id: companyId,
      adjustment_number: adjNumber,
      adjustment_date: d.adjustmentDate || new Date(),
      adjustment_type: d.adjustmentType || 'quantity',
      reason: d.reason || null,
      account_id: uid(d.accountId),
      memo: d.memo || null,
      status: adjAppr.nonPosting ? 'pending_approval' : 'posted',
      approval_status: adjAppr.approvalStatus,
      created_by: req.user!.id,
    }).returning('*');

    // Insert lines and update inventory balances (balances are kept in the item's BASE unit).
    // Inventory movements are deferred to approval when pending.
    for (const line of d.lines) {
      await db('inventory_adjustment_lines').insert({
        adjustment_id: adj.id,
        item_id: line.itemId,
        location_id: uid(line.locationId),
        adjust_qty: Number(line.adjustQty),
        uom_id: line.uomId || null,
        unit_cost: Number(line.unitCost || 0),
        reason: line.reason || null,
      });

      if (!adjAppr.approvalRequired) {
        // Convert the entered qty (in the line's unit) to the item's base stock unit
        const rate = await InventoryEngine.baseRate(db, line.uomId || null);
        const baseAdjQty = Number(line.adjustQty) * rate;

        // Update inventory balance
        const existing = await db('inventory_balances')
          .where({ company_id: companyId, item_id: line.itemId, location_id: line.locationId })
          .first();

        if (existing) {
          await db('inventory_balances')
            .where({ id: existing.id })
            .update({ qty_on_hand: db.raw('qty_on_hand + ?', [baseAdjQty]) });
        } else {
          await db('inventory_balances').insert({
            company_id: companyId,
            item_id: line.itemId,
            location_id: uid(line.locationId),
            lot_number: '', serial_number: '',
            qty_on_hand: Math.max(0, baseAdjQty),
            qty_committed: 0,
            avg_cost: Number(line.unitCost || 0),
          });
        }
      }
    }

    // ── GL: per-line. Deferred to non-posting when pending approval ──
    try {
      await postAdjustmentGL(companyId, adj.id || adj, adjNumber, d.adjustmentDate || new Date(), d.lines, d.accountId, req.user!.id, adjAppr.nonPosting);
    } catch (glErr: any) { console.error('[GL ERROR] Inventory Adjustment GL:', glErr.message); }

    res.status(201).json({ success: true, data: { ...adj, adjustment_number: adjNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to post adjustment' }); }
});

// ─── Transfer Inventory ───────────────────────────────────────────────────────
router.get('/transfers', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('inventory_transfers as it')
      .leftJoin('locations as fl', 'it.from_location_id', 'fl.id')
      .leftJoin('locations as tl', 'it.to_location_id', 'tl.id')
      .where({ 'it.company_id': req.user!.companyId })
      .select('it.*', 'fl.name as from_location_name', 'tl.name as to_location_name')
      .orderBy('it.transfer_date', 'desc').limit(100);
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to fetch transfers' }); }
});

router.post('/transfers', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.fromLocationId || !d.toLocationId) { res.status(400).json({ success: false, error: 'Both locations are required' }); return; }

    const tfrNumber = `TFR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const tfrAppr = await creationApprovalState(companyId, 'inventory_transfers');

    const [transfer] = await db('inventory_transfers').insert({
      company_id: companyId,
      transfer_number: tfrNumber,
      transfer_date: d.transferDate || new Date(),
      from_location_id: d.fromLocationId,
      to_location_id: d.toLocationId,
      reference: d.reference || null,
      memo: d.memo || null,
      status: tfrAppr.nonPosting ? 'pending_approval' : 'posted',
      approval_status: tfrAppr.approvalStatus,
      created_by: req.user!.id,
    }).returning('*');

    // Insert lines; inventory balances updated only when not pending approval.
    for (const line of d.lines || []) {
      await db('inventory_transfer_lines').insert({
        transfer_id: transfer.id,
        item_id: line.itemId,
        qty: Number(line.qty),
        uom_id: line.uomId || null,
        unit_cost: Number(line.unitCost || 0),
      });

      if (!tfrAppr.approvalRequired) {
        // Convert transfer qty to base stock unit
        const rate = await InventoryEngine.baseRate(db, line.uomId || null);
        const baseQty = Number(line.qty) * rate;

        // Deduct from source
        await db('inventory_balances')
          .where({ company_id: companyId, item_id: line.itemId, location_id: d.fromLocationId })
          .update({ qty_on_hand: db.raw('GREATEST(0, qty_on_hand - ?)', [baseQty]) });

        // Add to destination
        const destBalance = await db('inventory_balances')
          .where({ company_id: companyId, item_id: line.itemId, location_id: d.toLocationId }).first();
        if (destBalance) {
          await db('inventory_balances')
            .where({ id: destBalance.id })
            .update({ qty_on_hand: db.raw('qty_on_hand + ?', [baseQty]) });
        } else {
          await db('inventory_balances').insert({
            company_id: companyId, item_id: line.itemId, location_id: d.toLocationId,
            lot_number: '', serial_number: '',
            qty_on_hand: baseQty, qty_committed: 0, avg_cost: Number(line.unitCost || 0),
          });
        }
      }
    }

    // ── GL: Dr. Inventory (To Location) / Cr. Inventory (From Location) ───────
    try {
      const invAcct = await db('accounts').where({ company_id: companyId, code: '1200' }).first();
      if (invAcct) {
        const totalValue = (d.lines || []).reduce((sum: number, line: any) => 
          sum + (Number(line.qty) * Number(line.unitCost || 0)), 0);
        
        if (totalValue > 0.01) {
          const jeNum = `JE-TFR-${String(Date.now()).slice(-8)}`;
          const [je] = await db('journal_entries').insert({
            company_id: companyId, journal_number: jeNum,
            entry_date: d.transferDate || new Date(),
            memo: `Inventory Transfer ${tfrNumber}`,
            source_type: 'inventory_transfer', source_id: transfer.id || transfer,
            status: tfrAppr.nonPosting ? 'non_posting' : 'posted',
            posted_by: tfrAppr.nonPosting ? null : req.user!.id,
            posted_at: tfrAppr.nonPosting ? null : new Date(),
            created_by: req.user!.id,
          }).returning('id');
          const jeId = je?.id || je;
          await db('journal_entry_lines').insert([
            { journal_id: jeId, line_number: 1, account_id: invAcct.id, debit: totalValue, credit: 0,          memo: `Inventory transfer in` },
            { journal_id: jeId, line_number: 2, account_id: invAcct.id, debit: 0,          credit: totalValue, memo: `Inventory transfer out` },
          ]);
        }
      }
    } catch (glErr: any) { console.error('[GL ERROR] Transfer GL:', glErr.message); }

    res.status(201).json({ success: true, data: { ...transfer, transfer_number: tfrNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to post transfer' }); }
});

// ─── Transfer Orders ──────────────────────────────────────────────────────────
router.get('/transfer-orders', async (req: Request, res: Response): Promise<void> => {
  try {
    const exists = await db.schema.hasTable('inventory_transfer_orders');
    if (!exists) { res.json({ success: true, data: [] }); return; }
    const data = await db('inventory_transfer_orders as ito')
      .leftJoin('locations as fl', 'ito.from_location_id', 'fl.id')
      .leftJoin('locations as tl', 'ito.to_location_id', 'tl.id')
      .where({ 'ito.company_id': req.user!.companyId })
      .select('ito.*', 'fl.name as from_location_name', 'tl.name as to_location_name')
      .orderBy('ito.order_date', 'desc').limit(100);
    res.json({ success: true, data });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch transfer orders' }); }
});

// ─── Transfer Bins (bin-to-bin moves) ─────────────────────────────────────────
router.get('/transfer-bins', async (req: Request, res: Response): Promise<void> => {
  try {
    const exists = await db.schema.hasTable('inventory_bin_transfers');
    if (!exists) { res.json({ success: true, data: [] }); return; }
    const data = await db('inventory_bin_transfers as ibt')
      .leftJoin('locations as loc', 'ibt.location_id', 'loc.id')
      .where({ 'ibt.company_id': req.user!.companyId })
      .select('ibt.*', 'loc.name as location_name')
      .orderBy('ibt.transfer_date', 'desc').limit(100);
    res.json({ success: true, data });
  } catch (e: any) { res.json({ success: true, data: [] }); }
});

router.post('/transfer-orders', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.fromLocationId || !d.toLocationId) { res.status(400).json({ success: false, error: 'Both locations required' }); return; }

    const toNumber = `TO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    const [order] = await db('inventory_transfer_orders').insert({
      company_id: companyId,
      transfer_order_number: toNumber,
      order_date: d.orderDate || new Date(),
      expected_date: d.expectedDate || null,
      from_location_id: d.fromLocationId,
      to_location_id: d.toLocationId,
      priority: d.priority || 'normal',
      memo: d.memo || null,
      status: 'pending',
      created_by: req.user!.id,
    }).returning('*');

    for (const line of d.lines || []) {
      await db('inventory_transfer_order_lines').insert({
        transfer_order_id: order.id,
        item_id: line.itemId,
        qty_requested: Number(line.qty),
        uom_id: line.uomId || null,
        requested_date: line.requestedDate || null,
      });
      // Commit inventory at source location so Available reduces (in base stock unit)
      if (line.itemId && Number(line.qty) > 0) {
        try {
          const baseQty = await InventoryEngine.toBaseQty(db, line.uomId || null, Number(line.qty));
          await InventoryEngine.commitInventory(db, companyId, line.itemId, baseQty, d.fromLocationId);
        } catch (invErr: any) { console.error('[INV WARNING] TO commit skipped:', invErr.message); }
      }
    }

    res.status(201).json({ success: true, data: { ...order, transfer_order_number: toNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to create transfer order' }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET BY ID + PUT (edit) for the three transactions
// ═══════════════════════════════════════════════════════════════════════════════

async function loadJournalEntries(sourceType: string, sourceId: string) {
  const jes = await db('journal_entries as je')
    .where({ 'je.source_type': sourceType, 'je.source_id': sourceId })
    .select('je.*');
  for (const je of jes as any[]) {
    je.lines = await db('journal_entry_lines as jel')
      .leftJoin('accounts as a', 'jel.account_id', 'a.id')
      .where({ 'jel.journal_id': je.id })
      .select('jel.*', 'a.code as account_code', 'a.name as account_name')
      .orderBy('jel.line_number', 'asc');
  }
  return jes;
}

async function clearJournal(sourceType: string, sourceId: string) {
  const jes = await db('journal_entries').where({ source_type: sourceType, source_id: sourceId }).select('id');
  for (const je of jes as any[]) {
    await db('journal_entry_lines').where({ journal_id: je.id }).del();
  }
  await db('journal_entries').where({ source_type: sourceType, source_id: sourceId }).del();
}

// ─── Inventory Adjustment: GET /:id ─────────────────────────────────────────
router.get('/adjustments/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const adj = await db('inventory_adjustments as ia')
      .leftJoin('users as u', 'ia.created_by', 'u.id')
      .leftJoin('accounts as a', 'ia.account_id', 'a.id')
      .where({ 'ia.id': req.params.id, 'ia.company_id': companyId })
      .select('ia.*', 'u.name as created_by_name', 'a.code as account_code', 'a.name as account_name')
      .first();
    if (!adj) { res.status(404).json({ success: false, error: 'Adjustment not found' }); return; }
    const lines = await db('inventory_adjustment_lines as l')
      .leftJoin('items as i', 'l.item_id', 'i.id')
      .leftJoin('locations as loc', 'l.location_id', 'loc.id')
      .leftJoin('units_of_measure as uom', 'l.uom_id', 'uom.id')
      .where({ 'l.adjustment_id': adj.id })
      .select('l.*', 'i.name as item_name', 'i.item_code', 'loc.name as location_name', 'uom.name as uom_name');
    const journalEntries = await loadJournalEntries('inventory_adjustment', adj.id);
    res.json({ success: true, data: { ...adj, lines, journalEntries } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch adjustment' }); }
});

// ─── Inventory Adjustment: PUT /:id (reverse old inventory+GL, re-apply) ─────
router.put('/adjustments/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    const adj = await db('inventory_adjustments').where({ id: req.params.id, company_id: companyId }).first();
    if (!adj) { res.status(404).json({ success: false, error: 'Adjustment not found' }); return; }
    if (!d.lines || d.lines.length === 0) { res.status(400).json({ success: false, error: 'At least one adjustment line required' }); return; }

    // 1) Reverse old inventory effect
    const oldLines = await db('inventory_adjustment_lines').where({ adjustment_id: adj.id });
    for (const line of oldLines as any[]) {
      const rate = await InventoryEngine.baseRate(db, line.uom_id || null);
      const baseAdjQty = Number(line.adjust_qty) * rate;
      if (line.location_id) {
        await db('inventory_balances')
          .where({ company_id: companyId, item_id: line.item_id, location_id: line.location_id })
          .update({ qty_on_hand: db.raw('GREATEST(0, qty_on_hand - ?)', [baseAdjQty]) });
      }
    }
    await db('inventory_adjustment_lines').where({ adjustment_id: adj.id }).del();

    // 2) Update header
    await db('inventory_adjustments').where({ id: adj.id }).update({
      adjustment_date: d.adjustmentDate || adj.adjustment_date,
      adjustment_type: d.adjustmentType || adj.adjustment_type,
      account_id: uid(d.accountId),
      memo: d.memo ?? adj.memo,
      updated_at: new Date(),
    });

    // 3) Re-insert lines + re-apply inventory
    for (const line of d.lines) {
      await db('inventory_adjustment_lines').insert({
        adjustment_id: adj.id, item_id: line.itemId, location_id: uid(line.locationId),
        adjust_qty: Number(line.adjustQty), uom_id: line.uomId || null,
        unit_cost: Number(line.unitCost || 0), reason: line.reason || null,
      });
      const rate = await InventoryEngine.baseRate(db, line.uomId || null);
      const baseAdjQty = Number(line.adjustQty) * rate;
      const existing = await db('inventory_balances')
        .where({ company_id: companyId, item_id: line.itemId, location_id: line.locationId }).first();
      if (existing) {
        await db('inventory_balances').where({ id: existing.id }).update({ qty_on_hand: db.raw('qty_on_hand + ?', [baseAdjQty]) });
      } else {
        await db('inventory_balances').insert({
          company_id: companyId, item_id: line.itemId, location_id: uid(line.locationId),
          lot_number: '', serial_number: '', qty_on_hand: Math.max(0, baseAdjQty), qty_committed: 0,
          avg_cost: Number(line.unitCost || 0),
        });
      }
    }

    // 4) Reverse + re-post GL (per-line inventory account from item master)
    await clearJournal('inventory_adjustment', adj.id);
    try {
      await postAdjustmentGL(companyId, adj.id, adj.adjustment_number, d.adjustmentDate || adj.adjustment_date, d.lines, d.accountId, req.user!.id);
    } catch (glErr: any) { console.error('[GL ERROR] Adjustment edit GL:', glErr.message); }

    res.json({ success: true, data: { ...adj, id: adj.id } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to update adjustment' }); }
});

// ─── Transfer Inventory: GET /:id ────────────────────────────────────────────
router.get('/transfers/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const tr = await db('inventory_transfers as it')
      .leftJoin('users as u', 'it.created_by', 'u.id')
      .leftJoin('locations as fl', 'it.from_location_id', 'fl.id')
      .leftJoin('locations as tl', 'it.to_location_id', 'tl.id')
      .where({ 'it.id': req.params.id, 'it.company_id': companyId })
      .select('it.*', 'u.name as created_by_name', 'fl.name as from_location_name', 'tl.name as to_location_name')
      .first();
    if (!tr) { res.status(404).json({ success: false, error: 'Transfer not found' }); return; }
    const lines = await db('inventory_transfer_lines as l')
      .leftJoin('items as i', 'l.item_id', 'i.id')
      .leftJoin('units_of_measure as uom', 'l.uom_id', 'uom.id')
      .where({ 'l.transfer_id': tr.id })
      .select('l.*', 'i.name as item_name', 'i.item_code', 'uom.name as uom_name');
    const journalEntries = await loadJournalEntries('inventory_transfer', tr.id);
    res.json({ success: true, data: { ...tr, lines, journalEntries } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch transfer' }); }
});

// ─── Transfer Inventory: PUT /:id ────────────────────────────────────────────
router.put('/transfers/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    const tr = await db('inventory_transfers').where({ id: req.params.id, company_id: companyId }).first();
    if (!tr) { res.status(404).json({ success: false, error: 'Transfer not found' }); return; }

    // 1) Reverse old movement
    const oldLines = await db('inventory_transfer_lines').where({ transfer_id: tr.id });
    for (const line of oldLines as any[]) {
      const rate = await InventoryEngine.baseRate(db, line.uom_id || null);
      const baseQty = Number(line.qty) * rate;
      const src = await db('inventory_balances').where({ company_id: companyId, item_id: line.item_id, location_id: tr.from_location_id }).first();
      if (src) await db('inventory_balances').where({ id: src.id }).update({ qty_on_hand: db.raw('qty_on_hand + ?', [baseQty]) });
      else await db('inventory_balances').insert({ company_id: companyId, item_id: line.item_id, location_id: tr.from_location_id, lot_number: '', serial_number: '', qty_on_hand: baseQty, qty_committed: 0, avg_cost: Number(line.unit_cost || 0) });
      await db('inventory_balances').where({ company_id: companyId, item_id: line.item_id, location_id: tr.to_location_id })
        .update({ qty_on_hand: db.raw('GREATEST(0, qty_on_hand - ?)', [baseQty]) });
    }
    await db('inventory_transfer_lines').where({ transfer_id: tr.id }).del();

    const fromLoc = d.fromLocationId || tr.from_location_id;
    const toLoc = d.toLocationId || tr.to_location_id;

    // 2) Update header
    await db('inventory_transfers').where({ id: tr.id }).update({
      transfer_date: d.transferDate || tr.transfer_date,
      from_location_id: fromLoc, to_location_id: toLoc,
      reference: d.reference ?? tr.reference, memo: d.memo ?? tr.memo, updated_at: new Date(),
    });

    // 3) Re-insert lines + re-apply movement
    for (const line of d.lines || []) {
      await db('inventory_transfer_lines').insert({
        transfer_id: tr.id, item_id: line.itemId, qty: Number(line.qty), uom_id: line.uomId || null, unit_cost: Number(line.unitCost || 0),
      });
      const rate = await InventoryEngine.baseRate(db, line.uomId || null);
      const baseQty = Number(line.qty) * rate;
      await db('inventory_balances').where({ company_id: companyId, item_id: line.itemId, location_id: fromLoc })
        .update({ qty_on_hand: db.raw('GREATEST(0, qty_on_hand - ?)', [baseQty]) });
      const dest = await db('inventory_balances').where({ company_id: companyId, item_id: line.itemId, location_id: toLoc }).first();
      if (dest) await db('inventory_balances').where({ id: dest.id }).update({ qty_on_hand: db.raw('qty_on_hand + ?', [baseQty]) });
      else await db('inventory_balances').insert({ company_id: companyId, item_id: line.itemId, location_id: toLoc, lot_number: '', serial_number: '', qty_on_hand: baseQty, qty_committed: 0, avg_cost: Number(line.unitCost || 0) });
    }

    // 4) Reverse + re-post GL
    await clearJournal('inventory_transfer', tr.id);
    try {
      const invAcct = await db('accounts').where({ company_id: companyId, code: '1200' }).first();
      if (invAcct) {
        const totalValue = (d.lines || []).reduce((s: number, l: any) => s + (Number(l.qty) * Number(l.unitCost || 0)), 0);
        if (totalValue > 0.01) {
          const jeNum = `JE-TFR-${String(Date.now()).slice(-8)}`;
          const [je] = await db('journal_entries').insert({
            company_id: companyId, journal_number: jeNum, entry_date: d.transferDate || tr.transfer_date,
            memo: `Inventory Transfer ${tr.transfer_number}`, source_type: 'inventory_transfer', source_id: tr.id,
            status: 'posted', created_by: req.user!.id,
          }).returning('id');
          const jeId = je?.id || je;
          await db('journal_entry_lines').insert([
            { journal_id: jeId, line_number: 1, account_id: invAcct.id, debit: totalValue, credit: 0, memo: 'Inventory transfer in' },
            { journal_id: jeId, line_number: 2, account_id: invAcct.id, debit: 0, credit: totalValue, memo: 'Inventory transfer out' },
          ]);
        }
      }
    } catch (glErr: any) { console.error('[GL ERROR] Transfer edit GL:', glErr.message); }

    res.json({ success: true, data: { ...tr, id: tr.id } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to update transfer' }); }
});

// ─── Transfer Order: GET /:id ────────────────────────────────────────────────
router.get('/transfer-orders/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const order = await db('inventory_transfer_orders as ito')
      .leftJoin('users as u', 'ito.created_by', 'u.id')
      .leftJoin('locations as fl', 'ito.from_location_id', 'fl.id')
      .leftJoin('locations as tl', 'ito.to_location_id', 'tl.id')
      .where({ 'ito.id': req.params.id, 'ito.company_id': companyId })
      .select('ito.*', 'u.name as created_by_name', 'fl.name as from_location_name', 'tl.name as to_location_name')
      .first();
    if (!order) { res.status(404).json({ success: false, error: 'Transfer order not found' }); return; }
    const lines = await db('inventory_transfer_order_lines as l')
      .leftJoin('items as i', 'l.item_id', 'i.id')
      .leftJoin('units_of_measure as uom', 'l.uom_id', 'uom.id')
      .where({ 'l.transfer_order_id': order.id })
      .select('l.*', 'i.name as item_name', 'i.item_code', 'uom.name as uom_name');
    res.json({ success: true, data: { ...order, lines } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to fetch transfer order' }); }
});

// ─── Transfer Order: PUT /:id (reverse commit, re-commit) ────────────────────
router.put('/transfer-orders/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    const order = await db('inventory_transfer_orders').where({ id: req.params.id, company_id: companyId }).first();
    if (!order) { res.status(404).json({ success: false, error: 'Transfer order not found' }); return; }
    if (['in_transit', 'received'].includes(order.status)) { res.status(400).json({ success: false, error: 'Cannot edit an order already in transit or received' }); return; }

    // 1) Reverse old commit
    const oldLines = await db('inventory_transfer_order_lines').where({ transfer_order_id: order.id });
    for (const line of oldLines as any[]) {
      if (line.item_id && Number(line.qty_requested) > 0) {
        try {
          const baseQty = await InventoryEngine.toBaseQty(db, line.uom_id || null, Number(line.qty_requested));
          await InventoryEngine.releaseCommitted(db, companyId, line.item_id, baseQty, order.from_location_id);
        } catch (invErr: any) { console.error('[INV WARNING] TO release skipped:', invErr.message); }
      }
    }
    await db('inventory_transfer_order_lines').where({ transfer_order_id: order.id }).del();

    const fromLoc = d.fromLocationId || order.from_location_id;
    const toLoc = d.toLocationId || order.to_location_id;

    // 2) Update header
    await db('inventory_transfer_orders').where({ id: order.id }).update({
      order_date: d.orderDate || order.order_date,
      expected_date: d.expectedDate || null,
      from_location_id: fromLoc, to_location_id: toLoc,
      priority: d.priority || order.priority, memo: d.memo ?? order.memo, updated_at: new Date(),
    });

    // 3) Re-insert lines + re-commit
    for (const line of d.lines || []) {
      await db('inventory_transfer_order_lines').insert({
        transfer_order_id: order.id, item_id: line.itemId, qty_requested: Number(line.qty),
        uom_id: line.uomId || null, requested_date: line.requestedDate || null,
      });
      if (line.itemId && Number(line.qty) > 0) {
        try {
          const baseQty = await InventoryEngine.toBaseQty(db, line.uomId || null, Number(line.qty));
          await InventoryEngine.commitInventory(db, companyId, line.itemId, baseQty, fromLoc);
        } catch (invErr: any) { console.error('[INV WARNING] TO commit skipped:', invErr.message); }
      }
    }

    res.json({ success: true, data: { ...order, id: order.id } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to update transfer order' }); }
});

export default router;

// ─── Approve / Reject inventory transactions ──────────────────────────────────
// Inventory Adjustment: approve flips GL non_posting→posted + runs deferred
// inventory balance movements.
router.post('/adjustments/:id/approve', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const adj = await db('inventory_adjustments').where({ id: req.params.id, company_id: companyId }).first();
    if (!adj) { res.status(404).json({ success: false, error: 'Adjustment not found' }); return; }
    if (adj.approval_status !== 'pending_approval') { res.status(400).json({ success: false, error: 'Not pending approval' }); return; }
    const approver = await resolveApprover(companyId, 'inventory_adjustments', req.user!.id);
    await db.transaction(async (trx) => {
      // 1) Post the deferred GL.
      await AccountingEngine.postDeferredJournal('inventory_adjustment', adj.id, req.user!.id, trx);
      // 2) Run the deferred inventory balance movements.
      const lines = await trx('inventory_adjustment_lines').where({ adjustment_id: adj.id });
      for (const line of lines) {
        const rate = await InventoryEngine.baseRate(trx, line.uom_id || null);
        const baseAdjQty = Number(line.adjust_qty) * rate;
        const existing = await trx('inventory_balances')
          .where({ company_id: companyId, item_id: line.item_id, location_id: line.location_id }).first();
        if (existing) {
          await trx('inventory_balances').where({ id: existing.id })
            .update({ qty_on_hand: trx.raw('qty_on_hand + ?', [baseAdjQty]) });
        } else {
          await trx('inventory_balances').insert({
            company_id: companyId, item_id: line.item_id, location_id: line.location_id,
            lot_number: '', serial_number: '', qty_on_hand: Math.max(0, baseAdjQty),
            qty_committed: 0, avg_cost: Number(line.unit_cost || 0),
          });
        }
      }
      // 3) Stamp approval.
      await trx('inventory_adjustments').where({ id: adj.id }).update({
        status: 'posted', approval_status: 'approved', approved_by: approver, approved_at: new Date(),
      });
    });
    const updated = await db('inventory_adjustments').where({ id: adj.id }).first();
    res.json({ success: true, data: updated, message: 'Adjustment approved' });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to approve adjustment' }); }
});

router.post('/adjustments/:id/reject', async (req: Request, res: Response): Promise<void> => {
  try {
    const adj = await db('inventory_adjustments').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!adj || adj.approval_status !== 'pending_approval') { res.status(400).json({ success: false, error: 'Not pending approval' }); return; }
    const [updated] = await db('inventory_adjustments').where({ id: adj.id })
      .update({ approval_status: 'draft', memo: `${adj.memo || ''}\n[REJECTED] ${req.body?.reason || 'Rejected'}`.trim() }).returning('*');
    res.json({ success: true, data: updated, message: 'Adjustment rejected' });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to reject' }); }
});

// Inventory Transfer approve: flip GL + run balance movements.
router.post('/transfers/:id/approve', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const tfr = await db('inventory_transfers').where({ id: req.params.id, company_id: companyId }).first();
    if (!tfr) { res.status(404).json({ success: false, error: 'Transfer not found' }); return; }
    if (tfr.approval_status !== 'pending_approval') { res.status(400).json({ success: false, error: 'Not pending approval' }); return; }
    const approver = await resolveApprover(companyId, 'inventory_transfers', req.user!.id);
    await db.transaction(async (trx) => {
      await AccountingEngine.postDeferredJournal('inventory_transfer', tfr.id, req.user!.id, trx);
      const lines = await trx('inventory_transfer_lines').where({ transfer_id: tfr.id });
      for (const line of lines) {
        const rate = await InventoryEngine.baseRate(trx, line.uom_id || null);
        const baseQty = Number(line.qty) * rate;
        await trx('inventory_balances').where({ company_id: companyId, item_id: line.item_id, location_id: tfr.from_location_id })
          .update({ qty_on_hand: trx.raw('GREATEST(0, qty_on_hand - ?)', [baseQty]) });
        const dest = await trx('inventory_balances').where({ company_id: companyId, item_id: line.item_id, location_id: tfr.to_location_id }).first();
        if (dest) { await trx('inventory_balances').where({ id: dest.id }).update({ qty_on_hand: trx.raw('qty_on_hand + ?', [baseQty]) }); }
        else { await trx('inventory_balances').insert({ company_id: companyId, item_id: line.item_id, location_id: tfr.to_location_id, lot_number: '', serial_number: '', qty_on_hand: baseQty, qty_committed: 0, avg_cost: Number(line.unit_cost || 0) }); }
      }
      await trx('inventory_transfers').where({ id: tfr.id }).update({ status: 'posted', approval_status: 'approved', approved_by: approver, approved_at: new Date() });
    });
    const updated = await db('inventory_transfers').where({ id: tfr.id }).first();
    res.json({ success: true, data: updated, message: 'Transfer approved' });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to approve transfer' }); }
});

router.post('/transfers/:id/reject', async (req: Request, res: Response): Promise<void> => {
  try {
    const tfr = await db('inventory_transfers').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!tfr || tfr.approval_status !== 'pending_approval') { res.status(400).json({ success: false, error: 'Not pending approval' }); return; }
    const [updated] = await db('inventory_transfers').where({ id: tfr.id })
      .update({ approval_status: 'draft', memo: `${tfr.memo || ''}\n[REJECTED] ${req.body?.reason || 'Rejected'}`.trim() }).returning('*');
    res.json({ success: true, data: updated, message: 'Transfer rejected' });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to reject' }); }
});


// ─── Submit for Approval (draft → pending_approval) ──────────────────────────
function invSubmit(table: string, route: string, rtr: typeof router) {
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

invSubmit('inventory_adjustments', 'adjustments', router);
invSubmit('inventory_transfers', 'transfers', router);
