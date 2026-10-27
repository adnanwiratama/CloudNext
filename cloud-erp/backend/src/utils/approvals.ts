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

// ─── Approval-gated posting ──────────────────────────────────────────────────
// A transaction type REQUIRES approval only when an approver is configured for it
// (Option A: conditional). Types without a configured approver keep posting
// immediately on create, exactly as before (backward compatible).
export async function isApprovalRequired(companyId: string, recordType: string): Promise<boolean> {
  const configured = await getConfiguredApprover(companyId, recordType);
  return !!configured;
}

// Decide the create-time state for a new record of `recordType`:
//   { approvalRequired, approvalStatus, nonPosting }
// - approvalRequired=true  → approvalStatus 'pending_approval', nonPosting=true
//   (GL created as non-posting, inventory deferred; approve step finalizes).
// - approvalRequired=false → approvalStatus 'approved', nonPosting=false
//   (posts immediately, legacy behavior).
export async function creationApprovalState(companyId: string, recordType: string): Promise<{
  approvalRequired: boolean; approvalStatus: string; nonPosting: boolean;
}> {
  const approvalRequired = await isApprovalRequired(companyId, recordType);
  return approvalRequired
    ? { approvalRequired: true, approvalStatus: 'draft', nonPosting: true }
    : { approvalRequired: false, approvalStatus: 'approved', nonPosting: false };
}


// Returns the configured approver's id + name (for display on detail pages).
// Returns null when no approver is configured for the type.
export async function getConfiguredApproverInfo(
  companyId: string, recordType: string
): Promise<{ id: string; name: string } | null> {
  const approverId = await getConfiguredApprover(companyId, recordType);
  if (!approverId) return null;
  try {
    const user = await db('users').where({ id: approverId, company_id: companyId }).first();
    return user ? { id: user.id, name: user.name } : null;
  } catch { return null; }
}
