import { Router, Request, Response } from 'express';
import db from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { enforcePermissions } from '../../middleware/permissions';
import { getPaginationParams, buildPaginatedResult } from '../../utils/pagination';
import { createAuditLog } from '../../utils/audit';
import { InventoryEngine } from '../../engines/inventory/inventoryEngine';

const router = Router();
router.use(authenticate);
router.use(enforcePermissions);

// Replace all price levels for an item. Accepts [{ priceLevel, price, currency }]
async function savePriceLevels(itemId: string, levels: any): Promise<void> {
  if (!Array.isArray(levels)) return;
  await db('item_prices').where({ item_id: itemId }).del();
  const rows = levels
    .filter((l: any) => l && l.priceLevel && (l.price !== '' && l.price != null))
    .map((l: any) => ({
      item_id: itemId,
      price_level: l.priceLevel,
      currency: l.currency || 'IDR',
      price: Number(l.price) || 0,
    }));
  if (rows.length > 0) await db('item_prices').insert(rows);
}

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, sortBy, sortDir, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;

    const stockSub = db('inventory_balances')
      .select('item_id')
      .sum({ qty_on_hand: 'qty_on_hand' })
      .sum({ qty_committed: 'qty_committed' })
      .where({ company_id: companyId })
      .groupBy('item_id')
      .as('stock');

    let query = db('items as i')
      .leftJoin('item_categories as ic', 'i.category_id', 'ic.id')
      .leftJoin('units_of_measure as uom', 'i.base_uom_id', 'uom.id')
      .leftJoin('vendors as v', 'i.preferred_vendor_id', 'v.id')
      .leftJoin(stockSub, 'stock.item_id', 'i.id')
      .where({ 'i.company_id': companyId, 'i.is_deleted': false })
      .select('i.*', 'ic.name as category_name', 'uom.code as uom_code', 'uom.name as uom_name', 'v.name as preferred_vendor_name',
        db.raw('COALESCE(stock.qty_on_hand, 0) as qty_on_hand'),
        db.raw('COALESCE(stock.qty_on_hand, 0) - COALESCE(stock.qty_committed, 0) as qty_available'));

    if (search) {
      query = query.where((q: any) => {
        q.whereILike('i.item_code', `%${search}%`)
          .orWhereILike('i.name', `%${search}%`)
          .orWhereILike('i.sku', `%${search}%`)
          .orWhereILike('i.description', `%${search}%`);
      });
    }
    if (req.query.type) query = query.where({ 'i.type': req.query.type });
    if (req.query.categoryId) query = query.where({ 'i.category_id': req.query.categoryId });
    if (req.query.isActive !== undefined) query = query.where({ 'i.is_active': req.query.isActive === 'true' });

    const total = parseInt((await query.clone().clearSelect().count('* as count').first() as any)?.count || '0');
    const data = await query.orderBy(sortBy ? `i.${sortBy}` : 'i.item_code', sortDir).limit(limit).offset((page - 1) * limit);

    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch items' }); }
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const item = await db('items as i')
      .leftJoin('item_categories as ic', 'i.category_id', 'ic.id')
      .leftJoin('units_of_measure as uom', 'i.base_uom_id', 'uom.id')
      .leftJoin('units_of_measure as puom', 'i.purchase_uom_id', 'puom.id')
      .leftJoin('units_of_measure as suom', 'i.sales_uom_id', 'suom.id')
      .leftJoin('units_of_measure as stuom', 'i.stock_uom_id', 'stuom.id')
      .leftJoin('uom_types as ut', 'i.uom_type_id', 'ut.id')
      .leftJoin('accounts as ia', 'i.income_account_id', 'ia.id')
      .leftJoin('accounts as ca', 'i.cogs_account_id', 'ca.id')
      .leftJoin('accounts as inva', 'i.inventory_account_id', 'inva.id')
      .leftJoin('tax_codes as tc', 'i.tax_code_id', 'tc.id')
      .leftJoin('vendors as v', 'i.preferred_vendor_id', 'v.id')
      .where({ 'i.id': req.params.id, 'i.company_id': req.user!.companyId, 'i.is_deleted': false })
      .select(
        'i.*', 'ic.name as category_name', 'uom.code as uom_code', 'uom.name as uom_name',
        'puom.code as purchase_uom_code', 'puom.name as purchase_uom_name',
        'suom.code as sales_uom_code', 'suom.name as sales_uom_name',
        'stuom.code as stock_uom_code', 'stuom.name as stock_uom_name',
        'stuom.conversion_rate_to_base as stock_uom_rate',
        'ut.name as uom_type_name',
        'ia.code as income_account_code', 'ia.name as income_account_name',
        'ca.code as cogs_account_code', 'ca.name as cogs_account_name',
        'inva.code as inventory_account_code', 'inva.name as inventory_account_name',
        'tc.code as tax_code', 'tc.rate as tax_rate', 'v.name as preferred_vendor_name'
      )
      .first();

    if (!item) { res.status(404).json({ success: false, error: 'Item not found' }); return; }

    // Get inventory position
    const inventory = await InventoryEngine.getInventoryPosition(req.user!.companyId, item.id);

    // Get inventory by location (all balances, not just >0, so Purchasing tab shows every location).
    // total_value = qty_on_hand (base) x avg_cost (per base unit). The per-location average cost is
    // therefore total_value / qty — expressed per base unit here; the UI scales it to the stock unit.
    const locationInventory = await db('inventory_balances as ib')
      .leftJoin('locations as l', 'ib.location_id', 'l.id')
      .leftJoin('warehouses as w', 'ib.warehouse_id', 'w.id')
      .where({ 'ib.company_id': req.user!.companyId, 'ib.item_id': item.id })
      .select('ib.*', 'l.name as location_name', 'w.name as warehouse_name',
        db.raw('(COALESCE(ib.qty_on_hand,0) * COALESCE(ib.avg_cost,0)) as total_value'));

    // Sales price levels
    const priceLevels = await db('item_prices')
      .where({ item_id: item.id })
      .orderBy('created_at', 'asc');

    // Manufacturing: BOMs where this item is the finished good, with components
    const boms = await db('boms as b')
      .leftJoin('units_of_measure as uom', 'b.uom_id', 'uom.id')
      .where({ 'b.finished_good_id': item.id, 'b.company_id': req.user!.companyId, 'b.is_deleted': false })
      .select('b.*', 'uom.code as uom_code');
    for (const bom of boms) {
      bom.components = await db('bom_components as bc')
        .join('items as ci', 'bc.item_id', 'ci.id')
        .leftJoin('units_of_measure as cuom', 'bc.uom_id', 'cuom.id')
        .where({ 'bc.bom_id': bom.id }).orderBy('bc.sequence')
        .select('bc.*', 'ci.item_code', 'ci.name as item_name', 'ci.standard_cost', 'ci.average_cost', 'cuom.code as uom_code');
    }

    res.json({ success: true, data: { ...item, inventory, locationInventory, priceLevels, boms } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch item' }); }
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    if (!d.itemCode || !d.name || !d.type) {
      res.status(400).json({ success: false, error: 'Item code, name and type are required' });
      return;
    }

    const [item] = await db('items').insert({
      company_id: companyId,
      item_code: d.itemCode, sku: d.sku, name: d.name, description: d.description,
      type: d.type, category_id: d.categoryId || null, brand: d.brand, manufacturer: d.manufacturer,
      uom_type_id: d.uomTypeId || null,
      base_uom_id: d.baseUomId || null, purchase_uom_id: d.purchaseUomId || null,
      sales_uom_id: d.salesUomId || null, stock_uom_id: d.stockUomId || null,
      standard_cost: d.standardCost || 0, average_cost: d.averageCost || 0,
      last_purchase_price: d.purchasePrice ?? d.lastPurchasePrice ?? 0,
      sales_price: d.salesPrice ?? d.salePrice ?? 0,
      tax_code_id: d.taxCodeId || null, income_account_id: d.incomeAccountId || null,
      cogs_account_id: d.cogsAccountId || null, inventory_account_id: d.inventoryAccountId || null,
      asset_account_id: d.assetAccountId || null, expense_account_id: d.expenseAccountId || null,
      preferred_vendor_id: d.preferredVendorId || null,
      reorder_point: d.reorderPoint || 0, safety_stock: d.safetyStock || 0, lead_time_days: d.leadTimeDays || d.leadTime || 0,
      is_lot_tracked: d.isLotTracked || false, is_serial_tracked: d.isSerialTracked || false,
      is_bin_tracked: d.isBinTracked || false, is_expiry_tracked: d.isExpiryTracked || false,
      valuation_method: d.valuationMethod || 'average',
      is_purchasable: d.isPurchasable !== false, is_sellable: d.isSellable !== false, is_stockable: d.isStockable !== false,
      is_active: d.isActive !== false, created_by: req.user!.id,
    }).returning('*');

    await savePriceLevels(item.id, d.priceLevels);

    await createAuditLog({ companyId, userId: req.user!.id, action: 'create', entityType: 'item', entityId: item.id, entityNumber: item.item_code, newValues: item, ipAddress: req.ip });
    res.status(201).json({ success: true, data: item });
  } catch (e: any) {
    console.error("[ERP ERROR]", e.message, e.stack);
    if (e.code === '23505') res.status(409).json({ success: false, error: `An item with code "${req.body.itemCode}" already exists.` });
    else res.status(500).json({ success: false, error: 'Failed to create item' });
  }
});

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = await db('items').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!existing) { res.status(404).json({ success: false, error: 'Item not found' }); return; }
    const d = req.body;
    // For nullable FK/uuid fields: undefined => keep existing; '' => clear to null; value => set value
    const fk = (val: any, prev: any) => (val === undefined ? prev : (val === '' || val === null ? null : val));
    const [updated] = await db('items').where({ id: req.params.id }).update({
      name: d.name ?? existing.name, description: d.description ?? existing.description,
      sku: d.sku ?? existing.sku, brand: d.brand ?? existing.brand,
      type: d.type ?? existing.type,
      uom_type_id: fk(d.uomTypeId, existing.uom_type_id),
      base_uom_id: fk(d.baseUomId, existing.base_uom_id),
      purchase_uom_id: fk(d.purchaseUomId, existing.purchase_uom_id),
      sales_uom_id: fk(d.salesUomId, existing.sales_uom_id),
      stock_uom_id: fk(d.stockUomId, existing.stock_uom_id),
      standard_cost: d.standardCost ?? existing.standard_cost,
      last_purchase_price: d.purchasePrice ?? d.lastPurchasePrice ?? existing.last_purchase_price,
      sales_price: d.salesPrice ?? d.salePrice ?? existing.sales_price,
      reorder_point: d.reorderPoint ?? existing.reorder_point,
      safety_stock: d.safetyStock ?? existing.safety_stock,
      lead_time_days: d.leadTimeDays ?? d.leadTime ?? existing.lead_time_days,
      income_account_id: fk(d.incomeAccountId, existing.income_account_id),
      cogs_account_id: fk(d.cogsAccountId, existing.cogs_account_id),
      inventory_account_id: fk(d.inventoryAccountId, existing.inventory_account_id),
      asset_account_id: fk(d.assetAccountId, existing.asset_account_id),
      preferred_vendor_id: fk(d.preferredVendorId, existing.preferred_vendor_id),
      tax_code_id: fk(d.taxCodeId, existing.tax_code_id),
      is_active: d.isActive ?? existing.is_active,
      updated_by: req.user!.id, updated_at: new Date(),
    }).returning('*');

    if (d.priceLevels !== undefined) await savePriceLevels(req.params.id, d.priceLevels);

    res.json({ success: true, data: updated });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to update item' }); }
});

// GET /api/items/:id/inventory
router.get('/:id/inventory', async (req: Request, res: Response): Promise<void> => {
  try {
    const position = await InventoryEngine.getInventoryPosition(req.user!.companyId, req.params.id);
    const byLocation = await db('inventory_balances as ib')
      .leftJoin('locations as l', 'ib.location_id', 'l.id')
      .leftJoin('warehouses as w', 'ib.warehouse_id', 'w.id')
      .leftJoin('bins as b', 'ib.bin_id', 'b.id')
      .where({ 'ib.company_id': req.user!.companyId, 'ib.item_id': req.params.id })
      .select('ib.*', 'l.name as location_name', 'w.name as warehouse_name', 'b.code as bin_code');
    res.json({ success: true, data: { position, byLocation } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch inventory' }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Related Records: every transaction that references this item (via its line
// tables). Each query is guarded by hasTable + try/catch so schema drift on any
// one module never breaks the whole response.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/related', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const itemId = req.params.id;
    const results: any[] = [];

    // Each source: { type label, line table, line fk to parent, header table + alias,
    //   header cols for number/date/status/amount, route prefix }
    // stock: 'out' = reduces on-hand (show qty negative), 'in' = increases, 'signed' = qty already carries its own sign, 'none' = no stock movement
    const sources: Array<{
      type: string; lineTable: string; lineFk: string; header: string;
      numberCol: string; dateCol: string; statusCol?: string; amountCol?: string;
      qtyCol: string; stock: 'out' | 'in' | 'signed' | 'none'; routePrefix: string;
    }> = [
      { type: 'Sales Order',          lineTable: 'sales_order_lines',          lineFk: 'so_id',            header: 'sales_orders',              numberCol: 'so_number',          dateCol: 'order_date',       statusCol: 'status', amountCol: 'total_amount', qtyCol: 'quantity',      stock: 'none', routePrefix: '/sales/orders' },
      { type: 'Invoice',              lineTable: 'invoice_lines',              lineFk: 'invoice_id',       header: 'invoices',                  numberCol: 'invoice_number',     dateCol: 'invoice_date',     statusCol: 'status', amountCol: 'total_amount', qtyCol: 'quantity',      stock: 'out', routePrefix: '/sales/invoices' },
      { type: 'Item Fulfillment',     lineTable: 'item_fulfillment_lines',     lineFk: 'fulfillment_id',   header: 'item_fulfillments',         numberCol: 'fulfillment_number', dateCol: 'fulfillment_date', statusCol: 'status', qtyCol: 'quantity',      stock: 'out', routePrefix: '/sales/fulfillments' },
      { type: 'Quotation',            lineTable: 'quotation_lines',            lineFk: 'quotation_id',     header: 'quotations',                numberCol: 'quotation_number',   dateCol: 'quotation_date',   statusCol: 'status', amountCol: 'total_amount', qtyCol: 'quantity',      stock: 'none', routePrefix: '/sales/quotations' },
      { type: 'Credit Memo',          lineTable: 'credit_memo_lines',          lineFk: 'credit_memo_id',   header: 'credit_memos',              numberCol: 'memo_number',        dateCol: 'memo_date',        statusCol: 'status', amountCol: 'total_amount', qtyCol: 'qty',           stock: 'none', routePrefix: '/sales/credit-memos' },
      { type: 'Return Authorization', lineTable: 'return_authorization_lines', lineFk: 'ra_id',            header: 'return_authorizations',     numberCol: 'ra_number',          dateCol: 'return_date',      statusCol: 'status', amountCol: 'total_amount', qtyCol: 'qty',           stock: 'in',  routePrefix: '/sales/return-authorizations' },
      { type: 'Purchase Order',       lineTable: 'purchase_order_lines',       lineFk: 'po_id',            header: 'purchase_orders',           numberCol: 'po_number',          dateCol: 'order_date',       statusCol: 'status', amountCol: 'total_amount', qtyCol: 'quantity',      stock: 'none', routePrefix: '/purchasing/orders' },
      { type: 'Vendor Bill',          lineTable: 'vendor_bill_lines',          lineFk: 'bill_id',          header: 'vendor_bills',              numberCol: 'bill_number',        dateCol: 'bill_date',        statusCol: 'status', amountCol: 'total_amount', qtyCol: 'quantity',      stock: 'none', routePrefix: '/purchasing/bills' },
      { type: 'Goods Receipt',        lineTable: 'item_receipt_lines',         lineFk: 'receipt_id',       header: 'item_receipts',             numberCol: 'receipt_number',     dateCol: 'receipt_date',     statusCol: 'status', qtyCol: 'quantity',      stock: 'in',  routePrefix: '/purchasing/receipts' },
      { type: 'Purchase Requisition', lineTable: 'purchase_requisition_lines', lineFk: 'pr_id',            header: 'purchase_requisitions',     numberCol: 'requisition_number', dateCol: 'request_date',     statusCol: 'status', amountCol: 'total_amount', qtyCol: 'quantity',      stock: 'none', routePrefix: '/purchasing/requisitions' },
      { type: 'Vendor Return',        lineTable: 'vendor_return_lines',        lineFk: 'return_id',        header: 'vendor_returns',            numberCol: 'return_number',      dateCol: 'return_date',      statusCol: 'status', amountCol: 'total_amount', qtyCol: 'qty',           stock: 'out', routePrefix: '/purchasing/vendor-returns' },
      { type: 'Vendor Credit',        lineTable: 'vendor_credit_lines',        lineFk: 'credit_id',        header: 'vendor_credits',            numberCol: 'credit_number',      dateCol: 'credit_date',      statusCol: 'status', amountCol: 'total_amount', qtyCol: 'qty',           stock: 'none', routePrefix: '/purchasing/vendor-credits' },
      { type: 'Inventory Adjustment', lineTable: 'inventory_adjustment_lines', lineFk: 'adjustment_id',    header: 'inventory_adjustments',     numberCol: 'adjustment_number',  dateCol: 'adjustment_date',  statusCol: 'status', qtyCol: 'adjust_qty',    stock: 'signed', routePrefix: '/inventory/adjustments' },
      { type: 'Inventory Transfer',   lineTable: 'inventory_transfer_lines',   lineFk: 'transfer_id',      header: 'inventory_transfers',       numberCol: 'transfer_number',    dateCol: 'transfer_date',    statusCol: 'status', qtyCol: 'qty',           stock: 'none', routePrefix: '/inventory/transfers' },
      { type: 'Transfer Order',       lineTable: 'inventory_transfer_order_lines', lineFk: 'transfer_order_id', header: 'inventory_transfer_orders', numberCol: 'transfer_order_number', dateCol: 'order_date',   statusCol: 'status', qtyCol: 'qty_requested', stock: 'none', routePrefix: '/inventory/transfer-orders' },
      { type: 'Assembly Build',       lineTable: 'assembly_build_lines',       lineFk: 'build_id',         header: 'assembly_builds',           numberCol: 'build_number',       dateCol: 'build_date',       statusCol: 'status', amountCol: 'total_cost', qtyCol: 'quantity',      stock: 'out', routePrefix: '/manufacturing/assembly-builds' },
    ];

    for (const s of sources) {
      try {
        if (!(await db.schema.hasTable(s.lineTable)) || !(await db.schema.hasTable(s.header))) continue;
        // Only reference the qty column if it actually exists on this line table.
        const hasQty = await db.schema.hasColumn(s.lineTable, s.qtyCol);
        const sel: any[] = [
          db.raw('h.id as id'),
          db.raw(`h.${s.numberCol} as doc_number`),
          db.raw(`h.${s.dateCol} as doc_date`),
        ];
        if (s.statusCol) sel.push(db.raw(`h.${s.statusCol} as status`));
        if (s.amountCol) sel.push(db.raw(`h.${s.amountCol} as amount`));
        // sum the item's qty on this document (column name differs per table)
        sel.push(hasQty ? db.raw(`SUM(COALESCE(l.${s.qtyCol}, 0)) as item_qty`) : db.raw('0 as item_qty'));
        const rows = await db(`${s.lineTable} as l`)
          .join(`${s.header} as h`, 'l.' + s.lineFk, 'h.id')
          .where('l.item_id', itemId)
          .where('h.company_id', companyId)
          .groupBy('h.id', db.raw(`h.${s.numberCol}`), db.raw(`h.${s.dateCol}`),
            ...(s.statusCol ? [db.raw(`h.${s.statusCol}`)] : []),
            ...(s.amountCol ? [db.raw(`h.${s.amountCol}`)] : []))
          .select(sel);
        for (const r of rows as any[]) {
          let qty = r.item_qty != null ? Number(r.item_qty) : null;
          // Sign the qty by stock direction: 'out' reduces stock → negative; 'in' positive;
          // 'signed' keeps the stored sign (adjustments can be + or −); 'none' = no stock movement.
          if (qty != null) {
            if (s.stock === 'out') qty = -Math.abs(qty);
            else if (s.stock === 'in') qty = Math.abs(qty);
          }
          results.push({
            type: s.type, id: r.id, doc_number: r.doc_number, date: r.doc_date,
            status: r.status ?? null, amount: r.amount != null ? Number(r.amount) : null,
            item_qty: qty, stock: s.stock,
            path: `${s.routePrefix}/${r.id}`,
          });
        }
      } catch (srcErr: any) {
        // A single bad/misaligned table shouldn't break the whole related list.
        console.error(`[RELATED] ${s.type} skipped:`, srcErr.message);
      }
    }

    results.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    res.json({ success: true, data: results });
  } catch (e: any) { console.error('[ERP ERROR]', e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch related records' }); }
});

export default router;
