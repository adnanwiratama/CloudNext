import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import db from '../../config/database';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
router.use(authenticate);

// ── Storage setup ─────────────────────────────────────────────────────────────
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const companyId = (req as any).user?.companyId || 'default';
    const dir = path.join(UPLOAD_DIR, companyId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const name = `${uuidv4()}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    // Allow common file types
    const allowed = /\.(pdf|doc|docx|xls|xlsx|csv|png|jpg|jpeg|gif|webp|zip|rar|txt|ppt|pptx|mp4|mov|avi)$/i;
    if (allowed.test(file.originalname)) return cb(null, true);
    cb(new Error(`File type not allowed: ${path.extname(file.originalname)}`));
  },
});

// ── GET /files — list attachments for a record ────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sourceType, sourceId } = req.query;
    if (!sourceType || !sourceId) {
      res.status(400).json({ success: false, error: 'sourceType and sourceId required' });
      return;
    }
    const files = await db('file_cabinet')
      .where({ company_id: req.user!.companyId, source_type: sourceType as string, source_id: sourceId as string, is_deleted: false })
      .orderBy('created_at', 'asc');
    res.json({ success: true, data: files });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ── POST /files/upload — upload one or more files ─────────────────────────────
router.post('/upload', upload.array('files', 20), async (req: Request, res: Response): Promise<void> => {
  try {
    const { sourceType, sourceId, titles, descriptions, folder } = req.body;
    if (!sourceType || !sourceId) {
      res.status(400).json({ success: false, error: 'sourceType and sourceId required' }); return;
    }
    const uploaded = req.files as Express.Multer.File[];
    if (!uploaded || uploaded.length === 0) {
      res.status(400).json({ success: false, error: 'No files uploaded' }); return;
    }

    const titlesArr = Array.isArray(titles) ? titles : [titles || ''];
    const descsArr  = Array.isArray(descriptions) ? descriptions : [descriptions || ''];

    const inserted = [];
    for (let i = 0; i < uploaded.length; i++) {
      const file = uploaded[i];
      const ext  = path.extname(file.originalname).replace('.','').toLowerCase();
      const companyId = req.user!.companyId;
      const storagePath = path.join(companyId, file.filename);

      const [record] = await db('file_cabinet').insert({
        company_id:      companyId,
        source_type:     sourceType,
        source_id:       sourceId,
        file_name:       file.filename,
        original_name:   file.originalname,
        mime_type:       file.mimetype,
        file_size:       file.size,
        file_ext:        ext,
        storage_path:    storagePath,
        title:           titlesArr[i] || file.originalname,
        description:     descsArr[i]  || null,
        folder:          folder || 'Attachments',
        uploaded_by:     req.user!.id,
        uploaded_by_name: (req as any).user?.name || 'System',
      }).returning('*');
      inserted.push(record);
    }
    res.status(201).json({ success: true, data: inserted });
  } catch (e: any) {
    console.error('[UPLOAD ERROR]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /files/:id/download — download a file ─────────────────────────────────
router.get('/:id/download', async (req: Request, res: Response): Promise<void> => {
  try {
    const file = await db('file_cabinet')
      .where({ id: req.params.id, company_id: req.user!.companyId, is_deleted: false })
      .first();
    if (!file) { res.status(404).json({ success: false, error: 'File not found' }); return; }

    const fullPath = path.join(UPLOAD_DIR, file.storage_path);
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ success: false, error: 'File not found on disk' }); return;
    }
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.sendFile(fullPath);
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ── GET /files/:id/preview — inline preview for images/pdf ───────────────────
router.get('/:id/preview', async (req: Request, res: Response): Promise<void> => {
  try {
    const file = await db('file_cabinet')
      .where({ id: req.params.id, company_id: req.user!.companyId, is_deleted: false })
      .first();
    if (!file) { res.status(404).json({ success: false, error: 'File not found' }); return; }

    const fullPath = path.join(UPLOAD_DIR, file.storage_path);
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ success: false, error: 'File not found on disk' }); return;
    }
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.original_name)}"`);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.sendFile(fullPath);
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ── PATCH /files/:id — update title/description ───────────────────────────────
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, folder } = req.body;
    const [file] = await db('file_cabinet')
      .where({ id: req.params.id, company_id: req.user!.companyId })
      .update({ title, description, folder, updated_at: new Date() })
      .returning('*');
    res.json({ success: true, data: file });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ── DELETE /files/:id — soft delete ───────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const file = await db('file_cabinet')
      .where({ id: req.params.id, company_id: req.user!.companyId })
      .first();
    if (!file) { res.status(404).json({ success: false, error: 'File not found' }); return; }

    // Soft delete
    await db('file_cabinet').where({ id: req.params.id }).update({ is_deleted: true, updated_at: new Date() });

    // Optional: also remove from disk
    const fullPath = path.join(UPLOAD_DIR, file.storage_path);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ── GET /files/cabinet — list all files for company (File Cabinet view) ───────
router.get('/cabinet', async (req: Request, res: Response): Promise<void> => {
  try {
    const { folder, sourceType, search } = req.query;
    let q = db('file_cabinet').where({ company_id: req.user!.companyId, is_deleted: false });
    if (folder)     q = q.where({ folder: folder as string });
    if (sourceType) q = q.where({ source_type: sourceType as string });
    if (search)     q = q.whereILike('original_name', `%${search}%`);
    const files = await q.orderBy('created_at', 'desc').limit(200);
    res.json({ success: true, data: files });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

export default router;
