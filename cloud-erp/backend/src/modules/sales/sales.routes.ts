import { Router, Request, Response } from 'express';
import db from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { getPaginationParams, buildPaginatedResult } from '../../utils/pagination';
import { generateTransactionNumber } from '../../utils/sequence';
import { createAuditLog } from '../../utils/audit';
import { attachAuditRoute, logTransaction, fetchJEWithLines } from '../../utils/transactionAudit';
import { AccountingEngine } from '../../engines/accounting/accountingEngine';
import { InventoryEngine } from '../../engines/inventory/inventoryEngine';
import { AppError } from '../../middleware/errorHandler';

const router = Router();
router.use(authenticate);

// ===== QUOTATIONS =====
router.get('/quotations', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, sortBy, sortDir, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    let query = db('quotations as q').join('customers as c', 'q.customer_id', 'c.id')
      .leftJoin('users as u', 'q.sales_rep_id', 'u.id')
      .where({ 'q.company_id': companyId, 'q.is_deleted': false })
      .select('q.*', 'c.name as customer_name', 'u.name as sales_rep_name');
    if (search) query = query.where((qb: any) => qb.whereILike('q.quotation_number', `%${search}%`).orWhereILike('c.name', `%${search}%`));
    if (req.query.status) query = query.where({ 'q.status': req.query.status });
    const total = parseInt((await query.clone().clearSelect().count('* as count').first() as any)?.count || '0');
    const data = await query.orderBy('q.quotation_date', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch quotations' }); }
});

router.get('/quotations/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const q = await db('quotations as qt').join('customers as c', 'qt.customer_id', 'c.id')
      .leftJoin('users as u', 'qt.sales_rep_id', 'u.id')
      .leftJoin('locations as l', 'qt.location_id', 'l.id')
      .where({ 'qt.id': req.params.id, 'qt.company_id': req.user!.companyId })
      .select('qt.*', 'c.name as customer_name', 'c.email as customer_email', 'c.phone as customer_phone',
        'c.billing_address', 'u.name as sales_rep_name', 'l.name as location_name')
      .first();
    if (!q) { res.status(404).json({ success: false, error: 'Quotation not found' }); return; }
    const lines = await db('quotation_lines as ql').join('items as i', 'ql.item_id', 'i.id')
      .leftJoin('units_of_measure as uom', 'ql.uom_id', 'uom.id')
      .leftJoin('tax_codes as tc', 'ql.tax_code_id', 'tc.id')
      .where({ 'ql.quotation_id': q.id }).orderBy('ql.line_number')
      .select('ql.*', 'i.item_code', 'i.name as item_name', 'uom.code as uom_code', 'tc.code as tax_code_code', 'tc.rate as tax_rate');
    res.json({ success: true, data: { ...q, lines } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch quotation' }); }
});

router.post('/quotations', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    if (!d.customerId || !d.quotationDate) {
      res.status(400).json({ success: false, error: 'Customer and date are required' }); return;
    }
    const qtNumber = await generateTransactionNumber(companyId, 'quotation', db);
    const lines = d.lines || [];
    let subtotal = 0, taxAmount = 0;
    for (const line of lines) {
      const amt = (line.quantity * line.unitPrice) - (line.discountAmount || 0);
      subtotal += amt;
      taxAmount += line.taxAmount || 0;
    }
    const [qt] = await db('quotations').insert({
      company_id: companyId, subsidiary_id: d.subsidiaryId || null,
      quotation_number: qtNumber, customer_id: d.customerId,
      quotation_date: d.quotationDate, expiry_date: d.expiryDate || null,
      currency: d.currency || 'IDR', exchange_rate: d.exchangeRate || 1,
      price_level: d.priceLevel, sales_rep_id: d.salesRepId || req.user!.id,
      location_id: d.locationId || null, department_id: d.departmentId || null,
      status: 'draft', memo: d.memo,
      subtotal, discount_amount: d.discountAmount || 0, tax_amount: taxAmount,
      shipping_amount: d.shippingAmount || 0,
      total_amount: subtotal + taxAmount + (d.shippingAmount || 0) - (d.discountAmount || 0),
      created_by: req.user!.id,
    }).returning('*');
    if (lines.length > 0) {
      await db('quotation_lines').insert(lines.map((l: any, idx: number) => ({
        quotation_id: qt.id, line_number: idx + 1, item_id: l.itemId, description: l.description,
        quantity: l.quantity, uom_id: l.uomId || null, unit_price: l.unitPrice,
        discount_percent: l.discountPercent || 0, discount_amount: l.discountAmount || 0,
        tax_code_id: l.taxCodeId || null, tax_amount: l.taxAmount || 0,
        amount: (l.quantity * l.unitPrice) - (l.discountAmount || 0),
      })));
    }
    res.status(201).json({ success: true, data: qt });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to create quotation' }); }
});

// Convert Quotation to Sales Order
router.post('/quotations/:id/convert', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const qt = await db('quotations').where({ id: req.params.id, company_id: companyId, is_deleted: false }).first();
    if (!qt) { res.status(404).json({ success: false, error: 'Quotation not found' }); return; }
    if (!['approved', 'submitted', 'draft'].includes(qt.status)) {
      res.status(400).json({ success: false, error: `Cannot convert a quotation with status: ${qt.status}` }); return;
    }
    const qtLines = await db('quotation_lines').where({ quotation_id: qt.id }).orderBy('line_number');
    const soNumber = await generateTransactionNumber(companyId, 'sales_order', db);
    const [so] = await db('sales_orders').insert({
      company_id: companyId, subsidiary_id: qt.subsidiary_id, so_number: soNumber,
      quotation_id: qt.id, customer_id: qt.customer_id, order_date: new Date().toISOString().split('T')[0],
      currency: qt.currency, exchange_rate: qt.exchange_rate, payment_terms: req.body.paymentTerms,
      sales_rep_id: qt.sales_rep_id, location_id: qt.location_id, department_id: qt.department_id,
      status: 'pending_fulfillment', memo: qt.memo,
      subtotal: qt.subtotal, discount_amount: qt.discount_amount, tax_amount: qt.tax_amount,
      shipping_amount: qt.shipping_amount, total_amount: qt.total_amount,
      approved_by: req.user!.id, approved_at: new Date(), created_by: req.user!.id,
    }).returning('*');
    if (qtLines.length > 0) {
      await db('sales_order_lines').insert(qtLines.map((l: any) => ({
        so_id: so.id, line_number: l.line_number, item_id: l.item_id, description: l.description,
        quantity: l.quantity, uom_id: l.uom_id, unit_price: l.unit_price,
        discount_percent: l.discount_percent, discount_amount: l.discount_amount,
        tax_code_id: l.tax_code_id, tax_amount: l.tax_amount, amount: l.amount,
      })));
    }
    await db('quotations').where({ id: qt.id }).update({ status: 'converted', updated_by: req.user!.id });
    res.json({ success: true, data: so, message: 'Quotation converted to Sales Order' });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to convert quotation' }); }
});

// ===== SALES ORDERS =====
router.get('/orders', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, sortDir, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    let query = db('sales_orders as so').join('customers as c', 'so.customer_id', 'c.id')
      .leftJoin('users as u', 'so.sales_rep_id', 'u.id')
      .leftJoin('locations as l', 'so.location_id', 'l.id')
      .where({ 'so.company_id': companyId, 'so.is_deleted': false })
      .select('so.*', 'c.name as customer_name', 'u.name as sales_rep_name', 'l.name as location_name');
    if (search) query = query.where((qb: any) => qb.whereILike('so.so_number', `%${search}%`).orWhereILike('c.name', `%${search}%`));
    if (req.query.status) query = query.where({ 'so.status': req.query.status });
    if (req.query.customerId) query = query.where({ 'so.customer_id': req.query.customerId });
    const total = parseInt((await query.clone().clearSelect().count('* as count').first() as any)?.count || '0');
    const data = await query.orderBy('so.order_date', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch sales orders' }); }
});

router.get('/orders/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const so = await db('sales_orders as so').join('customers as c', 'so.customer_id', 'c.id')
      .leftJoin('users as u', 'so.sales_rep_id', 'u.id')
      .leftJoin('locations as l', 'so.location_id', 'l.id')
      .leftJoin('users as ab', 'so.approved_by', 'ab.id')
      .where({ 'so.id': req.params.id, 'so.company_id': req.user!.companyId })
      .select('so.*', 'c.name as customer_name', 'c.email as customer_email', 'c.billing_address',
        'c.payment_terms as customer_payment_terms', 'u.name as sales_rep_name',
        'l.name as location_name', 'ab.name as approved_by_name')
      .first();
    if (!so) { res.status(404).json({ success: false, error: 'Sales order not found' }); return; }
    const lines = await db('sales_order_lines as sol').join('items as i', 'sol.item_id', 'i.id')
      .leftJoin('units_of_measure as uom', 'sol.uom_id', 'uom.id')
      .leftJoin('tax_codes as tc', 'sol.tax_code_id', 'tc.id')
      .where({ 'sol.so_id': so.id }).orderBy('sol.line_number')
      .select('sol.*', 'i.item_code', 'i.name as item_name', 'uom.code as uom_code', 'tc.code as tax_code', 'tc.rate as tax_rate');
    const fulfillments = await db('item_fulfillments').where({ so_id: so.id });
    const invoices = await db('invoices').where({ so_id: so.id, is_deleted: false });
    const journalEntries = await fetchJEWithLines('sales_order', so.id, db);
    res.json({ success: true, data: { ...so, lines, fulfillments, invoices, journalEntries } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch sales order' }); }
});

router.post('/orders', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    if (!d.customerId || !d.orderDate) {
      res.status(400).json({ success: false, error: 'Customer and order date are required' }); return;
    }
    const soNumber = await generateTransactionNumber(companyId, 'sales_order', db);
    const lines = d.lines || [];
    let subtotal = 0, taxAmount = 0;
    for (const line of lines) {
      const amt = (line.quantity * line.unitPrice) * (1 - (line.discountPercent || 0) / 100);
      subtotal += amt;
      taxAmount += line.taxAmount || 0;
    }
    const [so] = await db('sales_orders').insert({
      company_id: companyId, subsidiary_id: d.subsidiaryId || null, so_number: soNumber,
      customer_id: d.customerId, order_date: d.orderDate, expected_ship_date: d.expectedShipDate,
      currency: d.currency || 'IDR', exchange_rate: d.exchangeRate || 1,
      payment_terms: d.paymentTerms, sales_rep_id: d.salesRepId || req.user!.id,
      location_id: d.locationId || null, department_id: d.departmentId || null,
      shipping_address: d.shippingAddress, shipping_method: d.shippingMethod,
      status: 'pending_approval', memo: d.memo,
      subtotal, discount_amount: d.discountAmount || 0, tax_amount: taxAmount,
      shipping_amount: d.shippingAmount || 0,
      total_amount: subtotal + taxAmount + (d.shippingAmount || 0) - (d.discountAmount || 0),
      created_by: req.user!.id,
    }).returning('*');
    if (lines.length > 0) {
      await db('sales_order_lines').insert(lines.map((l: any, idx: number) => ({
        so_id: so.id, line_number: idx + 1, item_id: l.itemId, description: l.description,
        quantity: l.quantity, uom_id: l.uomId || null, unit_price: l.unitPrice,
        discount_percent: l.discountPercent || 0, discount_amount: l.discountAmount || 0,
        tax_code_id: l.taxCodeId || null, tax_amount: l.taxAmount || 0,
        amount: (l.quantity * l.unitPrice) * (1 - (l.discountPercent || 0) / 100),
        expected_ship_date: l.expectedShipDate,
      })));
    }
    await createAuditLog({ companyId, userId: req.user!.id, action: 'create', entityType: 'sales_order', entityId: so.id, entityNumber: so.so_number });
    res.status(201).json({ success: true, data: so });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to create sales order' }); }
});

// Approve Sales Order
router.post('/orders/:id/approve', async (req: Request, res: Response): Promise<void> => {
  try {
    const so = await db('sales_orders').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!so) { res.status(404).json({ success: false, error: 'Sales order not found' }); return; }
    if (so.status !== 'pending_approval') {
      res.status(400).json({ success: false, error: `Cannot approve a sales order with status: ${so.status}` }); return;
    }
    const [updated] = await db('sales_orders').where({ id: so.id })
      .update({ status: 'pending_fulfillment', approved_by: req.user!.id, approved_at: new Date() })
      .returning('*');
    await createAuditLog({ companyId: req.user!.companyId, userId: req.user!.id, action: 'approve', entityType: 'sales_order', entityId: so.id, entityNumber: so.so_number });
    res.json({ success: true, data: updated, message: 'Sales order approved' });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to approve sales order' }); }
});

router.post('/orders/:id/reject', async (req: Request, res: Response): Promise<void> => {
  try {
    const so = await db('sales_orders').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!so) { res.status(404).json({ success: false, error: 'Sales order not found' }); return; }
    if (!['pending_approval', 'pending_fulfillment'].includes(so.status)) {
      res.status(400).json({ success: false, error: `Cannot reject a sales order with status: ${so.status}` }); return;
    }
    const reason = req.body.reason || 'Rejected by approver';
    const [updated] = await db('sales_orders').where({ id: so.id })
      .update({ status: 'cancelled', memo: `${so.memo || ''}\n[REJECTED] ${reason}`.trim(), updated_by: req.user!.id })
      .returning('*');
    await createAuditLog({ companyId: req.user!.companyId, userId: req.user!.id, action: 'reject', entityType: 'sales_order', entityId: so.id, entityNumber: so.so_number });
    res.json({ success: true, data: updated, message: 'Sales order rejected' });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to reject sales order' }); }
});

// Create Fulfillment from Sales Order
router.post('/orders/:id/fulfill', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const so = await db('sales_orders').where({ id: req.params.id, company_id: companyId }).first();
    if (!so) { res.status(404).json({ success: false, error: 'Sales order not found' }); return; }
    if (!['pending_fulfillment', 'partially_fulfilled'].includes(so.status)) {
      res.status(400).json({ success: false, error: `Sales order cannot be fulfilled in status: ${so.status}` }); return;
    }

    await db.transaction(async (trx) => {
      const ffNumber = await generateTransactionNumber(companyId, 'fulfillment', trx);
      const d = req.body;
      const [ff] = await trx('item_fulfillments').insert({
        company_id: companyId, fulfillment_number: ffNumber, so_id: so.id,
        customer_id: so.customer_id, fulfillment_date: d.fulfillmentDate || new Date().toISOString().split('T')[0],
        location_id: d.locationId || so.location_id, warehouse_id: d.warehouseId || null,
        shipping_address: so.shipping_address, tracking_number: d.trackingNumber, carrier: d.carrier,
        status: 'shipped', memo: d.memo, created_by: req.user!.id,
      }).returning('*');

      const lines = d.lines || [];
      if (lines.length > 0) {
        await trx('item_fulfillment_lines').insert(lines.map((l: any) => ({
          fulfillment_id: ff.id, so_line_id: l.soLineId, item_id: l.itemId,
          quantity: l.quantity, uom_id: l.uomId || null, bin_id: l.binId || null,
          lot_number: l.lotNumber, serial_number: l.serialNumber,
        })));

        // Update SO line fulfilled quantities
        for (const line of lines) {
          await trx('sales_order_lines').where({ id: line.soLineId }).increment('qty_fulfilled', line.quantity);
          // Move inventory
          await InventoryEngine.createTransaction({
            companyId, transactionType: 'inventory_transfer',
            referenceType: 'item_fulfillment', referenceId: ff.id,
            transactionDate: ff.fulfillment_date,
            locationId: d.locationId || so.location_id, warehouseId: d.warehouseId,
            memo: `Fulfillment for SO ${so.so_number}`,
            lines: [{ itemId: line.itemId, quantity: line.quantity, direction: 'out', warehouseId: d.warehouseId }],
            createdBy: req.user!.id, trx,
          });
        }
      }

      // Update SO status
      const allLines = await trx('sales_order_lines').where({ so_id: so.id });
      const allFulfilled = allLines.every((l: any) => l.qty_fulfilled >= l.quantity);
      const anyFulfilled = allLines.some((l: any) => l.qty_fulfilled > 0);
      const newStatus = allFulfilled ? 'pending_billing' : anyFulfilled ? 'partially_fulfilled' : so.status;
      await trx('sales_orders').where({ id: so.id }).update({ status: newStatus });

      // GL Impact: Dr. COGS  Cr. Finished Goods Inventory
      try {
        await AccountingEngine.postItemFulfillment(ff.id, req.user!.id, trx);
      } catch (glErr: any) {
        console.error('[GL WARNING] Item Fulfillment GL skipped:', glErr.message);
        // Non-blocking: fulfillment still completes even if GL has no cost data
      }

      res.json({ success: true, data: ff, message: 'Fulfillment created successfully' });
    });
  } catch (e: any) {
    console.error("[ERP ERROR]", e.message);
    res.status(500).json({ success: false, error: e.message || 'Failed to create fulfillment' });
  }
});

// Create Invoice from Sales Order
router.post('/orders/:id/invoice', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const so = await db('sales_orders').where({ id: req.params.id, company_id: companyId }).first();
    if (!so) { res.status(404).json({ success: false, error: 'Sales order not found' }); return; }
    if (!['pending_billing', 'partially_fulfilled', 'partially_billed'].includes(so.status)) {
      res.status(400).json({ success: false, error: `Cannot invoice sales order with status: ${so.status}` }); return;
    }

    await db.transaction(async (trx) => {
      const invNumber = await generateTransactionNumber(companyId, 'invoice', trx);
      const customer = await trx('customers').where({ id: so.customer_id }).first();
      const soLines = await trx('sales_order_lines').where({ so_id: so.id });
      const d = req.body;
      const invoiceDate = d.invoiceDate || new Date().toISOString().split('T')[0];

      // Calculate due date
      const terms = so.payment_terms || 'Net30';
      const days = parseInt(terms.replace('Net', '')) || 30;
      const dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + days);

      const [inv] = await trx('invoices').insert({
        company_id: companyId, subsidiary_id: so.subsidiary_id,
        invoice_number: invNumber, so_id: so.id, customer_id: so.customer_id,
        invoice_date: invoiceDate, due_date: dueDate.toISOString().split('T')[0],
        currency: so.currency, exchange_rate: so.exchange_rate,
        payment_terms: so.payment_terms, location_id: so.location_id, department_id: so.department_id,
        status: 'open', memo: d.memo || so.memo,
        subtotal: so.subtotal, discount_amount: so.discount_amount, tax_amount: so.tax_amount,
        shipping_amount: so.shipping_amount, total_amount: so.total_amount,
        amount_paid: 0, amount_due: so.total_amount,
        ar_account_id: customer.ar_account_id,
        is_posted: false, created_by: req.user!.id,
      }).returning('*');

      // Create invoice lines
      const lineInserts: any[] = [];
      for (const line of soLines) {
        const item = await trx('items').where({ id: line.item_id }).first();
        const unitCostForCOGS = item?.average_cost || 0;
        lineInserts.push({
          invoice_id: inv.id, so_line_id: line.id, line_number: line.line_number,
          item_id: line.item_id, description: line.description, quantity: line.quantity,
          uom_id: line.uom_id, unit_price: line.unit_price,
          discount_percent: line.discount_percent, discount_amount: line.discount_amount,
          tax_code_id: line.tax_code_id, tax_amount: line.tax_amount, amount: line.amount,
          income_account_id: item?.income_account_id, cogs_account_id: item?.cogs_account_id,
          cogs_amount: line.quantity * unitCostForCOGS,
        });
      }
      if (lineInserts.length > 0) await trx('invoice_lines').insert(lineInserts);

      // Auto-post invoice (create GL entries)
      await AccountingEngine.postInvoice(inv.id, req.user!.id, trx);

      // Update SO line billed quantities and status
      for (const line of soLines) {
        await trx('sales_order_lines').where({ id: line.id }).update({ qty_billed: line.quantity });
      }
      const allBilled = soLines.every((l: any) => l.quantity <= l.qty_billed + l.quantity);
      await trx('sales_orders').where({ id: so.id }).update({ status: allBilled ? 'billed' : 'partially_billed' });

      // Re-fetch invoice to get updated is_posted flag
      const finalInv = await trx('invoices').where({ id: inv.id }).first();
      res.json({ success: true, data: finalInv, message: 'Invoice created and posted' });
    });
  } catch (e: any) {
    console.error("[ERP ERROR]", e.message);
    res.status(500).json({ success: false, error: e.message || 'Failed to create invoice' });
  }
});

// ===== ITEM FULFILLMENTS =====
router.get('/fulfillments', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    let query = db('item_fulfillments as ff')
      .join('customers as c', 'ff.customer_id', 'c.id')
      .join('sales_orders as so', 'ff.so_id', 'so.id')
      .leftJoin('locations as l', 'ff.location_id', 'l.id')
      .where({ 'ff.company_id': companyId })
      .select('ff.*', 'c.name as customer_name', 'so.so_number', 'l.name as location_name');
    if (search) query = query.where((qb: any) => qb.whereILike('ff.fulfillment_number', `%${search}%`).orWhereILike('c.name', `%${search}%`));
    if (req.query.soId) query = query.where({ 'ff.so_id': req.query.soId });
    if (req.query.status) query = query.where({ 'ff.status': req.query.status });
    const total = parseInt((await query.clone().clearSelect().count('ff.id as count').first() as any)?.count || '0');
    const data = await query.orderBy('ff.fulfillment_date', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to fetch fulfillments' }); }
});

router.get('/fulfillments/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const ff = await db('item_fulfillments as ff')
      .join('customers as c', 'ff.customer_id', 'c.id')
      .join('sales_orders as so', 'ff.so_id', 'so.id')
      .leftJoin('locations as l', 'ff.location_id', 'l.id')
      .where({ 'ff.id': req.params.id, 'ff.company_id': req.user!.companyId })
      .select('ff.*', 'c.name as customer_name', 'c.billing_address', 'c.email as customer_email',
        'so.so_number', 'so.shipping_address', 'l.name as location_name')
      .first();
    if (!ff) { res.status(404).json({ success: false, error: 'Fulfillment not found' }); return; }
    const lines = await db('item_fulfillment_lines as ffl')
      .join('items as i', 'ffl.item_id', 'i.id')
      .leftJoin('units_of_measure as uom', 'i.base_uom_id', 'uom.id')
      .leftJoin('sales_order_lines as sol', 'ffl.so_line_id', 'sol.id')
      .where({ 'ffl.fulfillment_id': ff.id })
      .select('ffl.*', 'i.item_code', 'i.name as item_name', 'uom.code as uom_code', 'sol.unit_price', 'sol.description');
    const journalEntries = await fetchJEWithLines('item_fulfillment', ff.id, db);
    res.json({ success: true, data: { ...ff, lines, journalEntries } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to fetch fulfillment' }); }
});

// ===== INVOICES =====
router.get('/invoices', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, sortDir, search } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    let query = db('invoices as i').join('customers as c', 'i.customer_id', 'c.id')
      .where({ 'i.company_id': companyId, 'i.is_deleted': false })
      .select('i.*', 'c.name as customer_name');
    if (search) query = query.where((qb: any) => qb.whereILike('i.invoice_number', `%${search}%`).orWhereILike('c.name', `%${search}%`));
    if (req.query.status) query = query.where({ 'i.status': req.query.status });
    if (req.query.customerId) query = query.where({ 'i.customer_id': req.query.customerId });
    if (req.query.overdue === 'true') query = query.where('i.due_date', '<', new Date()).whereNotIn('i.status', ['paid', 'voided']);
    const total = parseInt((await query.clone().clearSelect().count('* as count').first() as any)?.count || '0');
    const data = await query.orderBy('i.invoice_date', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch invoices' }); }
});

router.get('/invoices/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const inv = await db('invoices as i').join('customers as c', 'i.customer_id', 'c.id')
      .leftJoin('locations as l', 'i.location_id', 'l.id')
      .where({ 'i.id': req.params.id, 'i.company_id': req.user!.companyId })
      .select('i.*', 'c.name as customer_name', 'c.email as customer_email', 'c.billing_address', 'c.tax_id as customer_tax_id', 'l.name as location_name')
      .first();
    if (!inv) { res.status(404).json({ success: false, error: 'Invoice not found' }); return; }
    const lines = await db('invoice_lines as il').join('items as itm', 'il.item_id', 'itm.id')
      .leftJoin('tax_codes as tc', 'il.tax_code_id', 'tc.id')
      .where({ 'il.invoice_id': inv.id }).orderBy('il.line_number')
      .select('il.*', 'itm.item_code', 'itm.name as item_name', 'tc.code as tax_code', 'tc.rate as tax_rate');
    const payments = await db('payment_applications as pa').join('customer_payments as cp', 'pa.payment_id', 'cp.id')
      .where({ 'pa.invoice_id': inv.id }).select('pa.*', 'cp.payment_number', 'cp.payment_date', 'cp.payment_method');
    const journalEntries = await fetchJEWithLines('invoice', inv.id, db);
    res.json({ success: true, data: { ...inv, lines, payments, journalEntries } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch invoice' }); }
});

// Create Invoice directly (manual invoice or from form)
router.post('/invoices', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    if (!d.customerId || !d.invoiceDate) {
      res.status(400).json({ success: false, error: 'Customer and invoice date are required' }); return;
    }

    const invoice = await db.transaction(async (trx) => {
      const invNumber = await generateTransactionNumber(companyId, 'invoice', trx);
      const customer = await trx('customers').where({ id: d.customerId, company_id: companyId }).first();
      if (!customer) throw new AppError('Customer not found', 404);

      // Calculate due date if not provided
      let dueDate = d.dueDate;
      if (!dueDate && customer.payment_terms) {
        const days = parseInt(customer.payment_terms.replace(/\D/g, '')) || 30;
        const invDate = new Date(d.invoiceDate);
        invDate.setDate(invDate.getDate() + days);
        dueDate = invDate.toISOString().split('T')[0];
      }

      // Calculate totals from lines
      const subtotal = (d.lines || []).reduce((s: number, l: any) => s + parseFloat(l.amount || 0), 0);
      const taxTotal = (d.lines || []).reduce((s: number, l: any) => s + parseFloat(l.taxAmount || 0), 0);
      const total = subtotal + taxTotal;

      const [inv] = await trx('invoices').insert({
        company_id: companyId,
        invoice_number: invNumber,
        customer_id: d.customerId,
        so_id: d.soId || null,
        invoice_date: d.invoiceDate,
        due_date: dueDate || d.invoiceDate,
        currency: d.currency || 'IDR',
        exchange_rate: d.exchangeRate || 1,
        discount_amount: d.discountAmount || 0,
        tax_amount: taxTotal,
        shipping_amount: d.shippingAmount || 0,
        total_amount: total,
        amount_due: total,
        status: 'open',
        memo: d.memo || '',
        location_id: d.locationId || null,
        created_by: req.user!.id,
      }).returning('*');

      // Insert lines
      if (d.lines && d.lines.length > 0) {
        const lineInserts = d.lines.map((l: any, idx: number) => ({
          invoice_id: inv.id,
          line_number: idx + 1,
          item_id: l.itemId,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unitPrice,
          discount_percent: l.discountPercent || 0,
          tax_amount: l.taxAmount || 0,
          amount: l.amount,
        }));
        await trx('invoice_lines').insert(lineInserts);
      }

      // Auto-post GL entries (Dr AR, Cr Revenue)
      const arAccount = await trx('accounts').where({ company_id: companyId, code: '1100' }).first();
      const revenueAccount = await trx('accounts').where({ company_id: companyId, code: '4100' }).first();
      
      if (arAccount && revenueAccount) {
        const jeNumber = await generateTransactionNumber(companyId, 'journal_entry', trx);
        const [je] = await trx('journal_entries').insert({
          company_id: companyId,
          journal_number: jeNumber,
          entry_date: d.invoiceDate,
          source_type: 'invoice',
          source_id: inv.id,
          status: 'posted',
          memo: `Invoice ${invNumber} - ${customer.name}`,
          created_by: req.user!.id,
        }).returning('*');

        await trx('journal_entry_lines').insert([
          { journal_id: je.id, line_number: 1, account_id: arAccount.id, debit: total, credit: 0, memo: `AR - ${customer.name}` },
          { journal_id: je.id, line_number: 2, account_id: revenueAccount.id, debit: 0, credit: total, memo: `Revenue - ${invNumber}` },
        ]);
      }

      return inv;
    });

    res.json({ success: true, data: invoice });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: e.message || 'Failed to create invoice' }); }
});

// Record Customer Payment
router.post('/payments', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const d = req.body;
    if (!d.customerId || !d.amount || !d.paymentDate) {
      res.status(400).json({ success: false, error: 'Customer, amount and date are required' }); return;
    }

    await db.transaction(async (trx) => {
      const payNumber = await generateTransactionNumber(companyId, 'customer_payment', trx);
      const customer = await trx('customers').where({ id: d.customerId }).first();
      const [payment] = await trx('customer_payments').insert({
        company_id: companyId, payment_number: payNumber,
        customer_id: d.customerId, payment_date: d.paymentDate,
        payment_method: d.paymentMethod || 'bank_transfer', reference: d.reference,
        currency: d.currency || 'IDR', exchange_rate: d.exchangeRate || 1,
        amount: d.amount, unapplied_amount: d.amount,
        bank_account_id: d.bankAccountId, ar_account_id: customer?.ar_account_id,
        status: 'open', memo: d.memo, is_posted: false, created_by: req.user!.id,
      }).returning('*');

      // Apply to invoices
      if (d.applications && d.applications.length > 0) {
        let remaining = parseFloat(d.amount);
        for (const app of d.applications) {
          if (remaining <= 0) break;
          const invoice = await trx('invoices').where({ id: app.invoiceId }).first();
          if (!invoice || invoice.amount_due <= 0) continue;
          const applyAmount = Math.min(remaining, parseFloat(invoice.amount_due), parseFloat(app.amount || invoice.amount_due));
          await trx('payment_applications').insert({ payment_id: payment.id, invoice_id: app.invoiceId, applied_amount: applyAmount });
          const newAmountPaid = parseFloat(invoice.amount_paid) + applyAmount;
          const newAmountDue = parseFloat(invoice.total_amount) - newAmountPaid;
          const newStatus = newAmountDue <= 0 ? 'paid' : 'partially_paid';
          await trx('invoices').where({ id: app.invoiceId }).update({ amount_paid: newAmountPaid, amount_due: newAmountDue, status: newStatus });
          remaining -= applyAmount;
        }
        await trx('customer_payments').where({ id: payment.id }).update({ unapplied_amount: Math.max(0, remaining), status: remaining <= 0 ? 'applied' : 'open' });
      }

      // Post GL entry
      await AccountingEngine.postCustomerPayment(payment.id, req.user!.id, trx);

      res.status(201).json({ success: true, data: payment, message: 'Payment recorded and posted' });
    });
  } catch (e: any) {
    console.error("[ERP ERROR]", e.message);
    res.status(500).json({ success: false, error: e.message || 'Failed to record payment' });
  }
});

router.get('/payments', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const companyId = req.user!.companyId;
    const query = db('customer_payments as cp').join('customers as c', 'cp.customer_id', 'c.id')
      .where({ 'cp.company_id': companyId, 'cp.is_deleted': false })
      .select('cp.*', 'c.name as customer_name');
    const total = parseInt((await query.clone().clearSelect().count('* as count').first() as any)?.count || '0');
    const data = await query.orderBy('cp.payment_date', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ success: true, ...buildPaginatedResult(data, total, page, limit) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch payments' }); }
});

router.get('/payments/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const payment = await db('customer_payments as cp')
      .join('customers as c', 'cp.customer_id', 'c.id')
      .leftJoin('accounts as ba', 'cp.bank_account_id', 'ba.id')
      .leftJoin('accounts as ara', 'cp.ar_account_id', 'ara.id')
      .where({ 'cp.id': req.params.id, 'cp.company_id': req.user!.companyId, 'cp.is_deleted': false })
      .select('cp.*', 'c.name as customer_name', 'c.email as customer_email',
        'ba.code as bank_account_code', 'ba.name as bank_account_name',
        'ara.code as ar_account_code', 'ara.name as ar_account_name')
      .first();
    if (!payment) { res.status(404).json({ success: false, error: 'Payment not found' }); return; }
    const applications = await db('payment_applications as pa')
      .join('invoices as i', 'pa.invoice_id', 'i.id')
      .where({ 'pa.payment_id': payment.id })
      .select('pa.*', 'i.invoice_number', 'i.invoice_date', 'i.due_date', 'i.total_amount', 'i.status as invoice_status');
    const journalEntries = await db('journal_entries')
      .where({ source_type: 'customer_payment', source_id: payment.id }).orderBy('entry_date');
    res.json({ success: true, data: { ...payment, applications, journalEntries } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to fetch payment' }); }
});

export default router;
router.get('/stock', async (req: Request, res: Response): Promise<void> => {
  try {
    const { itemIds, locationId } = req.query;
    if (!itemIds) { res.status(400).json({ success: false, error: 'itemIds required' }); return; }
    
    const ids = (itemIds as string).split(',');
    const query = db('inventory_balances as ib')
      .whereIn('ib.item_id', ids)
      .where({ 'ib.company_id': req.user!.companyId })
      .groupBy('ib.item_id')
      .select(
        'ib.item_id',
        db.raw('COALESCE(SUM(ib.qty_on_hand), 0) as qty_on_hand'),
        db.raw('COALESCE(SUM(ib.qty_committed), 0) as qty_committed'),
        db.raw('COALESCE(SUM(ib.qty_on_hand) - SUM(ib.qty_committed), 0) as qty_available')
      );
    
    if (locationId) query.where({ 'ib.location_id': locationId });
    
    const rows = await query;
    const stockMap = rows.reduce((acc: any, r: any) => {
      acc[r.item_id] = {
        onHand: parseFloat(r.qty_on_hand),
        committed: parseFloat(r.qty_committed),
        available: parseFloat(r.qty_available),
      };
      return acc;
    }, {});
    
    res.json({ success: true, data: stockMap });
  } catch (e: any) { console.error("[ERP ERROR]", e.message); res.status(500).json({ success: false, error: 'Failed to fetch stock' }); }
});

// ─── Customer Deposits ────────────────────────────────────────────────────────
router.get('/deposits', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('customer_deposits as cd')
      .leftJoin('customers as c', 'cd.customer_id', 'c.id')
      .where({ 'cd.company_id': req.user!.companyId })
      .select('cd.*', 'c.name as customer_name')
      .orderBy('cd.deposit_date', 'desc').limit(100);
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to fetch deposits' }); }
});

router.post('/deposits', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.customerId) { res.status(400).json({ success: false, error: 'Customer is required' }); return; }
    if (!d.amount || Number(d.amount) <= 0) { res.status(400).json({ success: false, error: 'Amount must be > 0' }); return; }
    if (!d.bankAccountId) { res.status(400).json({ success: false, error: 'Bank Account is required' }); return; }

    const depNumber = `CDEP-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const [deposit] = await db('customer_deposits').insert({
      company_id: companyId,
      deposit_number: depNumber,
      customer_id: d.customerId,
      deposit_date: d.depositDate || new Date(),
      amount: Number(d.amount),
      bank_account_id: d.bankAccountId,
      payment_method: d.paymentMethod || 'bank_transfer',
      reference: d.reference || null,
      sales_order_id: d.salesOrderId || null,
      memo: d.memo || null,
      status: 'posted',
      created_by: req.user!.id,
    }).returning('*');

    // ── GL: Dr. Bank / Cr. Customer Deposit Liability (2210) ──────────────────
    try {
      // Get Customer Deposit Liability account (2210)
      let custDepAcct = await db('accounts').where({ company_id: companyId, code: '2210' }).first();
      if (!custDepAcct) {
        const [a] = await db('accounts').insert({
          company_id: companyId, code: '2210', name: 'Customer Deposit Liability',
          type: 'liability', subtype: 'other_current_liability', is_active: true,
        }).returning('*');
        custDepAcct = a;
      }
      const bankAcct = await db('accounts').where({ id: d.bankAccountId }).first();
      if (custDepAcct && bankAcct) {
        const jeNum = `JE-CDEP-${String(Date.now()).slice(-8)}`;
        const [je] = await db('journal_entries').insert({
          company_id: companyId, journal_number: jeNum,
          entry_date: d.depositDate || new Date(),
          memo: `Customer Deposit ${depNumber}`,
          source_type: 'customer_deposit', source_id: deposit.id || deposit,
          status: 'posted', created_by: req.user!.id,
        }).returning('id');
        const jeId = je?.id || je;
        await db('journal_entry_lines').insert([
          { journal_id: jeId, line_number: 1, account_id: bankAcct.id,    debit: Number(d.amount), credit: 0,              memo: `Cash received from customer` },
          { journal_id: jeId, line_number: 2, account_id: custDepAcct.id, debit: 0,                credit: Number(d.amount), memo: `Customer deposit liability` },
        ]);
      }
    } catch (glErr: any) { console.error('[GL ERROR] Customer Deposit GL:', glErr.message); }

    res.status(201).json({ success: true, data: { ...deposit, deposit_number: depNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to record deposit' }); }
});

// ─── Return Authorizations ────────────────────────────────────────────────────
router.get('/return-authorizations', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('return_authorizations as ra')
      .leftJoin('customers as c', 'ra.customer_id', 'c.id')
      .where({ 'ra.company_id': req.user!.companyId })
      .select('ra.*', 'c.name as customer_name')
      .orderBy('ra.return_date', 'desc').limit(100);
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to fetch return authorizations' }); }
});

router.post('/return-authorizations', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.customerId) { res.status(400).json({ success: false, error: 'Customer is required' }); return; }

    const raNumber = `RA-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const totalAmount = (d.lines || []).reduce((s: number, l: any) => s + Number(l.qty || 0) * Number(l.unitPrice || 0), 0);

    const [ra] = await db('return_authorizations').insert({
      company_id: companyId,
      ra_number: raNumber,
      customer_id: d.customerId,
      return_date: d.returnDate || new Date(),
      original_invoice_number: d.originalInvoiceNumber || null,
      return_reason: d.returnReason || null,
      location_id: d.locationId || null,
      memo: d.memo || null,
      total_amount: totalAmount,
      status: 'open',
      created_by: req.user!.id,
    }).returning('*');

    for (const line of d.lines || []) {
      await db('return_authorization_lines').insert({
        ra_id: ra.id,
        item_id: line.itemId || null,
        description: line.description || null,
        qty: Number(line.qty || 0),
        unit_price: Number(line.unitPrice || 0),
      });
    }

    res.status(201).json({ success: true, data: { ...ra, ra_number: raNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to create return authorization' }); }
});

// ─── Credit Memos ─────────────────────────────────────────────────────────────
router.get('/credit-memos', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('credit_memos as cm')
      .leftJoin('customers as c', 'cm.customer_id', 'c.id')
      .where({ 'cm.company_id': req.user!.companyId })
      .select('cm.*', 'c.name as customer_name')
      .orderBy('cm.memo_date', 'desc').limit(100);
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to fetch credit memos' }); }
});

router.post('/credit-memos', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.customerId) { res.status(400).json({ success: false, error: 'Customer is required' }); return; }

    const cmNumber = `CM-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const subtotal = (d.lines || []).reduce((s: number, l: any) => s + Number(l.qty || 0) * Number(l.unitPrice || 0), 0);
    const taxAmount = subtotal * (Number(d.taxRate || 0) / 100);
    const totalAmount = subtotal + taxAmount;

    const [cm] = await db('credit_memos').insert({
      company_id: companyId,
      memo_number: cmNumber,
      customer_id: d.customerId,
      memo_date: d.creditDate || new Date(),
      original_invoice_number: d.originalInvoiceNumber || null,
      reason: d.reason || null,
      tax_rate: Number(d.taxRate || 0),
      subtotal, tax_amount: taxAmount, total_amount: totalAmount,
      memo: d.memo || null,
      status: 'open',
      created_by: req.user!.id,
    }).returning('*');

    for (const line of d.lines || []) {
      await db('credit_memo_lines').insert({
        credit_memo_id: cm.id,
        item_id: line.itemId || null,
        description: line.description || null,
        qty: Number(line.qty || 0),
        unit_price: Number(line.unitPrice || 0),
      });
    }

    // ── GL: Dr. Sales Revenue (4100) / Cr. Accounts Receivable (1100) ─────────
    if (totalAmount > 0) {
      try {
        const salesAcct = await db('accounts').where({ company_id: companyId, code: '4100' }).first(); // Sales Revenue
        const arAcct = await db('accounts').where({ company_id: companyId, code: '1100' }).first(); // AR
        if (salesAcct && arAcct) {
          const jeNum = `JE-CM-${String(Date.now()).slice(-8)}`;
          const [je] = await db('journal_entries').insert({
            company_id: companyId, journal_number: jeNum,
            entry_date: d.creditDate || new Date(),
            memo: `Credit Memo ${cmNumber}`,
            source_type: 'credit_memo', source_id: cm.id || cm,
            status: 'posted', created_by: req.user!.id,
          }).returning('id');
          const jeId = je?.id || je;
          await db('journal_entry_lines').insert([
            { journal_id: jeId, line_number: 1, account_id: salesAcct.id, debit: totalAmount, credit: 0,           memo: `Reduce sales revenue` },
            { journal_id: jeId, line_number: 2, account_id: arAcct.id,    debit: 0,           credit: totalAmount, memo: `Reduce AR balance` },
          ]);
        }
      } catch (glErr: any) { console.error('[GL ERROR] Credit Memo GL:', glErr.message); }
    }

    // Reduce invoice balance if invoice specified
    if (d.originalInvoiceNumber) {
      try {
        await db('invoices')
          .where({ company_id: companyId, invoice_number: d.originalInvoiceNumber })
          .increment('amount_paid', totalAmount)
          .decrement('amount_due', totalAmount);
      } catch (invErr: any) { console.error('[INVOICE ERROR] Credit Memo application:', invErr.message); }
    }

    res.status(201).json({ success: true, data: { ...cm, credit_memo_number: cmNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to create credit memo' }); }
});

// ─── Refunds ──────────────────────────────────────────────────────────────────
router.get('/refunds', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('customer_refunds as cr')
      .leftJoin('customers as c', 'cr.customer_id', 'c.id')
      .where({ 'cr.company_id': req.user!.companyId })
      .select('cr.*', 'c.name as customer_name')
      .orderBy('cr.refund_date', 'desc').limit(100);
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to fetch refunds' }); }
});

router.post('/refunds', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.customerId) { res.status(400).json({ success: false, error: 'Customer is required' }); return; }
    if (!d.amount || Number(d.amount) <= 0) { res.status(400).json({ success: false, error: 'Amount must be > 0' }); return; }
    if (!d.bankAccountId) { res.status(400).json({ success: false, error: 'Bank Account is required' }); return; }

    const refundNumber = `REF-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const [refund] = await db('customer_refunds').insert({
      company_id: companyId,
      refund_number: refundNumber,
      customer_id: d.customerId,
      refund_date: d.refundDate || new Date(),
      amount: Number(d.amount),
      bank_account_id: d.bankAccountId,
      payment_method: d.paymentMethod || 'bank_transfer',
      reference: d.reference || null,
      credit_memo_number: d.creditMemoNumber || null,
      reason: d.reason || null,
      memo: d.memo || null,
      status: 'posted',
      created_by: req.user!.id,
    }).returning('*');

    // ── GL: Dr. Accounts Receivable (1100) / Cr. Bank ─────────────────────────
    try {
      const arAcct = await db('accounts').where({ company_id: companyId, code: '1100' }).first(); // AR
      const bankAcct = await db('accounts').where({ id: d.bankAccountId }).first();
      if (arAcct && bankAcct) {
        const jeNum = `JE-REF-${String(Date.now()).slice(-8)}`;
        const [je] = await db('journal_entries').insert({
          company_id: companyId, journal_number: jeNum,
          entry_date: d.refundDate || new Date(),
          memo: `Customer Refund ${refundNumber}`,
          source_type: 'customer_refund', source_id: refund.id || refund,
          status: 'posted', created_by: req.user!.id,
        }).returning('id');
        const jeId = je?.id || je;
        await db('journal_entry_lines').insert([
          { journal_id: jeId, line_number: 1, account_id: arAcct.id,    debit: Number(d.amount), credit: 0,              memo: `Increase AR for refund` },
          { journal_id: jeId, line_number: 2, account_id: bankAcct.id, debit: 0,                credit: Number(d.amount), memo: `Cash refund paid` },
        ]);
      }
    } catch (glErr: any) { console.error('[GL ERROR] Customer Refund GL:', glErr.message); }

    res.status(201).json({ success: true, data: { ...refund, refund_number: refundNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to record refund' }); }
});

// ── Audit routes for System Information tab ───────────────────────────────────
attachAuditRoute(router, 'sales_order');
// These need separate sub-paths, so add them explicitly:
router.get('/invoices/:id/audit', async (req: any, res: any) => {
  try { const l = await (db as any)('transaction_audit_log').where({ company_id: req.user.companyId, source_type: 'invoice', source_id: req.params.id }).orderBy('performed_at','desc').limit(200); res.json({ success:true, data:l }); } catch(e:any){ res.status(500).json({success:false,error:e.message}); }
});
router.get('/quotations/:id/audit', async (req: any, res: any) => {
  try { const l = await (db as any)('transaction_audit_log').where({ company_id: req.user.companyId, source_type: 'quotation', source_id: req.params.id }).orderBy('performed_at','desc').limit(200); res.json({ success:true, data:l }); } catch(e:any){ res.status(500).json({success:false,error:e.message}); }
});
router.get('/payments/:id/audit', async (req: any, res: any) => {
  try { const l = await (db as any)('transaction_audit_log').where({ company_id: req.user.companyId, source_type: 'customer_payment', source_id: req.params.id }).orderBy('performed_at','desc').limit(200); res.json({ success:true, data:l }); } catch(e:any){ res.status(500).json({success:false,error:e.message}); }
});
router.get('/fulfillments/:id/audit', async (req: any, res: any) => {
  try { const l = await (db as any)('transaction_audit_log').where({ company_id: req.user.companyId, source_type: 'item_fulfillment', source_id: req.params.id }).orderBy('performed_at','desc').limit(200); res.json({ success:true, data:l }); } catch(e:any){ res.status(500).json({success:false,error:e.message}); }
});
router.get('/return-authorizations/:id/audit', async (req: any, res: any) => {
  try { const l = await (db as any)('transaction_audit_log').where({ company_id: req.user.companyId, source_type: 'return_authorization', source_id: req.params.id }).orderBy('performed_at','desc').limit(200); res.json({ success:true, data:l }); } catch(e:any){ res.status(500).json({success:false,error:e.message}); }
});
router.get('/credit-memos/:id/audit', async (req: any, res: any) => {
  try { const l = await (db as any)('transaction_audit_log').where({ company_id: req.user.companyId, source_type: 'credit_memo', source_id: req.params.id }).orderBy('performed_at','desc').limit(200); res.json({ success:true, data:l }); } catch(e:any){ res.status(500).json({success:false,error:e.message}); }
});

export default router;
