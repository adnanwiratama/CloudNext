/**
 * transactionAudit.ts
 * Utility to read & write transaction_audit_log for any transaction type.
 * Used by all module routes to provide the System Information tab.
 */
import { Router, Request, Response } from 'express';
import db from '../config/database';

/** Insert one audit row into transaction_audit_log */
export async function logTransaction(params: {
  companyId:       string;
  sourceType:      string;
  sourceId:        string;
  action:          string;
  context?:        string;
  changeType?:     string;
  fieldName?:      string;
  oldValue?:       string | null;
  newValue?:       string | null;
  description?:    string;
  performedBy?:    string;
  performedByName?:string;
  ipAddress?:      string;
}): Promise<void> {
  try {
    await db('transaction_audit_log').insert({
      company_id:        params.companyId,
      source_type:       params.sourceType,
      source_id:         params.sourceId,
      action:            params.action,
      context:           params.context        || 'UI',
      change_type:       params.changeType     || (params.action === 'created' ? 'Set' : 'Change'),
      field_name:        params.fieldName      || null,
      old_value:         params.oldValue       || null,
      new_value:         params.newValue       || null,
      description:       params.description    || null,
      performed_by:      params.performedBy    || null,
      performed_by_name: params.performedByName|| null,
      ip_address:        params.ipAddress      || null,
      performed_at:      new Date(),
    });
  } catch (e) {
    console.error('[AUDIT LOG ERROR]', e);
  }
}

/** Compare two objects and log each changed field */
export async function logChanges(params: {
  companyId:        string;
  sourceType:       string;
  sourceId:         string;
  oldData:          Record<string, any>;
  newData:          Record<string, any>;
  fieldLabels?:     Record<string, string>;
  performedBy?:     string;
  performedByName?: string;
  ipAddress?:       string;
}): Promise<void> {
  const { fieldLabels = {} } = params;
  const rows = [];
  for (const key of Object.keys(params.newData)) {
    const oldVal = String(params.oldData[key] ?? '');
    const newVal = String(params.newData[key] ?? '');
    if (oldVal !== newVal && newVal !== '') {
      rows.push({
        company_id:        params.companyId,
        source_type:       params.sourceType,
        source_id:         params.sourceId,
        action:            'updated',
        context:           'UI',
        change_type:       oldVal ? 'Change' : 'Set',
        field_name:        fieldLabels[key] || key,
        old_value:         oldVal || null,
        new_value:         newVal,
        description:       `${fieldLabels[key]||key}: "${oldVal}" → "${newVal}"`,
        performed_by:      params.performedBy    || null,
        performed_by_name: params.performedByName|| null,
        ip_address:        params.ipAddress      || null,
        performed_at:      new Date(),
      });
    }
  }
  if (rows.length > 0) {
    try { await db('transaction_audit_log').insert(rows); } catch (e) { console.error('[AUDIT LOG ERROR]', e); }
  }
}

/**
 * Attach GET /:id/audit to any router for the System Information tab.
 * Usage: attachAuditRoute(router, 'sales_order');
 */
export function attachAuditRoute(router: Router, sourceType: string): void {
  router.get('/:id/audit', async (req: Request, res: Response): Promise<void> => {
    try {
      const logs = await db('transaction_audit_log')
        .where({ company_id: req.user!.companyId, source_type: sourceType, source_id: req.params.id })
        .orderBy('performed_at', 'desc')
        .limit(200);
      res.json({ success: true, data: logs });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });
}

/**
 * Fetch journal entries + their lines for GL Impact tab
 * Usage: const journalEntries = await fetchJEWithLines(sourceType, sourceId, db)
 */
export async function fetchJEWithLines(sourceType: string, sourceId: string, dbInstance: any): Promise<any[]> {
  const entries = await dbInstance('journal_entries').where({ source_type: sourceType, source_id: sourceId });
  if (!entries.length) return [];
  const ids = entries.map((e: any) => e.id);
  const lines = await dbInstance('journal_entry_lines as jel')
    .leftJoin('accounts as a', 'jel.account_id', 'a.id')
    .leftJoin('departments as d', 'jel.department_id', 'd.id')
    .leftJoin('locations as l', 'jel.location_id', 'l.id')
    .whereIn('jel.journal_id', ids)
    .orderBy(['jel.journal_id','jel.line_number'])
    .select('jel.*','a.code as account_code','a.name as account_name','d.name as department_name','l.name as location_name');
  return entries.map((e: any) => ({ ...e, lines: lines.filter((l: any) => l.journal_id === e.id) }));
}
