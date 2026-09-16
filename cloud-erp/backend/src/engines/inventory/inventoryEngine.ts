import db from '../../config/database';
import { generateTransactionNumber } from '../../utils/sequence';
import { AppError } from '../../middleware/errorHandler';

interface InventoryMovement {
  itemId: string;
  locationId?: string;
  warehouseId?: string;
  binId?: string;
  lotNumber?: string;
  serialNumber?: string;
  expiryDate?: string;
  quantity: number;
  direction: 'in' | 'out';
  unitCost?: number;
}

interface CreateInventoryTxnParams {
  companyId: string;
  transactionType: string;
  referenceType?: string;
  referenceId?: string;
  transactionDate: string;
  locationId?: string;
  warehouseId?: string;
  toLocationId?: string;
  toWarehouseId?: string;
  memo?: string;
  lines: InventoryMovement[];
  createdBy: string;
  trx: any;
}

export class InventoryEngine {
  /**
   * Core method: create inventory transaction and update balances.
   * All inventory movements must flow through this method.
   */
  static async createTransaction(params: CreateInventoryTxnParams): Promise<any> {
    const {
      companyId, transactionType, referenceType, referenceId,
      transactionDate, locationId, warehouseId, toLocationId, toWarehouseId,
      memo, lines, createdBy, trx,
    } = params;

    // Validate sufficient stock for outgoing transactions
    for (const line of lines.filter(l => l.direction === 'out')) {
      const balance = await InventoryEngine.getBalance(
        trx, companyId, line.itemId, line.locationId || locationId, line.warehouseId || warehouseId
      );
      const available = balance.qty_on_hand - balance.qty_committed;
      if (available < line.quantity) {
        const item = await trx('items').where({ id: line.itemId }).first();
        throw new AppError(
          `Insufficient stock for item ${item?.item_code || line.itemId}. Available: ${available}, Required: ${line.quantity}`,
          400
        );
      }
    }

    const txnNumber = await generateTransactionNumber(companyId, transactionType, trx);

    const [txn] = await trx('inventory_transactions').insert({
      company_id: companyId,
      transaction_number: txnNumber,
      transaction_type: transactionType,
      reference_type: referenceType,
      reference_id: referenceId,
      transaction_date: transactionDate,
      location_id: locationId,
      warehouse_id: warehouseId,
      to_location_id: toLocationId,
      to_warehouse_id: toWarehouseId,
      status: 'completed',
      memo,
      created_by: createdBy,
    }).returning('*');

    const lineInserts = lines.map(line => ({
      transaction_id: txn.id,
      item_id: line.itemId,
      quantity: line.quantity,
      direction: line.direction,
      uom_id: null,
      bin_id: line.binId || null,
      lot_number: line.lotNumber || null,
      serial_number: line.serialNumber || null,
      expiry_date: line.expiryDate || null,
      unit_cost: line.unitCost || 0,
      total_cost: (line.unitCost || 0) * line.quantity,
    }));

    await trx('inventory_transaction_lines').insert(lineInserts);

    // Update inventory balances
    for (const line of lines) {
      await InventoryEngine.updateBalance(
        trx, companyId,
        line.itemId,
        line.locationId || locationId,
        line.warehouseId || warehouseId,
        line.binId,
        line.lotNumber,
        line.serialNumber,
        line.quantity,
        line.direction,
        line.unitCost
      );

      // For transfers: also update destination
      if (transactionType === 'inventory_transfer' && line.direction === 'out') {
        await InventoryEngine.updateBalance(
          trx, companyId,
          line.itemId,
          toLocationId,
          toWarehouseId,
          undefined,
          line.lotNumber,
          line.serialNumber,
          line.quantity,
          'in',
          line.unitCost
        );
      }
    }

    return txn;
  }

  private static async getBalance(
    trx: any,
    companyId: string,
    itemId: string,
    locationId?: string,
    warehouseId?: string
  ): Promise<{ qty_on_hand: number; qty_committed: number }> {
    const q = trx('inventory_balances').where({ company_id: companyId, item_id: itemId });
    if (locationId) q.where({ location_id: locationId });
    if (warehouseId) q.where({ warehouse_id: warehouseId });

    const rows = await q.select(
      trx.raw('COALESCE(SUM(qty_on_hand), 0) as qty_on_hand'),
      trx.raw('COALESCE(SUM(qty_committed), 0) as qty_committed')
    );
    return rows[0] || { qty_on_hand: 0, qty_committed: 0 };
  }

  private static async updateBalance(
    trx: any,
    companyId: string,
    itemId: string,
    locationId?: string,
    warehouseId?: string,
    binId?: string,
    lotNumber?: string,
    serialNumber?: string,
    quantity: number = 0,
    direction: 'in' | 'out' = 'in',
    unitCost?: number
  ): Promise<void> {
    const existing = await trx('inventory_balances')
      .where({
        company_id: companyId,
        item_id: itemId,
        location_id: locationId || null,
        warehouse_id: warehouseId || null,
        bin_id: binId || null,
        lot_number: lotNumber || '',
        serial_number: serialNumber || '',
      })
      .first();

    const qty = direction === 'in' ? quantity : -quantity;

    if (existing) {
      const newQty = Number(existing.qty_on_hand) + qty;
      // Update average cost on receipt
      let newAvgCost = existing.avg_cost;
      if (direction === 'in' && unitCost && unitCost > 0) {
        const existingValue = Number(existing.qty_on_hand) * Number(existing.avg_cost);
        const newValue = quantity * unitCost;
        const newTotalQty = newQty > 0 ? newQty : quantity;
        newAvgCost = newTotalQty > 0 ? (existingValue + newValue) / newTotalQty : unitCost;
      }

      await trx('inventory_balances')
        .where({ id: existing.id })
        .update({
          qty_on_hand: newQty,
          avg_cost: newAvgCost,
          last_updated: new Date(),
        });
    } else if (direction === 'in') {
      await trx('inventory_balances').insert({
        company_id: companyId,
        item_id: itemId,
        location_id: locationId || null,
        warehouse_id: warehouseId || null,
        bin_id: binId || null,
        lot_number: lotNumber || '',
        serial_number: serialNumber || '',
        qty_on_hand: quantity,
        qty_committed: 0,
        qty_on_order: 0,
        qty_in_transit: 0,
        qty_wip: 0,
        avg_cost: unitCost || 0,
        last_updated: new Date(),
      });
    }
  }

  /**
   * Commit inventory (reserve for sales orders, work orders)
   */
  static async commitInventory(
    trx: any,
    companyId: string,
    itemId: string,
    quantity: number,
    locationId?: string,
    warehouseId?: string
  ): Promise<void> {
    await trx('inventory_balances')
      .where({ company_id: companyId, item_id: itemId, location_id: locationId || null, warehouse_id: warehouseId || null })
      .increment('qty_committed', quantity);
  }

  /**
   * Release committed inventory
   */
  static async releaseCommitted(
    trx: any,
    companyId: string,
    itemId: string,
    quantity: number,
    locationId?: string,
    warehouseId?: string
  ): Promise<void> {
    await trx('inventory_balances')
      .where({ company_id: companyId, item_id: itemId, location_id: locationId || null, warehouse_id: warehouseId || null })
      .decrement('qty_committed', quantity);
  }

  /**
   * Get comprehensive inventory position for an item
   */
  static async getInventoryPosition(companyId: string, itemId: string): Promise<any> {
    const balances = await db('inventory_balances')
      .where({ company_id: companyId, item_id: itemId })
      .select(
        db.raw('COALESCE(SUM(qty_on_hand), 0) as qty_on_hand'),
        db.raw('COALESCE(SUM(qty_committed), 0) as qty_committed'),
        db.raw('COALESCE(SUM(qty_on_order), 0) as qty_on_order'),
        db.raw('COALESCE(SUM(qty_in_transit), 0) as qty_in_transit'),
        db.raw('COALESCE(SUM(qty_wip), 0) as qty_wip'),
        db.raw('AVG(avg_cost) as avg_cost')
      )
      .first();

    return {
      onHand: parseFloat(balances.qty_on_hand || 0),
      committed: parseFloat(balances.qty_committed || 0),
      available: parseFloat(balances.qty_on_hand || 0) - parseFloat(balances.qty_committed || 0),
      onOrder: parseFloat(balances.qty_on_order || 0),
      inTransit: parseFloat(balances.qty_in_transit || 0),
      wip: parseFloat(balances.qty_wip || 0),
      avgCost: parseFloat(balances.avg_cost || 0),
    };
  }

  /**
   * Get inventory position by location (warehouse-agnostic)
   */
  static async getInventoryByLocation(companyId: string, itemId: string, locationId?: string): Promise<any> {
    const query = db('inventory_balances').where({ company_id: companyId, item_id: itemId });
    if (locationId) query.where({ location_id: locationId });

    const balances = await query
      .select(
        db.raw('COALESCE(SUM(qty_on_hand), 0) as qty_on_hand'),
        db.raw('COALESCE(SUM(qty_committed), 0) as qty_committed')
      )
      .first();

    return {
      onHand: parseFloat(balances?.qty_on_hand || 0),
      committed: parseFloat(balances?.qty_committed || 0),
      available: parseFloat(balances?.qty_on_hand || 0) - parseFloat(balances?.qty_committed || 0),
    };
  }
}
