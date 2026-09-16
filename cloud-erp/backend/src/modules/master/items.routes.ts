import { Router, Request, Response } from 'express';
import db from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { getPaginationParams, buildPaginatedResult } from '../../utils/pagination';
import { createAuditLog } from '../../utils/audit';
import { InventoryEngine } from '../../engines/inventory/inventoryEngine';

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, sortBy, sortDir, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;

    let query = db('items as i')
      .leftJoin('item_categories as ic', 'i.category_id', 'ic.id')
      .leftJoin('units_of_measure as uom', 'i.base_uom_id', 'uom.id')
      .leftJoin('vendors as v', 'i.preferred_vendor_id', 'v.id')
      .where({ 'i.company_id': companyId, 'i.is_deleted': false })
      .select('i.*', 'ic.name as category_name', 'uom.code as uom_code', 'uom.name as uom_name', 'v.name as preferred_vendor_name');

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
      .leftJoin('accounts as ia', 'i.income_account_id', 'ia.id')
      .leftJoin('accounts as ca', 'i.cogs_account_id', 'ca.id')
      .leftJoin('accounts as inva', 'i.inventory_account_id', 'inva.id')
      .leftJoin('tax_codes as tc', 'i.tax_code_id', 'tc.id')
      .leftJoin('vendors as v', 'i.preferred_vendor_id', 'v.id')
      .where({ 'i.id': req.params.id, 'i.company_id': req.user!.companyId, 'i.is_deleted': false })
      .select(
        'i.*', 'ic.name as category_name', 'uom.code as uom_code', 'uom.name as uom_name',
        'puom.code as purchase_uom_code', 'suom.code as sales_uom_code',
        'ia.code as income_account_code', 'ia.name as income_account_name',
        'ca.code as cogs_account_code', 'ca.name as cogs_account_name',
        'inva.code as inventory_account_code', 'inva.name as inventory_account_name',
        'tc.code as tax_code', 'tc.rate as tax_rate', 'v.name as preferred_vendor_name'
      )
      .first();

    if (!item) { res.status(404).json({ success: false, error: 'Item not found' }); return; }

    // Get inventory position
    const inventory = await InventoryEngine.getInventoryPosition(req.user!.companyId, item.id);

    // Get inventory by location
    const locationInventory = await db('inventory_balances as ib')
      .leftJoin('locations as l', 'ib.location_id', 'l.id')
      .leftJoin('warehouses as w', 'ib.warehouse_id', 'w.id')
      .where({ 'ib.company_id': req.user!.companyId, 'ib.item_id': item.id })
      .where('ib.qty_on_hand', '>', 0)
      .select('ib.*', 'l.name as location_name', 'w.name as warehouse_name');

    res.json({ success: true, data: { ...item, inventory, locationInventory } });
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
      base_uom_id: d.baseUomId || null, purchase_uom_id: d.purchaseUomId || null,
      sales_uom_id: d.salesUomId || null, stock_uom_id: d.stockUomId || null,
      standard_cost: d.standardCost || 0, average_cost: d.averageCost || 0,
      last_purchase_price: d.lastPurchasePrice || 0, sales_price: d.salesPrice || 0,
      tax_code_id: d.taxCodeId || null, income_account_id: d.incomeAccountId || null,
      cogs_account_id: d.cogsAccountId || null, inventory_account_id: d.inventoryAccountId || null,
      asset_account_id: d.assetAccountId || null, expense_account_id: d.expenseAccountId || null,
      preferred_vendor_id: d.preferredVendorId || null,
      reorder_point: d.reorderPoint || 0, safety_stock: d.safetyStock || 0, lead_time_days: d.leadTimeDays || 0,
      is_lot_tracked: d.isLotTracked || false, is_serial_tracked: d.isSerialTracked || false,
      is_bin_tracked: d.isBinTracked || false, is_expiry_tracked: d.isExpiryTracked || false,
      valuation_method: d.valuationMethod || 'average',
      is_purchasable: d.isPurchasable !== false, is_sellable: d.isSellable !== false, is_stockable: d.isStockable !== false,
      is_active: d.isActive !== false, created_by: req.user!.id,
    }).returning('*');

    await createAuditLog({ companyId, userId: req.user!.id, action: 'create', entityType: 'item', entityId: item.id, entityNumber: item.item_code, newValues: item, ipAddress: req.ip });
    res.status(201).json({ success: true, data: item });
  } catch (e: any) {
    if (e.code === '23505') res.status(409).json({ success: false, error: `An item with code "${req.body.itemCode}" already exists.` });
    else res.status(500).json({ success: false, error: 'Failed to create item' });
  }
});

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = await db('items').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!existing) { res.status(404).json({ success: false, error: 'Item not found' }); return; }
    const d = req.body;
    const [updated] = await db('items').where({ id: req.params.id }).update({
      name: d.name ?? existing.name, description: d.description ?? existing.description,
      sku: d.sku ?? existing.sku, brand: d.brand ?? existing.brand,
      standard_cost: d.standardCost ?? existing.standard_cost,
      sales_price: d.salesPrice ?? existing.sales_price,
      reorder_point: d.reorderPoint ?? existing.reorder_point,
      safety_stock: d.safetyStock ?? existing.safety_stock,
      lead_time_days: d.leadTimeDays ?? existing.lead_time_days,
      income_account_id: d.incomeAccountId ?? existing.income_account_id,
      cogs_account_id: d.cogsAccountId ?? existing.cogs_account_id,
      inventory_account_id: d.inventoryAccountId ?? existing.inventory_account_id,
      preferred_vendor_id: d.preferredVendorId ?? existing.preferred_vendor_id,
      tax_code_id: d.taxCodeId ?? existing.tax_code_id,
      is_active: d.isActive ?? existing.is_active,
      updated_by: req.user!.id, updated_at: new Date(),
    }).returning('*');
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

export default router;
