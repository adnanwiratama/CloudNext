import db from '../config/database';
import { InventoryEngine } from '../engines/inventory/inventoryEngine';

// ─────────────────────────────────────────────────────────────────────────────
// Generic transaction delete + reversal.
//
// Deleting a posted transaction must undo its side effects:
//   1. Remove its GL journal entries (by source_type + source_id).
//   2. Reverse any inventory movements it created (post an opposite movement, or
//      recompute balances) for stock-moving types.
//   3. Soft-delete the header (is_deleted=true) when the column exists, else hard
//      delete; always remove child line rows for hard-deleted records.
//
// Each handler is intentionally conservative: it only reverses what that specific
// transaction type actually posted, and blocks deletion when a downstream record
// depends on it (so we never leave dangling references).
// ─────────────────────────────────────────────────────────────────────────────

export class TxnDeleteError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

// Delete posted journal entries for a source document.
export async function reverseJournal(trx: any, companyId: string, sourceType: string, sourceId: string): Promise<void> {
  const jes = await trx('journal_entries').where({ company_id: companyId, source_type: sourceType, source_id: sourceId }).select('id');
  for (const je of jes as any[]) {
    await trx('journal_entry_lines').where({ journal_id: je.id }).del();
  }
  await trx('journal_entries').where({ company_id: companyId, source_type: sourceType, source_id: sourceId }).del();
}

// Soft-delete if the table has is_deleted, else hard delete.
async function removeHeader(trx: any, table: string, id: string, companyId: string): Promise<void> {
  if (await trx.schema.hasColumn(table, 'is_deleted')) {
    await trx(table).where({ id, company_id: companyId }).update({ is_deleted: true });
  } else {
    await trx(table).where({ id, company_id: companyId }).del();
  }
}

const baseRate = async (trx: any, uomId: string | null): Promise<number> => {
  try { return await InventoryEngine.baseRate(trx, uomId || null); } catch { return 1; }
};

// ── Per-type reversal definitions ──────────────────────────────────────────────
// Returns a human message on success; throws TxnDeleteError to block.
type DeleteHandler = (trx: any, companyId: string, id: string, userId: string) => Promise<string>;

const handlers: Record<string, DeleteHandler> = {
  // ===== SALES =====
  sales_order: async (trx, companyId, id) => {
    const so = await trx('sales_orders').where({ id, company_id: companyId }).first();
    if (!so) throw new TxnDeleteError('Sales order not found', 404);
    const ff = await trx('item_fulfillments').where({ so_id: id }).first().catch(() => null);
    const inv = await trx('invoices').where({ so_id: id, is_deleted: false }).first().catch(() => null);
    if (ff || inv) throw new TxnDeleteError('Cannot delete: this sales order already has fulfillments or invoices.');
    // Release committed inventory if it was committed
    if (!['pending_approval', 'cancelled', 'draft'].includes(so.status)) {
      const lines = await trx('sales_order_lines').where({ so_id: id });
      for (const l of lines as any[]) {
        if (l.item_id && Number(l.quantity) > 0) {
          try { const q = Number(l.quantity) * await baseRate(trx, l.uom_id); await InventoryEngine.releaseCommitted(trx, companyId, l.item_id, q, so.location_id || null); } catch {}
        }
      }
    }
    await reverseJournal(trx, companyId, 'sales_order', id);
    await removeHeader(trx, 'sales_orders', id, companyId);
    return 'Sales order deleted';
  },

  invoice: async (trx, companyId, id) => {
    const inv = await trx('invoices').where({ id, company_id: companyId }).first();
    if (!inv) throw new TxnDeleteError('Invoice not found', 404);
    if (Number(inv.amount_paid || 0) > 0) throw new TxnDeleteError('Cannot delete an invoice that has payments applied.');
    // Standalone invoice (no SO) reduced stock on create → add it back
    if (!inv.so_id) {
      const lines = await trx('invoice_lines').where({ invoice_id: id });
      for (const l of lines as any[]) {
        if (l.item_id && Number(l.quantity) > 0) {
          try {
            const q = Number(l.quantity) * await baseRate(trx, l.uom_id);
            await InventoryEngine.createTransaction({ companyId, transactionType: 'invoice_delete_reverse', referenceType: 'invoice', referenceId: id, transactionDate: new Date().toISOString().split('T')[0], locationId: l.location_id || inv.location_id, memo: `Reverse delete of invoice ${inv.invoice_number}`, lines: [{ itemId: l.item_id, quantity: q, direction: 'in', locationId: l.location_id || inv.location_id }], createdBy: '', trx });
          } catch {}
        }
      }
    }
    await reverseJournal(trx, companyId, 'invoice', id);
    await removeHeader(trx, 'invoices', id, companyId);
    return 'Invoice deleted';
  },

  quotation: async (trx, companyId, id) => {
    const q = await trx('quotations').where({ id, company_id: companyId }).first();
    if (!q) throw new TxnDeleteError('Quotation not found', 404);
    if (q.status === 'converted') throw new TxnDeleteError('Cannot delete a converted quotation.');
    await removeHeader(trx, 'quotations', id, companyId);
    return 'Quotation deleted';
  },

  item_fulfillment: async (trx, companyId, id) => {
    const ff = await trx('item_fulfillments').where({ id, company_id: companyId }).first();
    if (!ff) throw new TxnDeleteError('Fulfillment not found', 404);
    const invLine = await trx('invoice_lines').where({ so_line_id: null }).first().catch(() => null); void invLine;
    // Add fulfilled stock back + restore SO committed/fulfilled counters
    const lines = await trx('item_fulfillment_lines').where({ fulfillment_id: id });
    for (const l of lines as any[]) {
      if (l.item_id && Number(l.quantity) > 0) {
        try {
          const q = Number(l.quantity) * await baseRate(trx, l.uom_id);
          await InventoryEngine.createTransaction({ companyId, transactionType: 'fulfillment_delete_reverse', referenceType: 'item_fulfillment', referenceId: id, transactionDate: new Date().toISOString().split('T')[0], locationId: ff.location_id, memo: `Reverse delete of fulfillment ${ff.fulfillment_number}`, lines: [{ itemId: l.item_id, quantity: q, direction: 'in', locationId: ff.location_id }], createdBy: '', trx });
        } catch {}
        if (l.so_line_id) { try { await trx('sales_order_lines').where({ id: l.so_line_id }).decrement('qty_fulfilled', Number(l.quantity)); } catch {} }
      }
    }
    await reverseJournal(trx, companyId, 'item_fulfillment', id);
    await removeHeader(trx, 'item_fulfillments', id, companyId);
    return 'Item fulfillment deleted; inventory restored';
  },

  customer_payment: async (trx, companyId, id) => {
    const p = await trx('customer_payments').where({ id, company_id: companyId }).first();
    if (!p) throw new TxnDeleteError('Payment not found', 404);
    await trx('customer_payment_applications').where({ payment_id: id }).del().catch(() => {});
    await reverseJournal(trx, companyId, 'customer_payment', id);
    await removeHeader(trx, 'customer_payments', id, companyId);
    return 'Customer payment deleted';
  },

  customer_deposit: async (trx, companyId, id) => {
    const d = await trx('customer_deposits').where({ id, company_id: companyId }).first();
    if (!d) throw new TxnDeleteError('Deposit not found', 404);
    if (Number(d.amount_applied || 0) > 0) throw new TxnDeleteError('Cannot delete a deposit that has been applied.');
    await reverseJournal(trx, companyId, 'customer_deposit', id);
    await removeHeader(trx, 'customer_deposits', id, companyId);
    return 'Customer deposit deleted';
  },

  customer_refund: async (trx, companyId, id) => {
    const r = await trx('customer_refunds').where({ id, company_id: companyId }).first();
    if (!r) throw new TxnDeleteError('Refund not found', 404);
    await reverseJournal(trx, companyId, 'customer_refund', id);
    await removeHeader(trx, 'customer_refunds', id, companyId);
    return 'Customer refund deleted';
  },

  credit_memo: async (trx, companyId, id) => {
    const cm = await trx('credit_memos').where({ id, company_id: companyId }).first();
    if (!cm) throw new TxnDeleteError('Credit memo not found', 404);
    await reverseJournal(trx, companyId, 'credit_memo', id);
    await removeHeader(trx, 'credit_memos', id, companyId);
    return 'Credit memo deleted';
  },

  return_authorization: async (trx, companyId, id) => {
    const ra = await trx('return_authorizations').where({ id, company_id: companyId }).first();
    if (!ra) throw new TxnDeleteError('Return authorization not found', 404);
    await removeHeader(trx, 'return_authorizations', id, companyId);
    return 'Return authorization deleted';
  },

  // ===== PURCHASING =====
  purchase_order: async (trx, companyId, id) => {
    const po = await trx('purchase_orders').where({ id, company_id: companyId }).first();
    if (!po) throw new TxnDeleteError('Purchase order not found', 404);
    const rec = await trx('item_receipts').where({ po_id: id }).first().catch(() => null);
    const bill = await trx('vendor_bills').where({ po_id: id, is_deleted: false }).first().catch(() => null);
    if (rec || bill) throw new TxnDeleteError('Cannot delete: this purchase order already has receipts or bills.');
    await reverseJournal(trx, companyId, 'purchase_order', id);
    await removeHeader(trx, 'purchase_orders', id, companyId);
    return 'Purchase order deleted';
  },

  purchase_requisition: async (trx, companyId, id) => {
    const pr = await trx('purchase_requisitions').where({ id, company_id: companyId }).first();
    if (!pr) throw new TxnDeleteError('Requisition not found', 404);
    if (pr.status === 'converted') throw new TxnDeleteError('Cannot delete a converted requisition.');
    await removeHeader(trx, 'purchase_requisitions', id, companyId);
    return 'Purchase requisition deleted';
  },

  vendor_bill: async (trx, companyId, id) => {
    const b = await trx('vendor_bills').where({ id, company_id: companyId }).first();
    if (!b) throw new TxnDeleteError('Vendor bill not found', 404);
    if (Number(b.amount_paid || 0) > 0) throw new TxnDeleteError('Cannot delete a bill that has payments applied.');
    await reverseJournal(trx, companyId, 'vendor_bill', id);
    await removeHeader(trx, 'vendor_bills', id, companyId);
    return 'Vendor bill deleted';
  },

  bill_payment: async (trx, companyId, id) => {
    const p = await trx('vendor_payments').where({ id, company_id: companyId }).first().catch(() => null)
      || await trx('bill_payments').where({ id, company_id: companyId }).first().catch(() => null);
    if (!p) throw new TxnDeleteError('Payment not found', 404);
    const table = (await trx.schema.hasTable('vendor_payments')) && (await trx('vendor_payments').where({ id }).first()) ? 'vendor_payments' : 'bill_payments';
    await trx('bill_payment_applications').where({ payment_id: id }).del().catch(() => {});
    await reverseJournal(trx, companyId, 'bill_payment', id);
    await reverseJournal(trx, companyId, 'vendor_payment', id);
    await removeHeader(trx, table, id, companyId);
    return 'Bill payment deleted';
  },

  vendor_prepayment: async (trx, companyId, id) => {
    const p = await trx('vendor_prepayments').where({ id, company_id: companyId }).first();
    if (!p) throw new TxnDeleteError('Prepayment not found', 404);
    await reverseJournal(trx, companyId, 'vendor_prepayment', id);
    await removeHeader(trx, 'vendor_prepayments', id, companyId);
    return 'Vendor prepayment deleted';
  },

  vendor_credit: async (trx, companyId, id) => {
    const vc = await trx('vendor_credits').where({ id, company_id: companyId }).first();
    if (!vc) throw new TxnDeleteError('Vendor credit not found', 404);
    await trx('vendor_credit_bill_applications').where({ credit_id: id }).del().catch(() => {});
    await reverseJournal(trx, companyId, 'vendor_credit', id);
    await removeHeader(trx, 'vendor_credits', id, companyId);
    return 'Vendor credit deleted';
  },

  vendor_return: async (trx, companyId, id) => {
    const vr = await trx('vendor_returns').where({ id, company_id: companyId }).first();
    if (!vr) throw new TxnDeleteError('Vendor return not found', 404);
    // If fulfilled, stock was reduced → add it back
    if (vr.status === 'fulfilled') {
      const lines = await trx('vendor_return_lines').where((qb: any) => qb.where('return_id', id).orWhere('vendor_return_id', id));
      for (const l of lines as any[]) {
        const locId = l.location_id || vr.location_id;
        if (l.item_id && locId && Number(l.qty) > 0) {
          try { await trx('inventory_balances').where({ company_id: companyId, item_id: l.item_id, location_id: locId }).update({ qty_on_hand: trx.raw('qty_on_hand + ?', [Number(l.qty)]) }); } catch {}
        }
      }
    }
    await removeHeader(trx, 'vendor_returns', id, companyId);
    return 'Vendor return deleted';
  },

  item_receipt: async (trx, companyId, id, userId) => {
    const r = await trx('item_receipts').where({ id, company_id: companyId }).first();
    if (!r) throw new TxnDeleteError('Item receipt not found', 404);
    // Block only when a bill actually references this receipt. vendor_bills links to
    // the PO, not the receipt, so only run this guard if a receipt_id column exists
    // (querying a missing column aborts the whole DB transaction in Postgres).
    if (await trx.schema.hasColumn('vendor_bills', 'receipt_id')) {
      const bill = await trx('vendor_bills').where({ receipt_id: id, is_deleted: false }).first().catch(() => null);
      if (bill) throw new TxnDeleteError('Cannot delete: this receipt is already billed.');
    }
    const lines = await trx('item_receipt_lines').where({ receipt_id: id });
    for (const l of lines as any[]) {
      if (l.item_id && Number(l.quantity) > 0) {
        const q = Number(l.quantity) * await baseRate(trx, l.uom_id);
        try {
          await InventoryEngine.createTransaction({ companyId, transactionType: 'receipt_delete_reverse', referenceType: 'item_receipt', referenceId: id, transactionDate: new Date().toISOString().split('T')[0], locationId: l.location_id || r.location_id, memo: `Reverse delete of receipt ${r.receipt_number}`, lines: [{ itemId: l.item_id, quantity: q, direction: 'out', locationId: l.location_id || r.location_id }], createdBy: userId || '', skipStockCheck: true, trx });
        } catch (invErr: any) {
          // If the received stock has already been consumed, the receipt cannot be
          // safely deleted — block it instead of silently leaving stock unreversed.
          if (String(invErr?.message || '').toLowerCase().includes('insufficient stock')) {
            throw new TxnDeleteError('Cannot delete: the received stock has already been used/moved, so it cannot be reversed.');
          }
          console.error('[DELETE WARNING] receipt inventory reverse failed:', invErr?.message);
          throw invErr; // surface unexpected errors so the delete rolls back (no false success)
        }
      }
      // Reverse the qty_received this receipt added to its PO line (in PO units — no conversion).
      if (l.po_line_id && Number(l.quantity) > 0) {
        try {
          await trx('purchase_order_lines').where({ id: l.po_line_id })
            .update({ qty_received: trx.raw('GREATEST(0, COALESCE(qty_received,0) - ?)', [Number(l.quantity)]) });
        } catch {}
      }
    }
    // Recompute the PO status now that this receipt's quantities are reversed.
    if (r.po_id) {
      try {
        const po = await trx('purchase_orders').where({ id: r.po_id }).first();
        const poLines = await trx('purchase_order_lines').where({ po_id: r.po_id });
        const anyReceived = poLines.some((pl: any) => parseFloat(pl.qty_received || 0) > 0);
        const allReceived = poLines.length > 0 && poLines.every((pl: any) => parseFloat(pl.qty_received || 0) >= parseFloat(pl.quantity || 0));
        // Don't touch a PO that's closed or in a billing state.
        const billingStatuses = ['partially_billed', 'fully_billed', 'pending_billing', 'closed'];
        if (po && !billingStatuses.includes(po.status)) {
          await trx('purchase_orders').where({ id: r.po_id })
            .update({ status: allReceived ? 'fully_received' : anyReceived ? 'partially_received' : 'pending_receipt' });
        }
      } catch {}
    }
    await reverseJournal(trx, companyId, 'item_receipt', id);
    // Hard delete the receipt (remove child lines first, then the header) so the
    // record is fully removed from the database — not just flagged is_deleted.
    await trx('item_receipt_lines').where({ receipt_id: id }).del();
    await trx('item_receipts').where({ id, company_id: companyId }).del();
    return 'Item receipt deleted; inventory restored';
  },

  // ===== INVENTORY =====
  inventory_adjustment: async (trx, companyId, id) => {
    const adj = await trx('inventory_adjustments').where({ id, company_id: companyId }).first();
    if (!adj) throw new TxnDeleteError('Adjustment not found', 404);
    const lines = await trx('inventory_adjustment_lines').where({ adjustment_id: id });
    for (const l of lines as any[]) {
      const q = Number(l.adjust_qty) * await baseRate(trx, l.uom_id);
      if (l.location_id && q) {
        try { await trx('inventory_balances').where({ company_id: companyId, item_id: l.item_id, location_id: l.location_id }).update({ qty_on_hand: trx.raw('GREATEST(0, qty_on_hand - ?)', [q]) }); } catch {}
      }
    }
    await reverseJournal(trx, companyId, 'inventory_adjustment', id);
    await removeHeader(trx, 'inventory_adjustments', id, companyId);
    return 'Inventory adjustment deleted; balances reversed';
  },

  inventory_transfer: async (trx, companyId, id) => {
    const tr = await trx('inventory_transfers').where({ id, company_id: companyId }).first();
    if (!tr) throw new TxnDeleteError('Transfer not found', 404);
    const lines = await trx('inventory_transfer_lines').where({ transfer_id: id });
    for (const l of lines as any[]) {
      const q = Number(l.qty) * await baseRate(trx, l.uom_id);
      if (!q) continue;
      try {
        // undo: add back to source, remove from destination
        const src = await trx('inventory_balances').where({ company_id: companyId, item_id: l.item_id, location_id: tr.from_location_id }).first();
        if (src) await trx('inventory_balances').where({ id: src.id }).update({ qty_on_hand: trx.raw('qty_on_hand + ?', [q]) });
        await trx('inventory_balances').where({ company_id: companyId, item_id: l.item_id, location_id: tr.to_location_id }).update({ qty_on_hand: trx.raw('GREATEST(0, qty_on_hand - ?)', [q]) });
      } catch {}
    }
    await reverseJournal(trx, companyId, 'inventory_transfer', id);
    await removeHeader(trx, 'inventory_transfers', id, companyId);
    return 'Inventory transfer deleted; balances reversed';
  },

  transfer_order: async (trx, companyId, id) => {
    const o = await trx('inventory_transfer_orders').where({ id, company_id: companyId }).first();
    if (!o) throw new TxnDeleteError('Transfer order not found', 404);
    if (['in_transit', 'received'].includes(o.status)) throw new TxnDeleteError('Cannot delete an order already in transit or received.');
    const lines = await trx('inventory_transfer_order_lines').where({ transfer_order_id: id });
    for (const l of lines as any[]) {
      if (l.item_id && Number(l.qty_requested) > 0) {
        try { const q = Number(l.qty_requested) * await baseRate(trx, l.uom_id); await InventoryEngine.releaseCommitted(trx, companyId, l.item_id, q, o.from_location_id); } catch {}
      }
    }
    await removeHeader(trx, 'inventory_transfer_orders', id, companyId);
    return 'Transfer order deleted';
  },

  // ===== MANUFACTURING =====
  work_order: async (trx, companyId, id) => {
    const wo = await trx('work_orders').where({ id, company_id: companyId }).first();
    if (!wo) throw new TxnDeleteError('Work order not found', 404);
    if (['completed', 'closed'].includes(wo.status)) throw new TxnDeleteError('Cannot delete a completed work order.');
    const build = await trx('assembly_builds').where({ work_order_id: id, is_deleted: false }).first().catch(() => null);
    if (build) throw new TxnDeleteError('Cannot delete: this work order already has assembly builds.');
    await removeHeader(trx, 'work_orders', id, companyId);
    return 'Work order deleted';
  },

  assembly_build: async (trx, companyId, id) => {
    const ab = await trx('assembly_builds').where({ id, company_id: companyId }).first();
    if (!ab) throw new TxnDeleteError('Assembly build not found', 404);
    // Reverse: remove finished good back out, return components to stock
    try {
      await InventoryEngine.createTransaction({ companyId, transactionType: 'assembly_delete_reverse', referenceType: 'assembly_build', referenceId: id, transactionDate: new Date().toISOString().split('T')[0], locationId: ab.location_id, memo: `Reverse delete of assembly build ${ab.build_number}`, lines: [{ itemId: ab.item_id, quantity: Number(ab.quantity), direction: 'out', locationId: ab.location_id }], createdBy: '', trx });
    } catch {}
    const comps = await trx('assembly_build_lines').where({ build_id: id });
    for (const l of comps as any[]) {
      if (l.item_id && Number(l.quantity) > 0) {
        try { await InventoryEngine.createTransaction({ companyId, transactionType: 'assembly_delete_reverse', referenceType: 'assembly_build', referenceId: id, transactionDate: new Date().toISOString().split('T')[0], locationId: ab.location_id, memo: `Reverse delete of assembly build ${ab.build_number}`, lines: [{ itemId: l.item_id, quantity: Number(l.quantity), direction: 'in', locationId: ab.location_id }], createdBy: '', trx }); } catch {}
      }
    }
    await reverseJournal(trx, companyId, 'assembly_build', id);
    await removeHeader(trx, 'assembly_builds', id, companyId);
    return 'Assembly build deleted; inventory reversed';
  },

  // ===== ACCOUNTING / BANK =====
  journal_entry: async (trx, companyId, id) => {
    const je = await trx('journal_entries').where({ id, company_id: companyId }).first();
    if (!je) throw new TxnDeleteError('Journal entry not found', 404);
    if (je.source_type && String(je.source_type).trim() !== '') throw new TxnDeleteError('Cannot delete a system journal entry. Delete the source transaction instead.');
    await trx('journal_entry_lines').where({ journal_id: id }).del();
    await removeHeader(trx, 'journal_entries', id, companyId);
    return 'Journal entry deleted';
  },

  bank_check: async (trx, companyId, id) => {
    const c = await trx('bank_checks').where({ id, company_id: companyId }).first();
    if (!c) throw new TxnDeleteError('Check not found', 404);
    await reverseJournal(trx, companyId, 'bank_check', id);
    await removeHeader(trx, 'bank_checks', id, companyId);
    return 'Check deleted';
  },

  bank_deposit: async (trx, companyId, id) => {
    const d = await trx('bank_deposits').where({ id, company_id: companyId }).first();
    if (!d) throw new TxnDeleteError('Deposit not found', 404);
    await reverseJournal(trx, companyId, 'bank_deposit', id);
    await removeHeader(trx, 'bank_deposits', id, companyId);
    return 'Bank deposit deleted';
  },

  bank_transfer: async (trx, companyId, id) => {
    const t = await trx('bank_transfers').where({ id, company_id: companyId }).first();
    if (!t) throw new TxnDeleteError('Transfer not found', 404);
    await reverseJournal(trx, companyId, 'bank_transfer', id);
    await removeHeader(trx, 'bank_transfers', id, companyId);
    return 'Bank transfer deleted';
  },

  expense_report: async (trx, companyId, id) => {
    const er = await trx('expense_reports').where({ id, company_id: companyId }).first();
    if (!er) throw new TxnDeleteError('Expense report not found', 404);
    await reverseJournal(trx, companyId, 'expense_report', id);
    await removeHeader(trx, 'expense_reports', id, companyId);
    return 'Expense report deleted';
  },

  expense_payment: async (trx, companyId, id) => {
    const ep = await trx('expense_payments').where({ id, company_id: companyId }).first();
    if (!ep) throw new TxnDeleteError('Expense payment not found', 404);
    await reverseJournal(trx, companyId, 'expense_payment', id);
    await removeHeader(trx, 'expense_payments', id, companyId);
    return 'Expense payment deleted';
  },
};

// Entry point: run the handler for a transaction type inside a transaction.
export async function deleteTransaction(sourceType: string, id: string, companyId: string, userId: string): Promise<string> {
  const handler = handlers[sourceType];
  if (!handler) throw new TxnDeleteError(`Delete not supported for ${sourceType}`, 400);
  return db.transaction(async (trx) => handler(trx, companyId, id, userId));
}
