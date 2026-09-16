import { Router, Request, Response } from 'express';
import db from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { getPaginationParams, buildPaginatedResult } from '../../utils/pagination';
import { generateTransactionNumber } from '../../utils/sequence';
import { createAuditLog } from '../../utils/audit';
import { attachAuditRoute, logTransaction, fetchJEWithLines } from '../../utils/transactionAudit';
import { AccountingEngine } from '../../engines/accounting/accountingEngine';
import { InventoryEngine } from '../../engines/inventory/inventoryEngine';

const router = Router();
router.use(authenticate);

// ===== PURCHASE REQUISITIONS =====
router.get('/requisitions', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    const query = db('purchase_requisitions as pr')
      .leftJoin('users as u', db.raw('u.id::text = pr.requested_by'))
      .leftJoin('departments as d', 'pr.department_id', 'd.id')
      .where({ 'pr.company_id': companyId, 'pr.is_deleted': false })
      .select('pr.*', db.raw('COALESCE(u.name, pr.requested_by) as requested_by_name'), 'd.name as department_name');
    if (req.query.status) query.where({ 'pr.status': req.query.status });
    const total = parseInt((await query.clone().clearSelect().count('* as count').first() as any)?.count || '0');
    const data = await query.orderBy('pr.request_date', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch requisitions' }); }
});

router.post('/requisitions', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    const prNumber = await generateTransactionNumber(companyId, 'purchase_requisition', db);
    const lines = d.lines || [];
    const totalAmount = lines.reduce((s: number, l: any) => s + (l.quantity * (l.estimatedPrice || 0)), 0);
    const [pr] = await db('purchase_requisitions').insert({
      company_id: companyId, pr_number: prNumber,
      request_date: d.requestDate || new Date().toISOString().split('T')[0],
      required_date: d.requiredDate, requested_by: d.requestedBy || req.user!.id,
      department_id: d.departmentId || null, location_id: d.locationId || null,
      status: 'draft', reason: d.reason, total_amount: totalAmount,
    }).returning('*');
    if (lines.length > 0) {
      await db('purchase_requisition_lines').insert(lines.map((l: any, idx: number) => ({
        pr_id: pr.id, line_number: idx + 1, item_id: l.itemId, description: l.description,
        quantity: l.quantity, uom_id: l.uomId || null, estimated_price: l.estimatedPrice || 0,
        preferred_vendor_id: l.preferredVendorId || null,
      })));
    }
    res.status(201).json({ success: true, data: pr });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to create requisition' }); }
});

router.post('/requisitions/:id/approve', async (req: Request, res: Response): Promise<void> => {
  try {
    const pr = await db('purchase_requisitions').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!pr) { res.status(404).json({ success: false, error: 'Requisition not found' }); return; }
    const [updated] = await db('purchase_requisitions').where({ id: pr.id })
      .update({ status: 'approved', approved_by: req.user!.id, approved_at: new Date() }).returning('*');
    res.json({ success: true, data: updated });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to approve requisition' }); }
});

// ===== PURCHASE ORDERS =====
router.get('/orders', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    let query = db('purchase_orders as po').join('vendors as v', 'po.vendor_id', 'v.id')
      .leftJoin('locations as l', 'po.location_id', 'l.id')
      .where({ 'po.company_id': companyId, 'po.is_deleted': false })
      .select('po.*', 'v.name as vendor_name', 'l.name as location_name');
    if (search) query = query.where((qb: any) => qb.whereILike('po.po_number', `%${search}%`).orWhereILike('v.name', `%${search}%`));
    if (req.query.status) query = query.where({ 'po.status': req.query.status });
    if (req.query.vendorId) query = query.where({ 'po.vendor_id': req.query.vendorId });
    const total = parseInt((await query.clone().clearSelect().count('* as count').first() as any)?.count || '0');
    const data = await query.orderBy('po.order_date', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch purchase orders' }); }
});

router.get('/orders/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const po = await db('purchase_orders as po').join('vendors as v', 'po.vendor_id', 'v.id')
      .leftJoin('locations as l', 'po.location_id', 'l.id')
      .leftJoin('warehouses as w', 'po.warehouse_id', 'w.id')
      .leftJoin('users as ab', 'po.approved_by', 'ab.id')
      .where({ 'po.id': req.params.id, 'po.company_id': req.user!.companyId })
      .select('po.*', 'v.name as vendor_name', 'v.email as vendor_email', 'v.address as vendor_address',
        'v.payment_terms as vendor_payment_terms', 'l.name as location_name', 'w.name as warehouse_name', 'ab.name as approved_by_name')
      .first();
    if (!po) { res.status(404).json({ success: false, error: 'Purchase order not found' }); return; }
    const lines = await db('purchase_order_lines as pol').join('items as i', 'pol.item_id', 'i.id')
      .leftJoin('units_of_measure as uom', 'pol.uom_id', 'uom.id')
      .where({ 'pol.po_id': po.id }).orderBy('pol.line_number')
      .select('pol.*', 'i.item_code', 'i.name as item_name', 'uom.code as uom_code');
    const receipts = await db('item_receipts').where({ po_id: po.id });
    const bills = await db('vendor_bills').where({ po_id: po.id, is_deleted: false });
    res.json({ success: true, data: { ...po, lines, receipts, bills } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch purchase order' }); }
});

router.post('/orders', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    if (!d.vendorId || !d.orderDate) {
      res.status(400).json({ success: false, error: 'Vendor and order date are required' }); return;
    }
    const poNumber = await generateTransactionNumber(companyId, 'purchase_order', db);
    const lines = d.lines || [];
    let subtotal = 0, taxAmount = 0;
    for (const line of lines) {
      subtotal += line.quantity * line.unitPrice;
      taxAmount += line.taxAmount || 0;
    }
    const [po] = await db('purchase_orders').insert({
      company_id: companyId, subsidiary_id: d.subsidiaryId || null, po_number: poNumber,
      pr_id: d.prId || null, vendor_id: d.vendorId, order_date: d.orderDate,
      expected_receipt_date: d.expectedReceiptDate || null, currency: d.currency || 'IDR',
      exchange_rate: d.exchangeRate || 1, payment_terms: d.paymentTerms || null,
      location_id: d.locationId || null, warehouse_id: d.warehouseId || null,
      department_id: d.departmentId || null, status: 'pending_approval', memo: d.memo,
      subtotal, tax_amount: taxAmount, total_amount: subtotal + taxAmount, created_by: req.user!.id,
    }).returning('*');
    if (lines.length > 0) {
      await db('purchase_order_lines').insert(lines.map((l: any, idx: number) => ({
        po_id: po.id, line_number: idx + 1, item_id: l.itemId, description: l.description,
        quantity: l.quantity, uom_id: l.uomId || null, unit_price: l.unitPrice,
        tax_code_id: l.taxCodeId || null, tax_amount: l.taxAmount || 0,
        amount: l.quantity * l.unitPrice, expense_account_id: l.expenseAccountId || null,
        expected_receipt_date: l.expectedReceiptDate,
      })));
    }
    await createAuditLog({ companyId, userId: req.user!.id, action: 'create', entityType: 'purchase_order', entityId: po.id, entityNumber: po.po_number });
    res.status(201).json({ success: true, data: po });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to create purchase order' }); }
});

router.post('/orders/:id/approve', async (req: Request, res: Response): Promise<void> => {
  try {
    const po = await db('purchase_orders').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!po) { res.status(404).json({ success: false, error: 'PO not found' }); return; }
    if (po.status !== 'pending_approval') {
      res.status(400).json({ success: false, error: `Cannot approve PO with status: ${po.status}` }); return;
    }
    const [updated] = await db('purchase_orders').where({ id: po.id })
      .update({ status: 'pending_receipt', approved_by: req.user!.id, approved_at: new Date() }).returning('*');
    res.json({ success: true, data: updated, message: 'Purchase order approved' });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to approve PO' }); }
});

router.post('/orders/:id/reject', async (req: Request, res: Response): Promise<void> => {
  try {
    const po = await db('purchase_orders').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!po) { res.status(404).json({ success: false, error: 'PO not found' }); return; }
    if (!['pending_approval', 'pending_receipt'].includes(po.status)) {
      res.status(400).json({ success: false, error: `Cannot reject PO with status: ${po.status}` }); return;
    }
    const reason = req.body.reason || 'Rejected by approver';
    const [updated] = await db('purchase_orders').where({ id: po.id })
      .update({ status: 'cancelled', memo: `${po.memo || ''}\n[REJECTED] ${reason}`.trim() }).returning('*');
    res.json({ success: true, data: updated, message: 'Purchase order rejected' });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to reject PO' }); }
});

// Receive Items
router.post('/orders/:id/receive', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const po = await db('purchase_orders').where({ id: req.params.id, company_id: companyId }).first();
    if (!po) { res.status(404).json({ success: false, error: 'PO not found' }); return; }
    if (!['pending_receipt', 'partially_received'].includes(po.status)) {
      res.status(400).json({ success: false, error: `Cannot receive against PO with status: ${po.status}` }); return;
    }

    await db.transaction(async (trx) => {
      const d = req.body;
      const receiptNumber = await generateTransactionNumber(companyId, 'item_receipt', trx);
      const [receipt] = await trx('item_receipts').insert({
        company_id: companyId, receipt_number: receiptNumber, po_id: po.id, vendor_id: po.vendor_id,
        receipt_date: d.receiptDate || new Date().toISOString().split('T')[0],
        location_id: d.locationId || po.location_id, warehouse_id: d.warehouseId || po.warehouse_id,
        status: 'received', memo: d.memo, created_by: req.user!.id,
      }).returning('*');

      const lines = d.lines || [];
      if (lines.length > 0) {
        await trx('item_receipt_lines').insert(lines.map((l: any) => ({
          receipt_id: receipt.id, po_line_id: l.poLineId, item_id: l.itemId,
          quantity: l.quantity, uom_id: l.uomId || null, bin_id: l.binId || null,
          lot_number: l.lotNumber, serial_number: l.serialNumber, expiry_date: l.expiryDate,
          unit_cost: l.unitCost, amount: l.quantity * l.unitCost,
        })));

        for (const line of lines) {
          await trx('purchase_order_lines').where({ id: line.poLineId }).increment('qty_received', line.quantity);
          // Increase inventory
          await InventoryEngine.createTransaction({
            companyId, transactionType: 'item_receipt',
            referenceType: 'item_receipt', referenceId: receipt.id,
            transactionDate: receipt.receipt_date,
            locationId: d.locationId || po.location_id, warehouseId: d.warehouseId || po.warehouse_id,
            memo: `Receipt for PO ${po.po_number}`,
            lines: [{
              itemId: line.itemId, quantity: line.quantity, direction: 'in',
              warehouseId: d.warehouseId || po.warehouse_id, binId: line.binId,
              lotNumber: line.lotNumber, serialNumber: line.serialNumber, unitCost: line.unitCost,
            }],
            createdBy: req.user!.id, trx,
          });
        }
      }

      // Update PO status
      const poLines = await trx('purchase_order_lines').where({ po_id: po.id });
      const allReceived = poLines.every((l: any) => l.qty_received >= l.quantity);
      const anyReceived = poLines.some((l: any) => l.qty_received > 0);
      await trx('purchase_orders').where({ id: po.id }).update({
        status: allReceived ? 'fully_received' : anyReceived ? 'partially_received' : po.status,
      });

      // GL Impact: Dr. Inventory  Cr. Accrued AP (GR-IR 2110)
      try {
        await AccountingEngine.postItemReceipt(receipt.id, req.user!.id, trx);
      } catch (glErr: any) {
        console.error('[GL WARNING] Item Receipt GL skipped:', glErr.message);
        // Non-blocking: receipt still completes
      }

      res.json({ success: true, data: receipt, message: 'Items received successfully' });
    });
  } catch (e: any) {
    console.error("[ERP ERROR]", e.message);
    res.status(500).json({ success: false, error: e.message || 'Failed to receive items' });
  }
});

// Create Vendor Bill from PO
router.post('/orders/:id/bill', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const po = await db('purchase_orders').where({ id: req.params.id, company_id: companyId }).first();
    if (!po) { res.status(404).json({ success: false, error: 'PO not found' }); return; }

    await db.transaction(async (trx) => {
      const billNumber = await generateTransactionNumber(companyId, 'vendor_bill', trx);
      const vendor = await trx('vendors').where({ id: po.vendor_id }).first();
      const d = req.body;
      const billDate = d.billDate || new Date().toISOString().split('T')[0];
      const terms = po.payment_terms || vendor?.payment_terms || 'Net30';
      const days = parseInt(terms.replace('Net', '')) || 30;
      const dueDate = new Date(billDate);
      dueDate.setDate(dueDate.getDate() + days);

      const poLines = await trx('purchase_order_lines').where({ po_id: po.id });
      const [bill] = await trx('vendor_bills').insert({
        company_id: companyId, subsidiary_id: po.subsidiary_id,
        bill_number: billNumber, vendor_invoice_number: d.vendorInvoiceNumber || null,
        po_id: po.id, vendor_id: po.vendor_id, bill_date: billDate,
        due_date: dueDate.toISOString().split('T')[0], currency: po.currency, exchange_rate: po.exchange_rate,
        payment_terms: po.payment_terms, location_id: po.location_id, department_id: po.department_id,
        status: 'open', memo: d.memo,
        subtotal: po.subtotal, tax_amount: po.tax_amount, total_amount: po.total_amount,
        amount_paid: 0, amount_due: po.total_amount,
        ap_account_id: vendor?.ap_account_id, is_posted: false, created_by: req.user!.id,
      }).returning('*');

      await trx('vendor_bill_lines').insert(poLines.map((l: any) => ({
        bill_id: bill.id, po_line_id: l.id, line_number: l.line_number,
        item_id: l.item_id, description: l.description, quantity: l.quantity,
        uom_id: l.uom_id, unit_price: l.unit_price,
        tax_code_id: l.tax_code_id, tax_amount: l.tax_amount, amount: l.amount,
        expense_account_id: l.expense_account_id,
      })));

      // Post GL
      await AccountingEngine.postVendorBill(bill.id, req.user!.id, trx);

      await trx('purchase_orders').where({ id: po.id }).update({ status: 'pending_billing' });

      // Re-fetch bill to get updated is_posted flag
      const finalBill = await trx('vendor_bills').where({ id: bill.id }).first();
      res.json({ success: true, data: finalBill, message: 'Vendor bill created and posted' });
    });
  } catch (e: any) {
    console.error("[ERP ERROR]", e.message);
    res.status(500).json({ success: false, error: e.message || 'Failed to create vendor bill' });
  }
});

// ===== GOOD RECEIPTS =====
router.get('/receipts', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    let query = db('item_receipts as ir')
      .join('vendors as v', 'ir.vendor_id', 'v.id')
      .join('purchase_orders as po', 'ir.po_id', 'po.id')
      .leftJoin('locations as l', 'ir.location_id', 'l.id')
      .where({ 'ir.company_id': companyId })
      .select('ir.*', 'v.name as vendor_name', 'po.po_number', 'l.name as location_name');
    if (search) query = query.where((qb: any) => qb.whereILike('ir.receipt_number', `%${search}%`).orWhereILike('v.name', `%${search}%`));
    if (req.query.poId) query = query.where({ 'ir.po_id': req.query.poId });
    if (req.query.status) query = query.where({ 'ir.status': req.query.status });
    const total = parseInt((await query.clone().clearSelect().count('ir.id as count').first() as any)?.count || '0');
    const data = await query.orderBy('ir.receipt_date', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to fetch receipts' }); }
});

router.get('/receipts/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const receipt = await db('item_receipts as ir')
      .join('vendors as v', 'ir.vendor_id', 'v.id')
      .join('purchase_orders as po', 'ir.po_id', 'po.id')
      .leftJoin('locations as l', 'ir.location_id', 'l.id')
      .where({ 'ir.id': req.params.id, 'ir.company_id': req.user!.companyId })
      .select('ir.*', 'v.name as vendor_name', 'v.email as vendor_email', 'v.address as vendor_address',
        'po.po_number', 'l.name as location_name')
      .first();
    if (!receipt) { res.status(404).json({ success: false, error: 'Good receipt not found' }); return; }
    const lines = await db('item_receipt_lines as rl')
      .join('items as i', 'rl.item_id', 'i.id')
      .leftJoin('units_of_measure as uom', 'i.base_uom_id', 'uom.id')
      .leftJoin('purchase_order_lines as pol', 'rl.po_line_id', 'pol.id')
      .where({ 'rl.receipt_id': receipt.id })
      .select('rl.*', 'i.item_code', 'i.name as item_name', 'uom.code as uom_code', 'pol.description');
    const journalEntries = await fetchJEWithLines('item_receipt', receipt.id, db);
    res.json({ success: true, data: { ...receipt, lines, journalEntries } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to fetch good receipt' }); }
});

// ===== VENDOR BILLS =====
router.get('/bills', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    let query = db('vendor_bills as b').join('vendors as v', 'b.vendor_id', 'v.id')
      .where({ 'b.company_id': companyId, 'b.is_deleted': false })
      .select('b.*', 'v.name as vendor_name');
    if (search) query = query.where((qb: any) => qb.whereILike('b.bill_number', `%${search}%`).orWhereILike('v.name', `%${search}%`));
    if (req.query.status) query = query.where({ 'b.status': req.query.status });
    const total = parseInt((await query.clone().clearSelect().count('* as count').first() as any)?.count || '0');
    const data = await query.orderBy('b.bill_date', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to fetch bills' }); }
});

router.get('/bills/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const bill = await db('vendor_bills as b')
      .join('vendors as v', 'b.vendor_id', 'v.id')
      .leftJoin('purchase_orders as po', 'b.po_id', 'po.id')
      .leftJoin('locations as l', 'b.location_id', 'l.id')
      .where({ 'b.id': req.params.id, 'b.company_id': companyId, 'b.is_deleted': false })
      .select(
        'b.*',
        'v.name as vendor_name', 'v.email as vendor_email', 'v.address as vendor_address',
        'v.tax_id as vendor_tax_id', 'v.payment_terms as vendor_payment_terms',
        'po.po_number', 'l.name as location_name'
      )
      .first();

    if (!bill) { res.status(404).json({ success: false, error: 'Vendor bill not found' }); return; }

    const lines = await db('vendor_bill_lines as vbl')
      .join('items as i', 'vbl.item_id', 'i.id')
      .leftJoin('units_of_measure as uom', 'vbl.uom_id', 'uom.id')
      .leftJoin('accounts as a', 'vbl.expense_account_id', 'a.id')
      .where({ 'vbl.bill_id': bill.id })
      .orderBy('vbl.line_number')
      .select('vbl.*', 'i.item_code', 'i.name as item_name', 'uom.code as uom_code', 'a.code as expense_account_code', 'a.name as expense_account_name');

    const payments = await db('bill_payment_applications as bpa')
      .join('vendor_payments as vp', 'bpa.payment_id', 'vp.id')
      .where({ 'bpa.bill_id': bill.id })
      .select('bpa.*', 'vp.payment_number', 'vp.payment_date', 'vp.payment_method');

    const journalEntries = await fetchJEWithLines('vendor_bill', bill.id, db);
    res.json({ success: true, data: { ...bill, lines, payments, journalEntries } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to fetch vendor bill' }); }
});

// Vendor Payments
router.get('/vendor-payments', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    let query = db('vendor_payments as vp')
      .join('vendors as v', 'vp.vendor_id', 'v.id')
      .where({ 'vp.company_id': companyId, 'vp.is_deleted': false })
      .select('vp.*', 'v.name as vendor_name');
    if (search) query = query.where((qb: any) => qb.whereILike('vp.payment_number', `%${search}%`).orWhereILike('v.name', `%${search}%`));
    if (req.query.status) query = query.where({ 'vp.status': req.query.status });
    if (req.query.vendorId) query = query.where({ 'vp.vendor_id': req.query.vendorId });
    const total = parseInt((await query.clone().clearSelect().count('vp.id as count').first() as any)?.count || '0');
    const data = await query.orderBy('vp.payment_date', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to fetch vendor payments' }); }
});

router.get('/vendor-payments/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const payment = await db('vendor_payments as vp')
      .join('vendors as v', 'vp.vendor_id', 'v.id')
      .leftJoin('accounts as ba', 'vp.bank_account_id', 'ba.id')
      .leftJoin('accounts as apa', 'vp.ap_account_id', 'apa.id')
      .where({ 'vp.id': req.params.id, 'vp.company_id': req.user!.companyId, 'vp.is_deleted': false })
      .select('vp.*', 'v.name as vendor_name', 'v.email as vendor_email',
        'ba.code as bank_account_code', 'ba.name as bank_account_name',
        'apa.code as ap_account_code', 'apa.name as ap_account_name')
      .first();
    if (!payment) { res.status(404).json({ success: false, error: 'Vendor payment not found' }); return; }
    const applications = await db('bill_payment_applications as bpa')
      .join('vendor_bills as b', 'bpa.bill_id', 'b.id')
      .where({ 'bpa.payment_id': payment.id })
      .select('bpa.*', 'b.bill_number', 'b.bill_date', 'b.due_date', 'b.total_amount', 'b.status as bill_status');
    const journalEntries = await fetchJEWithLines('vendor_payment', payment.id, db);
    res.json({ success: true, data: { ...payment, applications, journalEntries } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to fetch vendor payment' }); }
});

// Vendor Payment (Create)
router.post('/vendor-payments', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    await db.transaction(async (trx) => {
      const payNumber = await generateTransactionNumber(companyId, 'vendor_payment', trx);
      const vendor = await trx('vendors').where({ id: d.vendorId }).first();
      const [payment] = await trx('vendor_payments').insert({
        company_id: companyId, payment_number: payNumber, vendor_id: d.vendorId,
        payment_date: d.paymentDate, payment_method: d.paymentMethod || 'bank_transfer',
        reference: d.reference, currency: d.currency || 'IDR', exchange_rate: d.exchangeRate || 1,
        amount: d.amount, unapplied_amount: d.amount,
        bank_account_id: d.bankAccountId, ap_account_id: vendor?.ap_account_id,
        status: 'open', memo: d.memo, is_posted: false, created_by: req.user!.id,
      }).returning('*');

      if (d.applications?.length > 0) {
        let remaining = parseFloat(d.amount);
        for (const app of d.applications) {
          if (remaining <= 0) break;
          const bill = await trx('vendor_bills').where({ id: app.billId }).first();
          if (!bill || bill.amount_due <= 0) continue;
          const applyAmount = Math.min(remaining, parseFloat(bill.amount_due));
          await trx('bill_payment_applications').insert({ payment_id: payment.id, bill_id: app.billId, applied_amount: applyAmount });
          const newPaid = parseFloat(bill.amount_paid) + applyAmount;
          const newDue = parseFloat(bill.total_amount) - newPaid;
          await trx('vendor_bills').where({ id: app.billId }).update({ amount_paid: newPaid, amount_due: newDue, status: newDue <= 0 ? 'paid' : 'partially_paid' });
          remaining -= applyAmount;
        }
        await trx('vendor_payments').where({ id: payment.id }).update({ unapplied_amount: Math.max(0, remaining), status: remaining <= 0 ? 'applied' : 'open' });
      }

      await AccountingEngine.postVendorPayment(payment.id, req.user!.id, trx);
      res.status(201).json({ success: true, data: payment });
    });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: e.message || 'Failed to record payment' }); }
});

// ─── Vendor Bills POST (new entry form) ──────────────────────────────────────
router.post('/bills', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.vendorId) { res.status(400).json({ success: false, error: 'Vendor is required' }); return; }

    const billNumber = `BILL-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const subtotal = (d.lines || []).reduce((s: number, l: any) => s + Number(l.qty || 0) * Number(l.unitPrice || 0), 0);
    const taxAmount = subtotal * (Number(d.taxRate || 0) / 100);
    const totalAmount = subtotal + taxAmount;

    const dueDate = d.dueDate || (() => {
      const dt = new Date(d.billDate || new Date());
      const days: Record<string, number> = { net15: 15, net30: 30, net45: 45, net60: 60, immediate: 0 };
      dt.setDate(dt.getDate() + (days[d.paymentTerms || 'net30'] || 30));
      return dt.toISOString().split('T')[0];
    })();

    const [bill] = await db('vendor_bills').insert({
      company_id: companyId,
      bill_number: billNumber,
      vendor_id: d.vendorId,
      bill_date: d.billDate || new Date(),
      due_date: dueDate,
      vendor_bill_number: d.billNumber || null,
      payment_terms: d.paymentTerms || 'net30',
      currency: d.currency || 'IDR',
      tax_rate: Number(d.taxRate || 0),
      subtotal, tax_amount: taxAmount, total_amount: totalAmount,
      amount_paid: 0, amount_due: totalAmount,
      memo: d.memo || null,
      status: 'open',
      created_by: req.user!.id,
    }).returning('*');

    for (const line of d.lines || []) {
      await db('vendor_bill_lines').insert({
        bill_id: bill.id,
        item_id: line.itemId || null,
        description: line.description || null,
        account_id: line.accountId || null,
        qty: Number(line.qty || 0),
        unit_price: Number(line.unitPrice || 0),
        amount: Number(line.qty || 0) * Number(line.unitPrice || 0),
      });
    }

    res.status(201).json({ success: true, data: { ...bill, bill_number: billNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to create bill' }); }
});

// ─── Vendor Prepayments ───────────────────────────────────────────────────────
router.get('/prepayments', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('vendor_prepayments as vp')
      .leftJoin('vendors as v', 'vp.vendor_id', 'v.id')
      .where({ 'vp.company_id': req.user!.companyId })
      .select('vp.*', 'v.name as vendor_name')
      .orderBy('vp.payment_date', 'desc').limit(100);
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to fetch prepayments' }); }
});

router.post('/prepayments', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.vendorId) { res.status(400).json({ success: false, error: 'Vendor is required' }); return; }
    if (!d.amount || Number(d.amount) <= 0) { res.status(400).json({ success: false, error: 'Amount must be > 0' }); return; }
    if (!d.bankAccountId) { res.status(400).json({ success: false, error: 'Bank Account is required' }); return; }

    const prepNumber = `PREP-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const [prep] = await db('vendor_prepayments').insert({
      company_id: companyId,
      prepayment_number: prepNumber,
      vendor_id: d.vendorId,
      payment_date: d.paymentDate || new Date(),
      amount: Number(d.amount),
      bank_account_id: d.bankAccountId,
      payment_method: d.paymentMethod || 'bank_transfer',
      reference: d.reference || null,
      purchase_order_id: d.purchaseOrderId || null,
      memo: d.memo || null,
      status: 'unapplied',
      created_by: req.user!.id,
    }).returning('*');

    // ── GL: Dr. Advance Payment to Vendor (1130) / Cr. Bank ──────────────────
    try {
      // Get Advance Payment account (1130)
      let advAcct = await db('accounts').where({ company_id: companyId, code: '1130' }).first();
      if (!advAcct) {
        const [a] = await db('accounts').insert({
          company_id: companyId, code: '1130', name: 'Advance Payment to Vendor',
          type: 'asset', subtype: 'other_current_asset', is_active: true,
        }).returning('*');
        advAcct = a;
      }
      const bankAcct = await db('accounts').where({ id: d.bankAccountId }).first();
      if (advAcct && bankAcct) {
        const jeNum = `JE-PREP-${String(Date.now()).slice(-8)}`;
        const [je] = await db('journal_entries').insert({
          company_id: companyId, journal_number: jeNum,
          entry_date: d.paymentDate || new Date(),
          memo: `Vendor Prepayment ${prepNumber}`,
          source_type: 'vendor_prepayment', source_id: prep.id || prep,
          status: 'posted', created_by: req.user!.id,
        }).returning('id');
        const jeId = je?.id || je;
        await db('journal_entry_lines').insert([
          { journal_id: jeId, line_number: 1, account_id: advAcct.id,  debit: Number(d.amount), credit: 0,              memo: `Advance to vendor` },
          { journal_id: jeId, line_number: 2, account_id: bankAcct.id, debit: 0,                credit: Number(d.amount), memo: `Bank payment` },
        ]);
      }
    } catch (glErr: any) { console.error('[GL ERROR] Prepayment GL:', glErr.message); }

    res.status(201).json({ success: true, data: { ...prep, prepayment_number: prepNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to record prepayment' }); }
});

// ─── Vendor Returns ───────────────────────────────────────────────────────────
router.get('/vendor-returns', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('vendor_returns as vr')
      .leftJoin('vendors as v', 'vr.vendor_id', 'v.id')
      .where({ 'vr.company_id': req.user!.companyId })
      .select('vr.*', 'v.name as vendor_name')
      .orderBy('vr.return_date', 'desc').limit(100);
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to fetch vendor returns' }); }
});

router.post('/vendor-returns', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.vendorId) { res.status(400).json({ success: false, error: 'Vendor is required' }); return; }

    const vrNumber = `VR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const totalAmount = (d.lines || []).reduce((s: number, l: any) => s + Number(l.qty || 0) * Number(l.unitPrice || 0), 0);

    const [vr] = await db('vendor_returns').insert({
      company_id: companyId,
      return_number: vrNumber,
      vendor_id: d.vendorId,
      return_date: d.returnDate || new Date(),
      original_po_number: d.originalPONumber || null,
      return_reason: d.returnReason || null,
      location_id: d.locationId || null,
      memo: d.memo || null,
      total_amount: totalAmount,
      status: 'posted',
      created_by: req.user!.id,
    }).returning('*');

    for (const line of d.lines || []) {
      await db('vendor_return_lines').insert({
        return_id: vr.id,
        item_id: line.itemId || null,
        description: line.description || null,
        qty: Number(line.qty || 0),
        unit_price: Number(line.unitPrice || 0),
      });
      // Deduct from inventory
      if (line.itemId && d.locationId) {
        await db('inventory_balances')
          .where({ company_id: companyId, item_id: line.itemId, location_id: d.locationId })
          .update({ qty_on_hand: db.raw('GREATEST(0, qty_on_hand - ?)', [Number(line.qty || 0)]) });
      }
    }
    res.status(201).json({ success: true, data: { ...vr, return_number: vrNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to create vendor return' }); }
});

// ─── Vendor Credits ───────────────────────────────────────────────────────────
router.get('/vendor-credits', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('vendor_credits as vc')
      .leftJoin('vendors as v', 'vc.vendor_id', 'v.id')
      .where({ 'vc.company_id': req.user!.companyId })
      .select('vc.*', 'v.name as vendor_name')
      .orderBy('vc.credit_date', 'desc').limit(100);
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to fetch vendor credits' }); }
});

router.post('/vendor-credits', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.vendorId) { res.status(400).json({ success: false, error: 'Vendor is required' }); return; }

    const vcNumber = `VC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const totalAmount = (d.lines || []).reduce((s: number, l: any) => s + Number(l.qty || 0) * Number(l.unitPrice || 0), 0);

    const [vc] = await db('vendor_credits').insert({
      company_id: companyId,
      credit_number: vcNumber,
      vendor_id: d.vendorId,
      credit_date: d.creditDate || new Date(),
      vendor_credit_memo_number: d.creditMemoNumber || null,
      original_bill_number: d.originalBillNumber || null,
      reason: d.reason || null,
      memo: d.memo || null,
      total_amount: totalAmount,
      status: 'open',
      created_by: req.user!.id,
    }).returning('*');

    for (const line of d.lines || []) {
      await db('vendor_credit_lines').insert({
        credit_id: vc.id,
        item_id: line.itemId || null,
        description: line.description || null,
        qty: Number(line.qty || 0),
        unit_price: Number(line.unitPrice || 0),
      });
    }

    // ── GL: Dr. Accounts Payable / Cr. Inventory Returned Not Credited (2220) ──
    if (totalAmount > 0) {
      try {
        // Get AP account and Inventory Returned account
        const apAcct = await db('accounts').where({ company_id: companyId, code: '2100' }).first(); // AP
        let invRetAcct = await db('accounts').where({ company_id: companyId, code: '2220' }).first();
        if (!invRetAcct) {
          const [a] = await db('accounts').insert({
            company_id: companyId, code: '2220', name: 'Inventory Returned Not Credited',
            type: 'liability', subtype: 'other_current_liability', is_active: true,
          }).returning('*');
          invRetAcct = a;
        }
        if (apAcct && invRetAcct) {
          const jeNum = `JE-VC-${String(Date.now()).slice(-8)}`;
          const [je] = await db('journal_entries').insert({
            company_id: companyId, journal_number: jeNum,
            entry_date: d.creditDate || new Date(),
            memo: `Vendor Credit ${vcNumber}`,
            source_type: 'vendor_credit', source_id: vc.id || vc,
            status: 'posted', created_by: req.user!.id,
          }).returning('id');
          const jeId = je?.id || je;
          await db('journal_entry_lines').insert([
            { journal_id: jeId, line_number: 1, account_id: apAcct.id,     debit: totalAmount, credit: 0,           memo: `Reduce AP balance` },
            { journal_id: jeId, line_number: 2, account_id: invRetAcct.id, debit: 0,           credit: totalAmount, memo: `Inventory credit pending` },
          ]);
        }
      } catch (glErr: any) { console.error('[GL ERROR] Vendor Credit GL:', glErr.message); }
    }

    res.status(201).json({ success: true, data: { ...vc, credit_number: vcNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to create vendor credit' }); }
});

// ── Audit routes ──────────────────────────────────────────────────────────────
const auditSub = (sourceType: string) => async (req: any, res: any) => {
  try { const l = await (db as any)('transaction_audit_log').where({ company_id: req.user.companyId, source_type: sourceType, source_id: req.params.id }).orderBy('performed_at','desc').limit(200); res.json({ success:true, data:l }); } catch(e:any){ res.status(500).json({success:false,error:e.message}); }
};
router.get('/orders/:id/audit',    auditSub('purchase_order'));
router.get('/bills/:id/audit',     auditSub('vendor_bill'));
router.get('/receipts/:id/audit',  auditSub('item_receipt'));
router.get('/payments/:id/audit',  auditSub('vendor_payment'));
router.get('/prepayments/:id/audit', auditSub('vendor_prepayment'));

export default router;
