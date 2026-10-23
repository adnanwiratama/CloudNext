import { Router, Request, Response } from 'express';
import db from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { IMPORT_TYPES, getImportType } from '../settings/importSchema';

// ─────────────────────────────────────────────────────────────────────────────
// Custom Report Builder (NetSuite-style Saved Search).
//
// Mounted at /api/reports/custom. Endpoints:
//   GET    /types                 → selectable record types (from the registry)
//   GET    /fields?type=...       → column catalog for a type (header + line),
//                                   union of real DB columns + registry labels
//   POST   /run                   → run an ad-hoc report (type, columns, filters)
//   GET    /                      → list saved reports (public + own private)
//   POST   /                      → save a report
//   GET    /:id                   → load one saved report
//   PUT    /:id                   → update (creator only)
//   DELETE /:id                   → delete (creator only)
//   POST   /:id/run               → run a saved report (optionally override filters)
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();
router.use(authenticate);

// Only transaction types are offered for reporting (master-data too would be noise,
// but we include every registry type so the catalog is complete).
type FieldType = 'string' | 'number' | 'boolean' | 'date';

interface CatalogColumn {
  key: string;        // qualified alias used in queries/results, e.g. "h.order_number"
  column: string;     // raw column name
  source: 'header' | 'line';
  label: string;
  type: FieldType;
}

// Humanize a raw column name → "order_number" → "Order Number".
function humanize(col: string): string {
  return col.replace(/_/g, ' ').replace(/\bid\b/gi, 'ID').replace(/\b\w/g, c => c.toUpperCase());
}

// Map a Postgres data_type to our simple field type (for filter widgets + coercion).
function pgTypeToFieldType(dataType: string): FieldType {
  const d = dataType.toLowerCase();
  if (/(int|numeric|decimal|real|double|money)/.test(d)) return 'number';
  if (/bool/.test(d)) return 'boolean';
  if (/(date|time)/.test(d)) return 'date';
  return 'string';
}

// Read the real columns of a table from information_schema (server DB may differ
// from migrations since it was restored from localhost).
async function tableColumns(table: string): Promise<{ column: string; type: FieldType }[]> {
  const rows = await db('information_schema.columns')
    .where({ table_schema: 'public', table_name: table })
    .select('column_name', 'data_type')
    .orderBy('ordinal_position');
  return (rows as any[]).map(r => ({ column: r.column_name, type: pgTypeToFieldType(r.data_type) }));
}

// Build the full column catalog for a record type: header columns (prefixed h.)
// plus line columns (prefixed l.) when the type has a line table. Labels come from
// the import registry when available, else a humanized column name.
async function buildCatalog(type: string): Promise<{ def: any; columns: CatalogColumn[] } | null> {
  const def = getImportType(type);
  if (!def) return null;

  // Registry label lookup by raw key (header + line fields share the `key`).
  const labelByKey: Record<string, string> = {};
  for (const f of def.fields) labelByKey[f.key] = f.label.replace(/^Line:\s*/i, '');

  const columns: CatalogColumn[] = [];

  const headerCols = await tableColumns(def.table);
  for (const c of headerCols) {
    columns.push({
      key: `h.${c.column}`, column: c.column, source: 'header',
      label: labelByKey[c.column] || humanize(c.column), type: c.type,
    });
  }

  if (def.lineTable) {
    const lineCols = await tableColumns(def.lineTable);
    for (const c of lineCols) {
      columns.push({
        key: `l.${c.column}`, column: c.column, source: 'line',
        label: `Line: ${labelByKey[c.column] || humanize(c.column)}`, type: c.type,
      });
    }
  }
  return { def, columns };
}

// ── GET /types : the record types you can report on ──────────────────────────
router.get('/types', (_req: Request, res: Response) => {
  const types = IMPORT_TYPES.map(t => ({ value: t.value, label: t.label, category: t.category, hasLines: !!t.lineTable }));
  res.json({ success: true, data: types });
});

// ── GET /fields?type=... : column catalog for a type ─────────────────────────
router.get('/fields', async (req: Request, res: Response): Promise<void> => {
  try {
    const type = String(req.query.type || '');
    const cat = await buildCatalog(type);
    if (!cat) { res.status(400).json({ success: false, error: 'Unknown record type' }); return; }
    res.json({
      success: true,
      data: {
        type, label: cat.def.label, table: cat.def.table, lineTable: cat.def.lineTable || null,
        columns: cat.columns,
      },
    });
  } catch (e: any) { console.error('[ERP ERROR] custom-report fields:', e.message); res.status(500).json({ success: false, error: `Failed to load fields: ${e.message}` }); }
});

// Allowed filter operators → how they translate to SQL (all values parameterized).
const OPERATORS = new Set(['=', '!=', '>', '>=', '<', '<=', 'contains', 'starts', 'ends', 'in', 'between', 'is_empty', 'is_not_empty']);

// Build and run the report query. Returns { columns, rows }.
async function runReport(opts: {
  companyId: string;
  type: string;
  columns: string[];                 // catalog keys like "h.order_number"
  filters: { field: string; op: string; value?: any; value2?: any }[];
  limit?: number;
}): Promise<{ columns: CatalogColumn[]; rows: any[] }> {
  const cat = await buildCatalog(opts.type);
  if (!cat) throw new Error('Unknown record type');
  const { def, columns: catalog } = cat;

  // Whitelist: only catalog keys are usable anywhere (prevents SQL injection).
  const byKey: Record<string, CatalogColumn> = {};
  for (const c of catalog) byKey[c.key] = c;

  // Resolve selected columns (default: a sensible subset if none chosen).
  let selected = (opts.columns || []).filter(k => byKey[k]);
  if (selected.length === 0) selected = catalog.slice(0, 8).map(c => c.key);

  const q = db(`${def.table} as h`).where('h.company_id', opts.companyId);
  if (def.lineTable && def.lineFk) q.leftJoin(`${def.lineTable} as l`, `l.${def.lineFk}`, 'h.id');

  // SELECT: alias each as "src__column" so header/line collisions don't clash.
  const selectExprs = selected.map(k => {
    const c = byKey[k];
    const alias = `${c.source === 'header' ? 'h' : 'l'}__${c.column}`;
    return db.raw('??.?? as ??', [c.source === 'header' ? 'h' : 'l', c.column, alias]);
  });
  q.select(selectExprs);

  // Filters — every field validated against the whitelist; values parameterized.
  for (const f of (opts.filters || [])) {
    const c = byKey[f.field];
    if (!c || !OPERATORS.has(f.op)) continue; // silently skip invalid filter rows
    const tbl = c.source === 'header' ? 'h' : 'l';
    const colStr = `${tbl}.${c.column}`;        // safe: tbl is h/l, column is whitelisted
    // Use whereRaw with ?? (identifier) + ? (value) placeholders — Knex escapes both,
    // so this is type-safe and injection-safe regardless of operator.
    switch (f.op) {
      case '=': q.whereRaw('?? = ?', [colStr, f.value]); break;
      case '!=': q.whereRaw('?? <> ?', [colStr, f.value]); break;
      case '>': q.whereRaw('?? > ?', [colStr, f.value]); break;
      case '>=': q.whereRaw('?? >= ?', [colStr, f.value]); break;
      case '<': q.whereRaw('?? < ?', [colStr, f.value]); break;
      case '<=': q.whereRaw('?? <= ?', [colStr, f.value]); break;
      case 'contains': q.whereRaw('?? ILIKE ?', [colStr, `%${f.value}%`]); break;
      case 'starts': q.whereRaw('?? ILIKE ?', [colStr, `${f.value}%`]); break;
      case 'ends': q.whereRaw('?? ILIKE ?', [colStr, `%${f.value}`]); break;
      case 'in': {
        const list = Array.isArray(f.value) ? f.value : String(f.value).split(',').map(s => s.trim());
        if (list.length) q.whereRaw(`?? IN (${list.map(() => '?').join(',')})`, [colStr, ...list]);
        break;
      }
      case 'between': if (f.value != null && f.value2 != null) q.whereRaw('?? BETWEEN ? AND ?', [colStr, f.value, f.value2]); break;
      case 'is_empty': q.whereRaw('(?? IS NULL OR ?? = ?)', [colStr, colStr, '']); break;
      case 'is_not_empty': q.whereRaw('(?? IS NOT NULL AND ?? <> ?)', [colStr, colStr, '']); break;
    }
  }

  // Stable ordering by the header's id (and line id if present) + a safety limit.
  q.orderBy('h.created_at', 'desc');
  q.limit(Math.min(opts.limit ?? 1000, 5000));

  const rows = await q;
  // Return the catalog entries for the selected columns (with their alias key) so
  // the frontend can render headers in the chosen order.
  const outColumns = selected.map(k => {
    const c = byKey[k];
    return { ...c, key: `${c.source === 'header' ? 'h' : 'l'}__${c.column}` };
  });
  return { columns: outColumns, rows };
}

// ── POST /run : run an ad-hoc report ─────────────────────────────────────────
router.post('/run', async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, columns, filters, limit } = req.body || {};
    if (!type) { res.status(400).json({ success: false, error: 'record type is required' }); return; }
    const result = await runReport({ companyId: req.user!.companyId, type, columns: columns || [], filters: filters || [], limit });
    res.json({ success: true, data: result });
  } catch (e: any) { console.error('[ERP ERROR] custom-report run:', e.message, e.stack); res.status(500).json({ success: false, error: `Failed to run report: ${e.message}` }); }
});

// ── GET / : list saved reports (public + own private) ────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const uid = req.user!.id;
    const rows = await db('custom_reports')
      .where({ company_id: companyId })
      .andWhere(qb => qb.where('visibility', 'public').orWhere('created_by', uid))
      .orderBy('updated_at', 'desc')
      .select('id', 'name', 'record_type', 'visibility', 'description', 'created_by', 'created_by_name', 'created_at', 'updated_at');
    const data = (rows as any[]).map(r => ({ ...r, isOwner: r.created_by === uid }));
    res.json({ success: true, data });
  } catch (e: any) { console.error('[ERP ERROR] custom-report list:', e.message); res.status(500).json({ success: false, error: `Failed to list reports: ${e.message}` }); }
});

// ── POST / : save a report ───────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, recordType, columns, filters, visibility, description } = req.body || {};
    if (!name || !recordType) { res.status(400).json({ success: false, error: 'name and recordType are required' }); return; }
    if (!getImportType(recordType)) { res.status(400).json({ success: false, error: 'Unknown record type' }); return; }
    const vis = visibility === 'public' ? 'public' : 'private';
    const [row] = await db('custom_reports').insert({
      company_id: req.user!.companyId,
      name, record_type: recordType,
      columns: JSON.stringify(columns || []),
      filters: JSON.stringify(filters || []),
      visibility: vis,
      description: description || null,
      created_by: req.user!.id,
      created_by_name: req.user!.name,
      updated_at: new Date(),
    }).returning('*');
    res.status(201).json({ success: true, data: row });
  } catch (e: any) { console.error('[ERP ERROR] custom-report create:', e.message); res.status(500).json({ success: false, error: `Failed to save report: ${e.message}` }); }
});

// ── GET /:id : load one saved report ─────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.id;
    const row = await db('custom_reports').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!row) { res.status(404).json({ success: false, error: 'Report not found' }); return; }
    if (row.visibility !== 'public' && row.created_by !== uid) { res.status(403).json({ success: false, error: 'This report is private' }); return; }
    const parse = (v: any) => (typeof v === 'string' ? JSON.parse(v || '[]') : (v || []));
    res.json({ success: true, data: { ...row, columns: parse(row.columns), filters: parse(row.filters), isOwner: row.created_by === uid } });
  } catch (e: any) { console.error('[ERP ERROR] custom-report get:', e.message); res.status(500).json({ success: false, error: `Failed to load report: ${e.message}` }); }
});

// ── PUT /:id : update (creator only) ─────────────────────────────────────────
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const row = await db('custom_reports').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!row) { res.status(404).json({ success: false, error: 'Report not found' }); return; }
    if (row.created_by !== req.user!.id) { res.status(403).json({ success: false, error: 'Only the creator can edit this report' }); return; }
    const { name, columns, filters, visibility, description } = req.body || {};
    const update: any = { updated_at: new Date() };
    if (name !== undefined) update.name = name;
    if (columns !== undefined) update.columns = JSON.stringify(columns);
    if (filters !== undefined) update.filters = JSON.stringify(filters);
    if (visibility !== undefined) update.visibility = visibility === 'public' ? 'public' : 'private';
    if (description !== undefined) update.description = description || null;
    const [updated] = await db('custom_reports').where({ id: row.id }).update(update).returning('*');
    res.json({ success: true, data: updated });
  } catch (e: any) { console.error('[ERP ERROR] custom-report update:', e.message); res.status(500).json({ success: false, error: `Failed to update report: ${e.message}` }); }
});

// ── DELETE /:id : delete (creator only) ──────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const row = await db('custom_reports').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!row) { res.status(404).json({ success: false, error: 'Report not found' }); return; }
    if (row.created_by !== req.user!.id) { res.status(403).json({ success: false, error: 'Only the creator can delete this report' }); return; }
    await db('custom_reports').where({ id: row.id }).del();
    res.json({ success: true, message: 'Report deleted' });
  } catch (e: any) { console.error('[ERP ERROR] custom-report delete:', e.message); res.status(500).json({ success: false, error: `Failed to delete report: ${e.message}` }); }
});

// ── POST /:id/run : run a saved report (optional filter override) ────────────
router.post('/:id/run', async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.id;
    const row = await db('custom_reports').where({ id: req.params.id, company_id: req.user!.companyId }).first();
    if (!row) { res.status(404).json({ success: false, error: 'Report not found' }); return; }
    if (row.visibility !== 'public' && row.created_by !== uid) { res.status(403).json({ success: false, error: 'This report is private' }); return; }
    const parse = (v: any) => (typeof v === 'string' ? JSON.parse(v || '[]') : (v || []));
    const columns = parse(row.columns);
    const filters = (req.body && req.body.filters) ? req.body.filters : parse(row.filters);
    const result = await runReport({ companyId: req.user!.companyId, type: row.record_type, columns, filters, limit: req.body?.limit });
    res.json({ success: true, data: { ...result, name: row.name, recordType: row.record_type } });
  } catch (e: any) { console.error('[ERP ERROR] custom-report saved run:', e.message); res.status(500).json({ success: false, error: `Failed to run report: ${e.message}` }); }
});

export default router;
