import db from '../config/database';

// Returns the configured default approver (user id) for a transaction type, or
// null if none is set. Backed by the approval_settings table (Setup → Approvals).
// Safe when the table doesn't exist yet (returns null).
export async function getConfiguredApprover(companyId: string, recordType: string): Promise<string | null> {
  try {
    if (!(await db.schema.hasTable('approval_settings'))) return null;
    const row = await db('approval_settings')
      .where({ company_id: companyId, record_type: recordType })
      .first();
    return row?.approver_user_id || null;
  } catch {
    return null;
  }
}

// Convenience: the approver to stamp on a record = configured approver, else the
// user performing the action (fallback preserves prior behavior).
export async function resolveApprover(companyId: string, recordType: string, actingUserId: string): Promise<string> {
  const configured = await getConfiguredApprover(companyId, recordType);
  return configured || actingUserId;
}
