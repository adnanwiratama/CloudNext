import { Router, Request, Response } from 'express';
import db from '../../config/database';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

// Dashboard KPIs
router.get('/dashboard', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const startOfYear = `${now.getFullYear()}-01-01`;

    // ── Period selector (Today / WTD / MTD / QTD / YTD) drives the period KPIs ──
    const period = String(req.query.period || 'MTD').toUpperCase();
    const periodStart = (() => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // local midnight today
      switch (period) {
        case 'TODAY': return d;
        case 'WTD': { // week-to-date, week starts Monday
          const dow = (d.getDay() + 6) % 7; // 0 = Monday
          d.setDate(d.getDate() - dow); return d;
        }
        case 'QTD': { // quarter-to-date
          const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
          return new Date(now.getFullYear(), qStartMonth, 1);
        }
        case 'YTD': return new Date(now.getFullYear(), 0, 1);
        case 'MTD':
        default:    return new Date(now.getFullYear(), now.getMonth(), 1);
      }
    })();
    const periodStartStr = periodStart.toISOString().split('T')[0];
    const periodLabels: Record<string, string> = { TODAY: 'Today', WTD: 'Week to date', MTD: 'Month to date', QTD: 'Quarter to date', YTD: 'Year to date' };
    const periodLabel = periodLabels[period] || 'Month to date';

    // Revenue accounts are stored with account type 'income' in this chart of accounts.
    const REVENUE_TYPE = 'income';

    // Revenue for the selected period (posted income entries dated within the period).
    const revenuePeriod = await db('journal_entry_lines as jel')
      .join('journal_entries as je', 'jel.journal_id', 'je.id')
      .join('accounts as a', 'jel.account_id', 'a.id')
      .where({ 'je.company_id': companyId, 'je.status': 'posted', 'a.type': REVENUE_TYPE })
      .where('je.entry_date', '>=', periodStartStr).where('je.entry_date', '<=', today)
      .select(db.raw('COALESCE(SUM(jel.credit_base - jel.debit_base), 0) as amount')).first();

    // Revenue MTD
    const revenueMTD = await db('journal_entry_lines as jel')
      .join('journal_entries as je', 'jel.journal_id', 'je.id')
      .join('accounts as a', 'jel.account_id', 'a.id')
      .where({ 'je.company_id': companyId, 'je.status': 'posted', 'a.type': REVENUE_TYPE })
      .where('je.entry_date', '>=', startOfMonth).where('je.entry_date', '<=', today)
      .select(db.raw('COALESCE(SUM(jel.credit_base - jel.debit_base), 0) as amount')).first();

    // Revenue YTD
    const revenueYTD = await db('journal_entry_lines as jel')
      .join('journal_entries as je', 'jel.journal_id', 'je.id')
      .join('accounts as a', 'jel.account_id', 'a.id')
      .where({ 'je.company_id': companyId, 'je.status': 'posted', 'a.type': REVENUE_TYPE })
      .where('je.entry_date', '>=', startOfYear).where('je.entry_date', '<=', today)
      .select(db.raw('COALESCE(SUM(jel.credit_base - jel.debit_base), 0) as amount')).first();

    // ── Period-scoped transaction activity (created/dated within the period) ──
    // NaN-tolerant sum: some legacy rows store 'NaN' in numeric totals which would
    // otherwise poison SUM() and serialize to null. Treat NaN as 0.
    const safeSum = (col: string) => db.raw(`COALESCE(SUM(CASE WHEN ${col} = 'NaN'::numeric THEN 0 ELSE ${col} END), 0) as total`);
    const soPeriod = await db('sales_orders').where({ company_id: companyId, is_deleted: false })
      .where('order_date', '>=', periodStartStr).where('order_date', '<=', today)
      .select(db.raw('COUNT(id) as count'), safeSum('total_amount')).first();
    const poPeriod = await db('purchase_orders').where({ company_id: companyId, is_deleted: false })
      .where('order_date', '>=', periodStartStr).where('order_date', '<=', today)
      .select(db.raw('COUNT(id) as count'), safeSum('total_amount')).first();
    const invPeriod = await db('invoices').where({ company_id: companyId, is_deleted: false })
      .where('invoice_date', '>=', periodStartStr).where('invoice_date', '<=', today)
      .select(db.raw('COUNT(id) as count'), safeSum('total_amount')).first();
    const billPeriod = await db('vendor_bills').where({ company_id: companyId, is_deleted: false })
      .where('bill_date', '>=', periodStartStr).where('bill_date', '<=', today)
      .select(db.raw('COUNT(id) as count'), safeSum('total_amount')).first();

    // Open AR
    const openAR = await db('invoices').where({ company_id: companyId, is_deleted: false })
      .whereNotIn('status', ['paid', 'voided']).sum('amount_due as total').first();

    // Open AP
    const openAP = await db('vendor_bills').where({ company_id: companyId, is_deleted: false })
      .whereNotIn('status', ['paid', 'voided']).sum('amount_due as total').first();

    // Overdue AR
    const overdueAR = await db('invoices').where({ company_id: companyId, is_deleted: false })
      .whereNotIn('status', ['paid', 'voided']).where('due_date', '<', today).sum('amount_due as total').first();

    // Open Sales Orders
    const openSOs = await db('sales_orders').where({ company_id: companyId, is_deleted: false })
      .whereNotIn('status', ['closed', 'cancelled', 'billed']).count('id as count').first();

    // Open POs
    const openPOs = await db('purchase_orders').where({ company_id: companyId, is_deleted: false })
      .whereNotIn('status', ['closed', 'cancelled']).count('id as count').first();

    // Open Work Orders
    const openWOs = await db('work_orders').where({ company_id: companyId, is_deleted: false })
      .whereNotIn('status', ['completed', 'closed', 'cancelled']).count('id as count').first();

    // Inventory Value
    const invValue = await db('inventory_balances as ib')
      .where({ 'ib.company_id': companyId })
      .select(db.raw('COALESCE(SUM(ib.qty_on_hand * ib.avg_cost), 0) as total_value')).first();

    // Revenue by month (last 12 months)
    const revenueByMonth = await db('journal_entry_lines as jel')
      .join('journal_entries as je', 'jel.journal_id', 'je.id')
      .join('accounts as a', 'jel.account_id', 'a.id')
      .where({ 'je.company_id': companyId, 'je.status': 'posted', 'a.type': REVENUE_TYPE })
      .where('je.entry_date', '>=', db.raw(`CURRENT_DATE - INTERVAL '12 months'`))
      .groupBy(db.raw("TO_CHAR(je.entry_date, 'YYYY-MM')"))
      .orderBy(db.raw("TO_CHAR(je.entry_date, 'YYYY-MM')"))
      .select(
        db.raw("TO_CHAR(je.entry_date, 'YYYY-MM') as month"),
        db.raw('COALESCE(SUM(jel.credit_base - jel.debit_base), 0) as amount')
      );

    // Top 5 customers by revenue
    const topCustomers = await db('invoices as i').join('customers as c', 'i.customer_id', 'c.id')
      .where({ 'i.company_id': companyId, 'i.is_deleted': false })
      .where('i.invoice_date', '>=', startOfYear)
      .groupBy('c.id', 'c.name')
      .orderBy('total_amount', 'desc')
      .limit(5)
      .select('c.id', 'c.name', db.raw('SUM(i.total_amount) as total_amount'));

    // Low stock items
    const lowStock = await db('items as i')
      .leftJoin(
        db('inventory_balances').groupBy('item_id')
          .select('item_id', db.raw('SUM(qty_on_hand) as total_qty')).as('ib'),
        'i.id', 'ib.item_id'
      )
      .where({ 'i.company_id': companyId, 'i.is_stockable': true, 'i.is_active': true })
      .whereRaw('COALESCE(ib.total_qty, 0) <= i.reorder_point')
      .where('i.reorder_point', '>', 0)
      .select('i.item_code', 'i.name', 'i.reorder_point', db.raw('COALESCE(ib.total_qty, 0) as qty_on_hand'))
      .limit(10);

    // Recent transactions
    const recentTransactions = await db('journal_entries').where({ company_id: companyId, status: 'posted' })
      .orderBy('entry_date', 'desc').limit(10)
      .select('journal_number', 'entry_date', 'memo', 'source_type', 'type');

    // ── Reminders ────────────────────────────────────────────────────────────
    // Show ONLY pending transactions that are (a) not yet approved, or
    // (b) not yet completed/finished (still need an action to close them out).
    const cnt = (r: any) => parseInt((r as any)?.count || 0);
    const base = (t: string) => db(t).where({ company_id: companyId, is_deleted: false });

    // (a) Pending approval — awaiting sign-off before they can proceed.
    const soPendingApproval = await base('sales_orders').where('status', 'pending_approval').count('id as count').first();
    const poPendingApproval = await base('purchase_orders').where('status', 'pending_approval').count('id as count').first();
    const quotePendingApproval = await base('quotations').whereIn('status', ['draft', 'submitted']).count('id as count').first();
    // purchase_requisitions has no is_deleted column — query directly.
    const prPendingApproval = await db('purchase_requisitions').where({ company_id: companyId })
      .whereIn('status', ['draft', 'submitted']).count('id as count').first();

    // (b) Not completed — in progress, still need fulfillment / receipt / billing / payment.
    const soToFulfill = await base('sales_orders').where('status', 'pending_fulfillment').count('id as count').first();
    const soToBill = await base('sales_orders').whereIn('status', ['pending_billing', 'partially_fulfilled', 'partially_billed']).count('id as count').first();
    const poToReceive = await base('purchase_orders').whereIn('status', ['pending_receipt', 'partially_received']).count('id as count').first();
    const poToBill = await base('purchase_orders').where('status', 'pending_billing').count('id as count').first();
    const invUnpaid = await base('invoices').whereIn('status', ['open', 'overdue', 'partially_paid']).count('id as count').first();
    const invOverdue = await base('invoices').whereIn('status', ['open', 'overdue', 'partially_paid']).where('due_date', '<', today).count('id as count').first();
    const billUnpaid = await base('vendor_bills').whereIn('status', ['open', 'partially_paid']).count('id as count').first();
    const woOpen = await base('work_orders').whereNotIn('status', ['completed', 'closed', 'cancelled']).count('id as count').first();

    const reminders = {
      pendingApproval: [
        { key: 'so_approval',    count: cnt(soPendingApproval),    label: 'Sales Orders pending approval',       path: '/sales/orders' },
        { key: 'po_approval',    count: cnt(poPendingApproval),    label: 'Purchase Orders pending approval',    path: '/purchasing/orders' },
        { key: 'pr_approval',    count: cnt(prPendingApproval),    label: 'Purchase Requisitions pending approval', path: '/purchasing/requisitions' },
        { key: 'quote_approval', count: cnt(quotePendingApproval), label: 'Quotations pending approval',         path: '/sales/quotations' },
      ].filter(r => r.count > 0),
      notCompleted: [
        { key: 'so_fulfill',  count: cnt(soToFulfill),  label: 'Sales Orders awaiting fulfillment', path: '/sales/orders' },
        { key: 'so_bill',     count: cnt(soToBill),     label: 'Sales Orders awaiting billing',     path: '/sales/orders' },
        { key: 'po_receive',  count: cnt(poToReceive),  label: 'Purchase Orders awaiting receipt',  path: '/purchasing/orders' },
        { key: 'po_bill',     count: cnt(poToBill),     label: 'Purchase Orders awaiting billing',  path: '/purchasing/orders' },
        { key: 'inv_unpaid',  count: cnt(invUnpaid),    label: 'Invoices awaiting payment',         path: '/sales/invoices', overdue: cnt(invOverdue) },
        { key: 'bill_unpaid', count: cnt(billUnpaid),   label: 'Vendor Bills awaiting payment',     path: '/purchasing/bills' },
        { key: 'wo_open',     count: cnt(woOpen),       label: 'Work Orders not completed',         path: '/manufacturing/work-orders' },
      ].filter(r => r.count > 0),
    };

    // Pending-approval detail lists for the Approval Queue portlet.
    const pendingPOList = await db('purchase_orders as po').leftJoin('vendors as v', 'po.vendor_id', 'v.id')
      .where({ 'po.company_id': companyId, 'po.is_deleted': false, 'po.status': 'pending_approval' })
      .orderBy('po.order_date', 'desc').limit(5)
      .select('po.id', 'po.po_number', 'po.total_amount', 'v.name as vendor_name', 'po.order_date');
    const pendingSOList = await db('sales_orders as so').leftJoin('customers as c', 'so.customer_id', 'c.id')
      .where({ 'so.company_id': companyId, 'so.is_deleted': false, 'so.status': 'pending_approval' })
      .orderBy('so.order_date', 'desc').limit(5)
      .select('so.id', 'so.so_number', 'so.total_amount', 'c.name as customer_name', 'so.order_date');

    res.json({
      success: true,
      data: {
        period,
        periodLabel,
        kpis: {
          // Period-scoped activity (reflects the Today/WTD/MTD/QTD/YTD selector).
          revenuePeriod: parseFloat((revenuePeriod as any)?.amount || 0),
          soPeriodCount: parseInt((soPeriod as any)?.count || 0),
          soPeriodTotal: parseFloat((soPeriod as any)?.total || 0),
          poPeriodCount: parseInt((poPeriod as any)?.count || 0),
          poPeriodTotal: parseFloat((poPeriod as any)?.total || 0),
          invPeriodCount: parseInt((invPeriod as any)?.count || 0),
          invPeriodTotal: parseFloat((invPeriod as any)?.total || 0),
          billPeriodCount: parseInt((billPeriod as any)?.count || 0),
          billPeriodTotal: parseFloat((billPeriod as any)?.total || 0),
          // Fixed-window revenue (kept for reference).
          revenueMTD: parseFloat((revenueMTD as any)?.amount || 0),
          revenueYTD: parseFloat((revenueYTD as any)?.amount || 0),
          // Point-in-time balances (not period-bounded).
          openAR: parseFloat((openAR as any)?.total || 0),
          openAP: parseFloat((openAP as any)?.total || 0),
          overdueAR: parseFloat((overdueAR as any)?.total || 0),
          openSOCount: parseInt((openSOs as any)?.count || 0),
          openPOCount: parseInt((openPOs as any)?.count || 0),
          openWOCount: parseInt((openWOs as any)?.count || 0),
          inventoryValue: parseFloat((invValue as any)?.total_value || 0),
        },
        charts: { revenueByMonth },
        topCustomers,
        lowStock,
        recentTransactions,
        reminders,
        pendingPOList,
        pendingSOList,
      },
    });
  } catch (e: any) {
    console.error("[ERP ERROR]", e.message);
    res.status(500).json({ success: false, error: 'Failed to load dashboard data' });
  }
});

// Global Search
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const q = (req.query.q as string || '').trim();
    if (q.length < 2) { res.json({ success: true, data: [] }); return; }

    const results: any[] = [];

    // Customers
    const customers = await db('customers').where({ company_id: companyId, is_deleted: false })
      .where((qb: any) => qb.whereILike('name', `%${q}%`).orWhereILike('customer_number', `%${q}%`).orWhereILike('email', `%${q}%`))
      .limit(5).select('id', 'customer_number as number', 'name', db.raw("'customer' as type"));
    results.push(...customers);

    // Vendors
    const vendors = await db('vendors').where({ company_id: companyId, is_deleted: false })
      .where((qb: any) => qb.whereILike('name', `%${q}%`).orWhereILike('vendor_number', `%${q}%`))
      .limit(5).select('id', 'vendor_number as number', 'name', db.raw("'vendor' as type"));
    results.push(...vendors);

    // Items
    const items = await db('items').where({ company_id: companyId, is_deleted: false })
      .where((qb: any) => qb.whereILike('name', `%${q}%`).orWhereILike('item_code', `%${q}%`).orWhereILike('sku', `%${q}%`))
      .limit(5).select('id', 'item_code as number', 'name', db.raw("'item' as type"));
    results.push(...items);

    // Sales Orders
    const sos = await db('sales_orders as so').join('customers as c', 'so.customer_id', 'c.id')
      .where({ 'so.company_id': companyId, 'so.is_deleted': false })
      .where((qb: any) => qb.whereILike('so.so_number', `%${q}%`).orWhereILike('c.name', `%${q}%`))
      .limit(3).select('so.id', 'so.so_number as number', db.raw("c.name || ' - ' || so.so_number as name"), db.raw("'sales_order' as type"));
    results.push(...sos);

    // Invoices
    const invoices = await db('invoices as i').join('customers as c', 'i.customer_id', 'c.id')
      .where({ 'i.company_id': companyId, 'i.is_deleted': false })
      .where((qb: any) => qb.whereILike('i.invoice_number', `%${q}%`).orWhereILike('c.name', `%${q}%`))
      .limit(3).select('i.id', 'i.invoice_number as number', db.raw("c.name || ' - ' || i.invoice_number as name"), db.raw("'invoice' as type"));
    results.push(...invoices);

    // POs
    const pos = await db('purchase_orders as po').join('vendors as v', 'po.vendor_id', 'v.id')
      .where({ 'po.company_id': companyId, 'po.is_deleted': false })
      .where((qb: any) => qb.whereILike('po.po_number', `%${q}%`).orWhereILike('v.name', `%${q}%`))
      .limit(3).select('po.id', 'po.po_number as number', db.raw("v.name || ' - ' || po.po_number as name"), db.raw("'purchase_order' as type"));
    results.push(...pos);

    // Work Orders
    const wos = await db('work_orders as wo').join('items as i', 'wo.item_id', 'i.id')
      .where({ 'wo.company_id': companyId, 'wo.is_deleted': false })
      .where((qb: any) => qb.whereILike('wo.wo_number', `%${q}%`).orWhereILike('i.name', `%${q}%`))
      .limit(3).select('wo.id', 'wo.wo_number as number', db.raw("i.name || ' - ' || wo.wo_number as name"), db.raw("'work_order' as type"));
    results.push(...wos);

    res.json({ success: true, data: results.slice(0, 20) });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Search failed' }); }
});

// Inventory Report
router.get('/inventory', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const data = await db('inventory_balances as ib')
      .join('items as i', 'ib.item_id', 'i.id')
      .leftJoin('locations as l', 'ib.location_id', 'l.id')
      .leftJoin('warehouses as w', 'ib.warehouse_id', 'w.id')
      .leftJoin('item_categories as ic', 'i.category_id', 'ic.id')
      .where({ 'ib.company_id': companyId })
      .where('ib.qty_on_hand', '!=', 0)
      .select(
        'i.item_code', 'i.name as item_name', 'i.type as item_type', 'ic.name as category_name',
        'l.name as location_name', 'w.name as warehouse_name',
        'ib.qty_on_hand', 'ib.qty_committed', 'ib.avg_cost',
        db.raw('ib.qty_on_hand * ib.avg_cost as total_value'),
        db.raw('ib.qty_on_hand - ib.qty_committed as available_qty')
      )
      .orderBy('i.item_code');
    res.json({ success: true, data });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch inventory report' }); }
});

// Manufacturing Report
router.get('/manufacturing', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const dateFrom = req.query.dateFrom as string || '2026-01-01';
    const dateTo = req.query.dateTo as string || new Date().toISOString().split('T')[0];

    const workOrders = await db('work_orders as wo').join('items as i', 'wo.item_id', 'i.id')
      .where({ 'wo.company_id': companyId }).where('wo.planned_start_date', '>=', dateFrom).where('wo.planned_start_date', '<=', dateTo)
      .select(
        'wo.wo_number', 'wo.status', 'wo.planned_quantity', 'wo.completed_quantity', 'wo.scrapped_quantity',
        'wo.planned_start_date', 'wo.planned_end_date', 'i.item_code', 'i.name as item_name',
        db.raw('wo.estimated_material_cost + wo.estimated_labor_cost + wo.estimated_machine_cost + wo.estimated_overhead_cost as estimated_total_cost'),
        db.raw('wo.actual_material_cost + wo.actual_labor_cost + wo.actual_machine_cost + wo.actual_overhead_cost as actual_total_cost'),
        'wo.variance_amount'
      ).orderBy('wo.planned_start_date', 'desc');

    const summary = {
      totalWOs: workOrders.length,
      completed: workOrders.filter((w: any) => ['completed', 'closed'].includes(w.status)).length,
      inProgress: workOrders.filter((w: any) => w.status === 'in_progress').length,
      planned: workOrders.filter((w: any) => w.status === 'planned').length,
      totalProduced: workOrders.reduce((s: number, w: any) => s + parseFloat(w.completed_quantity), 0),
      totalVariance: workOrders.reduce((s: number, w: any) => s + parseFloat(w.variance_amount || 0), 0),
    };

    res.json({ success: true, data: { workOrders, summary } });
  } catch (e: any) { console.error("[ERP ERROR]", e.message, e.stack); res.status(500).json({ success: false, error: 'Failed to fetch manufacturing report' }); }
});

// MRP
router.get('/mrp/run', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const horizon = req.query.horizon as string || '30';
    const horizonDays = parseInt(horizon);

    const horizonDate = new Date();
    horizonDate.setDate(horizonDate.getDate() + horizonDays);
    const horizonStr = horizonDate.toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    // Open sales order demand
    const soDemand = await db('sales_order_lines as sol')
      .join('sales_orders as so', 'sol.so_id', 'so.id')
      .join('items as i', 'sol.item_id', 'i.id')
      .where({ 'so.company_id': companyId })
      .whereNotIn('so.status', ['closed', 'cancelled', 'billed'])
      .select('sol.item_id', 'i.item_code', 'i.name as item_name', 'i.lead_time_days', 'i.reorder_point', 'i.safety_stock',
        'i.preferred_vendor_id', db.raw('SUM(sol.quantity - sol.qty_fulfilled) as demand_qty'),
        db.raw("MIN(COALESCE(so.expected_ship_date, CURRENT_DATE + INTERVAL '30 days')) as required_date"))
      .groupBy('sol.item_id', 'i.item_code', 'i.name', 'i.lead_time_days', 'i.reorder_point', 'i.safety_stock', 'i.preferred_vendor_id');

    const recommendations: any[] = [];

    for (const demand of soDemand) {
      const inventory = await db('inventory_balances')
        .where({ company_id: companyId, item_id: demand.item_id })
        .select(db.raw('COALESCE(SUM(qty_on_hand - qty_committed), 0) as available'),
          db.raw('COALESCE(SUM(qty_on_order), 0) as on_order')).first();

      const available = parseFloat(inventory?.available || 0);
      const onOrder = parseFloat(inventory?.on_order || 0);
      const demandQty = parseFloat(demand.demand_qty);
      const safetyStock = parseFloat(demand.safety_stock || 0);

      const netRequired = Math.max(0, demandQty + safetyStock - available - onOrder);

      if (netRequired > 0) {
        const item = await db('items').where({ id: demand.item_id }).first();
        const isMfg = ['finished_goods', 'semi_finished'].includes(item?.type || '');
        const requiredDate = new Date(demand.required_date);
        const leadTime = parseInt(demand.lead_time_days || 0);
        const suggestedDate = new Date(requiredDate);
        suggestedDate.setDate(suggestedDate.getDate() - leadTime);

        recommendations.push({
          itemId: demand.item_id,
          itemCode: demand.item_code,
          itemName: demand.item_name,
          type: isMfg ? 'work_order' : 'purchase',
          demandQty,
          available,
          onOrder,
          recommendedQty: netRequired,
          requiredDate: demand.required_date,
          suggestedDate: suggestedDate.toISOString().split('T')[0],
          preferredVendorId: demand.preferred_vendor_id,
        });
      }
    }

    // Also check reorder points for items below safety stock
    const lowStockItems = await db('items as i')
      .leftJoin(
        db('inventory_balances').where({ company_id: companyId }).groupBy('item_id')
          .select('item_id', db.raw('SUM(qty_on_hand) as total_qty')).as('ib'),
        'i.id', 'ib.item_id'
      )
      .where({ 'i.company_id': companyId, 'i.is_active': true, 'i.is_stockable': true })
      .where('i.reorder_point', '>', 0)
      .whereRaw('COALESCE(ib.total_qty, 0) <= i.reorder_point')
      .select('i.id', 'i.item_code', 'i.name', 'i.type', 'i.reorder_point', 'i.safety_stock', 'i.lead_time_days', 'i.preferred_vendor_id',
        db.raw('COALESCE(ib.total_qty, 0) as current_qty'));

    for (const item of lowStockItems) {
      const existing = recommendations.find(r => r.itemId === item.id);
      if (!existing) {
        const reorderQty = Math.max(item.reorder_point, item.safety_stock) - parseFloat(item.current_qty);
        const suggestedDate = new Date();
        suggestedDate.setDate(suggestedDate.getDate() + 1);
        recommendations.push({
          itemId: item.id, itemCode: item.item_code, itemName: item.name,
          type: ['finished_goods', 'semi_finished'].includes(item.type) ? 'work_order' : 'purchase',
          demandQty: item.reorder_point, available: parseFloat(item.current_qty),
          onOrder: 0, recommendedQty: reorderQty,
          requiredDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
          suggestedDate: suggestedDate.toISOString().split('T')[0],
          preferredVendorId: item.preferred_vendor_id,
          reason: 'below_reorder_point',
        });
      }
    }

    res.json({
      success: true,
      data: {
        runDate: today,
        horizon: horizonDays,
        recommendations,
        summary: {
          total: recommendations.length,
          purchaseRecommendations: recommendations.filter(r => r.type === 'purchase').length,
          workOrderRecommendations: recommendations.filter(r => r.type === 'work_order').length,
        },
      },
    });
  } catch (e: any) {
    console.error("[ERP ERROR]", e.message);
    res.status(500).json({ success: false, error: 'Failed to run MRP' });
  }
});

export default router;

// ─── Sales by Customer ────────────────────────────────────────────────────────
router.get('/sales-by-customer', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { startDate, endDate } = req.query as any;
    const data = await db('invoices as i')
      .join('customers as c', 'i.customer_id', 'c.id')
      .where({ 'i.company_id': companyId })
      .whereIn('i.status', ['paid', 'partially_paid', 'open'])
      .modify((q: any) => {
        if (startDate) q.where('i.invoice_date', '>=', startDate);
        if (endDate) q.where('i.invoice_date', '<=', endDate);
      })
      .groupBy('c.id', 'c.name', 'c.billing_city')
      .select('c.id', 'c.name', db.raw('c.billing_city as city'),
        db.raw('COUNT(i.id) as transaction_count'),
        db.raw('SUM(i.total_amount) as total_amount'))
      .orderBy(db.raw('SUM(i.total_amount)'), 'desc');
    res.json({ success: true, data });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to generate report' }); }
});

// ─── Sales by Items ───────────────────────────────────────────────────────────
router.get('/sales-by-items', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { startDate, endDate } = req.query as any;
    const data = await db('invoice_lines as il')
      .join('invoices as i', 'il.invoice_id', 'i.id')
      .join('items as it', 'il.item_id', 'it.id')
      .where({ 'i.company_id': companyId })
      .modify((q: any) => {
        if (startDate) q.where('i.invoice_date', '>=', startDate);
        if (endDate) q.where('i.invoice_date', '<=', endDate);
      })
      .groupBy('it.id', 'it.item_code', 'it.name')
      .select('it.id', 'it.item_code', 'it.name as item_name',
        db.raw('SUM(il.quantity) as total_qty'),
        db.raw('SUM(il.amount) as total_amount'))
      .orderBy(db.raw('SUM(il.amount)'), 'desc');
    res.json({ success: true, data });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to generate report' }); }
});

// ─── Sales by Rep ─────────────────────────────────────────────────────────────
router.get('/sales-by-rep', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { startDate, endDate } = req.query as any;
    const data = await db('invoices as i')
      .leftJoin('users as u', 'i.created_by', 'u.id')
      .where({ 'i.company_id': companyId })
      .modify((q: any) => {
        if (startDate) q.where('i.invoice_date', '>=', startDate);
        if (endDate) q.where('i.invoice_date', '<=', endDate);
      })
      .groupBy('u.id', 'u.name')
      .select(db.raw('COALESCE(u.name, \'(Unassigned)\') as sales_rep'),
        db.raw('COUNT(i.id) as order_count'),
        db.raw('SUM(i.total_amount) as total_amount'))
      .orderBy(db.raw('SUM(i.total_amount)'), 'desc');
    res.json({ success: true, data });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to generate report' }); }
});

// ─── Sales Order by Customer ──────────────────────────────────────────────────
router.get('/so-by-customer', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { startDate, endDate } = req.query as any;
    const data = await db('sales_orders as so')
      .join('customers as c', 'so.customer_id', 'c.id')
      .where({ 'so.company_id': companyId })
      .modify((q: any) => {
        if (startDate) q.where('so.order_date', '>=', startDate);
        if (endDate) q.where('so.order_date', '<=', endDate);
      })
      .groupBy('c.id', 'c.name', 'c.billing_city')
      .select('c.id', 'c.name', db.raw('c.billing_city as city'),
        db.raw('COUNT(so.id) as transaction_count'),
        db.raw('SUM(so.total_amount) as total_amount'))
      .orderBy(db.raw('SUM(so.total_amount)'), 'desc');
    res.json({ success: true, data });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to generate report' }); }
});

// ─── Sales Order by Items ─────────────────────────────────────────────────────
router.get('/so-by-items', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { startDate, endDate } = req.query as any;
    const data = await db('sales_order_lines as sol')
      .join('sales_orders as so', 'sol.so_id', 'so.id')
      .join('items as it', 'sol.item_id', 'it.id')
      .where({ 'so.company_id': companyId })
      .modify((q: any) => {
        if (startDate) q.where('so.order_date', '>=', startDate);
        if (endDate) q.where('so.order_date', '<=', endDate);
      })
      .groupBy('it.id', 'it.item_code', 'it.name')
      .select('it.id', 'it.item_code', 'it.name as item_name',
        db.raw('SUM(sol.quantity) as total_qty'),
        db.raw('SUM(sol.amount) as total_amount'))
      .orderBy(db.raw('SUM(sol.amount)'), 'desc');
    res.json({ success: true, data });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to generate report' }); }
});

// ─── Sales Order by Sales Rep ─────────────────────────────────────────────────
router.get('/sales-order-by-rep', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { startDate, endDate } = req.query as any;
    const data = await db('sales_orders as so')
      .leftJoin('users as u', 'so.created_by', 'u.id')
      .where({ 'so.company_id': companyId })
      .modify((q: any) => {
        if (startDate) q.where('so.order_date', '>=', startDate);
        if (endDate) q.where('so.order_date', '<=', endDate);
      })
      .groupBy('u.id', 'u.name')
      .select(db.raw('COALESCE(u.name, \'(Unassigned)\') as sales_rep'),
        db.raw('COUNT(so.id) as order_count'),
        db.raw('SUM(so.total_amount) as total_amount'))
      .orderBy(db.raw('SUM(so.total_amount)'), 'desc');
    res.json({ success: true, data });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to generate report' }); }
});

// ─── Purchases by Customer (Vendor) ──────────────────────────────────────────
router.get('/purchases-by-customer', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { startDate, endDate } = req.query as any;
    const data = await db('vendor_bills as vb')
      .join('vendors as v', 'vb.vendor_id', 'v.id')
      .where({ 'vb.company_id': companyId })
      .modify((q: any) => {
        if (startDate) q.where('vb.bill_date', '>=', startDate);
        if (endDate) q.where('vb.bill_date', '<=', endDate);
      })
      .groupBy('v.id', 'v.name')
      .select('v.id', 'v.name as vendor_name',
        db.raw('COUNT(vb.id) as transaction_count'),
        db.raw('SUM(vb.total_amount) as total_amount'))
      .orderBy(db.raw('SUM(vb.total_amount)'), 'desc');
    res.json({ success: true, data });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to generate report' }); }
});

// ─── Purchases by Items ───────────────────────────────────────────────────────
router.get('/purchases-by-items', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { startDate, endDate } = req.query as any;
    // Use item_receipt_lines (actual table name)
    const data = await db('item_receipt_lines as irl')
      .join('item_receipts as ir', 'irl.receipt_id', 'ir.id')
      .join('items as it', 'irl.item_id', 'it.id')
      .where({ 'ir.company_id': companyId })
      .modify((q: any) => {
        if (startDate) q.where('ir.receipt_date', '>=', startDate);
        if (endDate) q.where('ir.receipt_date', '<=', endDate);
      })
      .groupBy('it.id', 'it.item_code', 'it.name')
      .select('it.id', 'it.item_code', 'it.name as item_name',
        db.raw('SUM(irl.quantity) as total_qty'),
        // item_receipt_lines has no `amount` column; value = quantity * unit_cost.
        db.raw('SUM(irl.quantity * COALESCE(irl.unit_cost, 0)) as total_amount'))
      .orderBy(db.raw('SUM(irl.quantity * COALESCE(irl.unit_cost, 0))'), 'desc');
    res.json({ success: true, data });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to generate report' }); }
});

// ─── Purchases by Rep ─────────────────────────────────────────────────────────
router.get('/purchases-by-rep', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { startDate, endDate } = req.query as any;
    const data = await db('purchase_orders as po')
      .leftJoin('users as u', 'po.created_by', 'u.id')
      .where({ 'po.company_id': companyId })
      .modify((q: any) => {
        if (startDate) q.where('po.order_date', '>=', startDate);
        if (endDate) q.where('po.order_date', '<=', endDate);
      })
      .groupBy('u.id', 'u.name')
      .select(db.raw('COALESCE(u.name, \'(Unassigned)\') as rep'),
        db.raw('COUNT(po.id) as order_count'),
        db.raw('SUM(po.total_amount) as total_amount'))
      .orderBy(db.raw('SUM(po.total_amount)'), 'desc');
    res.json({ success: true, data });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to generate report' }); }
});

// ─── PO by Vendor ─────────────────────────────────────────────────────────────
router.get('/po-by-customer', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { startDate, endDate } = req.query as any;
    const data = await db('purchase_orders as po')
      .join('vendors as v', 'po.vendor_id', 'v.id')
      .where({ 'po.company_id': companyId })
      .modify((q: any) => {
        if (startDate) q.where('po.order_date', '>=', startDate);
        if (endDate) q.where('po.order_date', '<=', endDate);
      })
      .groupBy('v.id', 'v.name')
      .select('v.id', 'v.name as vendor_name',
        db.raw('COUNT(po.id) as transaction_count'),
        db.raw('SUM(po.total_amount) as total_amount'))
      .orderBy(db.raw('SUM(po.total_amount)'), 'desc');
    res.json({ success: true, data });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to generate report' }); }
});

router.get('/po-by-items', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { startDate, endDate } = req.query as any;
    const data = await db('purchase_order_lines as pol')
      .join('purchase_orders as po', 'pol.po_id', 'po.id')
      .join('items as it', 'pol.item_id', 'it.id')
      .where({ 'po.company_id': companyId })
      .modify((q: any) => {
        if (startDate) q.where('po.order_date', '>=', startDate);
        if (endDate) q.where('po.order_date', '<=', endDate);
      })
      .groupBy('it.id', 'it.item_code', 'it.name')
      .select('it.id', 'it.item_code', 'it.name as item_name',
        db.raw('SUM(pol.quantity) as total_qty'),
        db.raw('SUM(pol.amount) as total_amount'))
      .orderBy(db.raw('SUM(pol.amount)'), 'desc');
    res.json({ success: true, data });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to generate report' }); }
});

// ─── Stock On Hand ────────────────────────────────────────────────────────────
router.get('/stock-onhand', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { locationId, itemCode } = req.query as any;
    let query = db('inventory_balances as ib')
      .join('items as it', 'ib.item_id', 'it.id')
      .join('locations as l', 'ib.location_id', 'l.id')
      .where({ 'ib.company_id': companyId });
    if (locationId) query = query.where({ 'ib.location_id': locationId });
    if (itemCode) query = query.where(function(this: any) {
      this.where('it.item_code', 'ilike', `%${itemCode}%`).orWhere('it.name', 'ilike', `%${itemCode}%`);
    });
    const data = await query
      .select('it.item_code', 'it.name as item_name', 'l.name as location_name',
        'ib.qty_on_hand',
        db.raw('ib.qty_on_hand - COALESCE(ib.qty_committed,0) as qty_available'),
        db.raw('COALESCE(ib.qty_committed,0) as qty_committed'),
        db.raw('COALESCE(ib.qty_on_order,0) as qty_on_order'),
        db.raw('COALESCE(ib.avg_cost,0) as unit_cost'),
        db.raw('ib.qty_on_hand * COALESCE(ib.avg_cost,0) as total_value'))
      .orderBy('it.item_code');
    res.json({ success: true, data });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to generate stock report' }); }
});

// ─── Stock Ledger ─────────────────────────────────────────────────────────────
router.get('/stock-ledger', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { startDate, endDate, itemId, locationId } = req.query as any;
    let itemsQ = db('items').where({ company_id: companyId, is_active: true });
    if (itemId) itemsQ = itemsQ.where({ id: itemId });
    const items = await itemsQ.select('id', 'item_code', 'name').limit(50);
    const result = [];
    for (const item of items) {
      const bal = await db('inventory_balances')
        .where({ company_id: companyId, item_id: item.id })
        .modify((q: any) => { if (locationId) q.where({ location_id: locationId }); })
        .select(db.raw('SUM(qty_on_hand) as qty'), db.raw('SUM(qty_on_hand * avg_cost) as value'))
        .first();
      let txnQ = db('inventory_transactions as it2')
        .join('inventory_transaction_lines as itl', 'it2.id', 'itl.transaction_id')
        .join('locations as l', 'it2.location_id', 'l.id')
        .where({ 'it2.company_id': companyId, 'itl.item_id': item.id })
        .modify((q: any) => {
          if (startDate) q.where('it2.transaction_date', '>=', startDate);
          if (endDate) q.where('it2.transaction_date', '<=', endDate);
          if (locationId) q.where({ 'it2.location_id': locationId });
        })
        .select('it2.transaction_date', 'it2.transaction_type', 'it2.transaction_number as document_number',
          'l.name as location_name',
          db.raw('CASE WHEN itl.direction=\'in\' THEN itl.quantity ELSE 0 END as qty_in'),
          db.raw('CASE WHEN itl.direction=\'out\' THEN itl.quantity ELSE 0 END as qty_out'),
          'itl.unit_cost')
        .orderBy('it2.transaction_date').limit(200);
      const lines = await txnQ;
      if (lines.length > 0 || parseFloat(bal?.qty || 0) > 0) {
        const opening_qty = parseFloat(bal?.qty || 0);
        const opening_value = parseFloat(bal?.value || 0);
        let runQty = 0; let runVal = 0;
        const enriched = lines.map((line: any) => {
          runQty += Number(line.qty_in || 0) - Number(line.qty_out || 0);
          runVal += (Number(line.qty_in || 0) - Number(line.qty_out || 0)) * Number(line.unit_cost || 0);
          return { ...line, balance_qty: opening_qty + runQty, balance_value: opening_value + runVal };
        });
        result.push({ item_id: item.id, item_code: item.item_code, item_name: item.name,
          opening_qty, opening_value, closing_qty: opening_qty + runQty, closing_value: opening_value + runVal,
          lines: enriched });
      }
    }
    res.json({ success: true, data: result });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to generate stock ledger' }); }
});

// ─── Inventory Activity Detail ────────────────────────────────────────────────
router.get('/inventory-activity', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { startDate, endDate, itemId, locationId, txnType } = req.query as any;
    let query = db('inventory_transactions as it2')
      .join('inventory_transaction_lines as itl', 'it2.id', 'itl.transaction_id')
      .join('items as i', 'itl.item_id', 'i.id')
      .join('locations as l', 'it2.location_id', 'l.id')
      .where({ 'it2.company_id': companyId })
      .modify((q: any) => {
        if (startDate) q.where('it2.transaction_date', '>=', startDate);
        if (endDate) q.where('it2.transaction_date', '<=', endDate);
        if (itemId) q.where({ 'itl.item_id': itemId });
        if (locationId) q.where({ 'it2.location_id': locationId });
        if (txnType) q.where({ 'it2.transaction_type': txnType });
      })
      .select('it2.transaction_date', 'i.item_code', 'i.name as item_name',
        'it2.transaction_type', 'it2.transaction_number as document_number', 'l.name as location_name',
        db.raw('CASE WHEN itl.direction=\'in\' THEN itl.quantity ELSE 0 END as qty_in'),
        db.raw('CASE WHEN itl.direction=\'out\' THEN itl.quantity ELSE 0 END as qty_out'),
        'itl.unit_cost')
      .orderBy('it2.transaction_date', 'desc').limit(500);
    const data = await query;
    res.json({ success: true, data });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to generate inventory activity' }); }
});
