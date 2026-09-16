import { Router, Request, Response } from 'express';
import db from '../../config/database';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

// ─── Expense Reports ──────────────────────────────────────────────────────────
router.get('/expenses', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await db('expense_reports')
      .where({ company_id: req.user!.companyId })
      .orderBy('created_at', 'desc').limit(100);
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to fetch expense reports' }); }
});

router.get('/expenses/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const report = await db('expense_reports')
      .where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!report) { res.status(404).json({ success: false, error: 'Report not found' }); return; }
    const lines = await db('expense_report_lines').where({ report_id: req.params.id });
    res.json({ success: true, data: { ...report, lines } });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to fetch report' }); }
});

router.post('/expenses', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = req.body;
    const companyId = req.user!.companyId;
    if (!d.employeeName) { res.status(400).json({ success: false, error: 'Employee name is required' }); return; }

    const reportNumber = `EXP-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const totalAmount = (d.lines || []).reduce((s: number, l: any) => s + Number(l.amount || 0), 0);

    const [report] = await db('expense_reports').insert({
      company_id: companyId,
      report_number: reportNumber,
      employee_name: d.employeeName,
      department: d.department || null,
      report_period_start: d.reportPeriodStart || null,
      report_period_end: d.reportPeriodEnd || null,
      purpose: d.purpose || null,
      memo: d.memo || null,
      total_amount: totalAmount,
      status: 'submitted',
      created_by: req.user!.id,
    }).returning('*');

    for (const line of d.lines || []) {
      await db('expense_report_lines').insert({
        report_id: report.id,
        expense_date: line.date || new Date(),
        category: line.category || 'other',
        description: line.description || null,
        account_id: line.accountId || null,
        receipt_number: line.receipt || null,
        amount: Number(line.amount || 0),
      });
    }

    res.status(201).json({ success: true, data: { ...report, report_number: reportNumber } });
  } catch (e: any) { console.error('[ERP ERROR]', e.message); res.status(500).json({ success: false, error: 'Failed to submit expense report' }); }
});

router.post('/expenses/:id/approve', async (req: Request, res: Response): Promise<void> => {
  try {
    const [report] = await db('expense_reports')
      .where({ id: req.params.id, company_id: req.user!.companyId })
      .update({ status: 'approved', approved_by: req.user!.id, approved_at: new Date() })
      .returning('*');
    res.json({ success: true, data: report });
  } catch (e: any) { res.status(500).json({ success: false, error: 'Failed to approve report' }); }
});

export default router;

// ── Audit routes ──────────────────────────────────────────────────────────────
router.get('/expenses/:id/audit', async (req: any, res: any) => {
  try { const l = await (db as any)('transaction_audit_log').where({ company_id: req.user.companyId, source_type: 'expense_report', source_id: req.params.id }).orderBy('performed_at','desc').limit(200); res.json({ success:true, data:l }); } catch(e:any){ res.status(500).json({success:false,error:e.message}); }
});
