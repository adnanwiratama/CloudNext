import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { deleteTransaction, TxnDeleteError } from '../../utils/transactionDelete';

const router = Router();
router.use(authenticate);

// Generic transaction delete: DELETE /api/transactions/:type/:id
// :type is the role-matrix / source_type key (e.g. invoice, purchase_order, assembly_build).
router.delete('/:type/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const message = await deleteTransaction(req.params.type, req.params.id, req.user!.companyId, req.user!.id);
    res.json({ success: true, message });
  } catch (e: any) {
    if (e instanceof TxnDeleteError) { res.status(e.status).json({ success: false, error: e.message }); return; }
    console.error('[ERP ERROR] transaction delete:', e.message, e.stack);
    res.status(500).json({ success: false, error: e.message || 'Failed to delete transaction' });
  }
});

export default router;
