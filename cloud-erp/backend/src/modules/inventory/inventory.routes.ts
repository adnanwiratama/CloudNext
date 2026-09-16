import { Router, Request, Response } from 'express';
import db from '../../config/database';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

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

    const [adj] = await db('inventory_adjustments').insert({
      company_id: companyId,
      adjustment_number: adjNumber,
      adjustment_date: d.adjustmentDate || new Date(),
      adjustment_type: d.adjustmentType || 'quantity',
      reason: d.reason || null,
      account_id: d.accountId || null,
      memo: d.memo || null,
      status: 'posted',
      created_by: req.user!.id,
    }).returning('*');

    // Insert lines and update inventory balances
    for (const line of d.lines) {
      await db('inventory_adjustment_lines').insert({
        adjustment_id: adj.id,
        item_id: line.itemId,
        location_id: line.locationId,
        adjust_qty: Number(line.adjustQty),
        unit_cost: Number(line.unitCost || 0),
        reason: line.reason || null,
      });

      // Update inventory balance
      const existing = await db('inventory_balances')
        .where({ company_id: companyId, item_id: line.itemId, location_id: line.locationId })
        .first();

      if (existing) {
        await db('inventory_balances')
          .where({ id: existing.id })
          .update({ qty_on_hand: db.raw('qty_on_hand + ?', [Number(line.adjustQty)]) });
      } else {
        await db('inventory_balances').insert({
          company_id: companyId,
          item_id: line.itemId,
          location_id: line.locationId,
          qty_on_hand: Math.max(0, Number(line.adjustQty)),
          qty_available: Math.max(0, Number(line.adjustQty)),
          unit_cost: Number(line.unitCost || 0),
        });
      }
    }

    // ── GL: Conditional based on qty adjustment direction ──────────────────────
    try {
      const invAcct = await db('accounts').where({ company_id: companyId, code: '1200' }).first(); // Inventory
      let adjustAcct = d.accountId ? await db('accounts').where({ id: d.accountId }).first() : null;
      
      // Default to inventory adjustment account if not specified
      if (!adjustAcct) {
        adjustAcct = await db('accounts').where({ company_id: companyId, code: '5200' }).first(); // Manufacturing Variance
      }
      
      if (invAcct && adjustAcct) {
        const totalValue = d.lines.reduce((sum: number, line: any) => 
          sum + (Number(line.adjustQty) * Number(line.unitCost || 0)), 0);
        
        if (Math.abs(totalValue) > 0.01) {
          const jeNum = `JE-ADJ-${String(Date.now()).slice(-8)}`;
          const [je] = await db('journal_entries').insert({
            company_id: companyId, journal_number: jeNum,
            entry_date: d.adjustmentDate || new Date(),
            memo: `Inventory Adjustment ${adjNumber}`,
            source_type: 'inventory_adjustment', source_id: adj.id || adj,
            status: 'posted', created_by: req.user!.id,
          }).returning('id');
          const jeId = je?.id || je;
          
          if (totalValue > 0) {
            // Increase inventory: Dr. Inventory / Cr. Adjustment Account
            await db('journal_entry_lines').insert([
              { journal_id: jeId, line_number: 1, account_id: invAcct.id,    debit: totalValue, credit: 0,          memo: `Inventory increase` },
              { journal_id: jeId, line_number: 2, account_id: adjustAcct.id, debit: 0,          credit: totalValue, memo: `Adjustment expense` },
            ]);
          } else {
            // Decrease inventory: Dr. Adjustment Account / Cr. Inventory
            await db('journal_entry_lines').insert([
              { journal_id: jeId, line_number: 1, account_id: adjustAcct.id, debit: Math.abs(totalValue), credit: 0,                    memo: `Adjustment expense` },
              { journal_id: jeId, line_number: 2, account_id: invAcct.id,    debit: 0,                    credit: Math.abs(totalValue), memo: `Inventory decrease` },
            ]);
          }
        }
      }
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

    const [transfer] = await db('inventory_transfers').insert({
      company_id: companyId,
      transfer_number: tfrNumber,
      transfer_date: d.transferDate || new Date(),
      from_location_id: d.fromLocationId,
      to_location_id: d.toLocationId,
      reference: d.reference || null,
      memo: d.memo || null,
      status: 'posted',
      created_by: req.user!.id,
    }).returning('*');

    // Insert lines and update balances
    for (const line of d.lines || []) {
      await db('inventory_transfer_lines').insert({
        transfer_id: transfer.id,
        item_id: line.itemId,
        qty: Number(line.qty),
        unit_cost: Number(line.unitCost || 0),
      });

      // Deduct from source
      await db('inventory_balances')
        .where({ company_id: companyId, item_id: line.itemId, location_id: d.fromLocationId })
        .update({ qty_on_hand: db.raw('GREATEST(0, qty_on_hand - ?)', [Number(line.qty)]) });

      // Add to destination
      const destBalance = await db('inventory_balances')
        .where({ company_id: companyId, item_id: line.itemId, location_id: d.toLocationId }).first();
      if (destBalance) {
        await db('inventory_balances')
          .where({ id: destBalance.id })
          .update({ qty_on_hand: db.raw('qty_on_hand + ?', [Number(line.qty)]) });
      } else {
        await db('inventory_balances').insert({
          company_id: companyId, item_id: line.itemId, location_id: d.toLocationId,
          qty_on_hand: Number(line.qty), qty_available: Number(line.qty), unit_cost: Number(line.unitCost || 0),
        });
      }
    }

    // ── GL: Dr. Inventory (To Location) / Cr. Inventory (From Location) ───────
    try {
      const invAcct = await db('accounts').where({ company_id: companyId, code: '1200' }).first(); // Inventory
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
            status: 'posted', created_by: req.user!.id,
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
        requested_date: line.requestedDate || null,
      });
    }

    res.status(201).json({ success: true, data: { ...order, transfer_order_number: toNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to create transfer order' }); }
});

export default router;
