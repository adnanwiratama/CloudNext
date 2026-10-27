/**
 * ApprovalFields — read-only display of Approved By + Approval Status
 * for use in transaction forms (edit mode).
 * 
 * Shows:
 * - Approved By: the configured approver name (from GET /:id response)
 * - Approval Status: Draft / Pending Approval / Approved / Rejected (text only, no icons)
 */
export default function ApprovalFields({
  approvalStatus,
  configuredApproverName,
  approvedByName,
  showAlways = false,
}: {
  approvalStatus?: string | null;
  configuredApproverName?: string | null;
  approvedByName?: string | null;
  showAlways?: boolean; // if true, always show even if no approval configured
}) {
  // Always show if showAlways is true, or if approval_status or configuredApproverName exists
  const shouldRender = showAlways || approvalStatus || configuredApproverName;
  if (!shouldRender) return null;

  const statusMap: Record<string, { label: string; cls: string }> = {
    draft: { label: 'Draft', cls: 'text-slate-600' },
    pending_approval: { label: 'Pending Approval', cls: 'text-amber-600' },
    approved: { label: 'Approved', cls: 'text-emerald-600' },
    rejected: { label: 'Rejected', cls: 'text-red-600' },
  };
  const status = approvalStatus || 'draft';
  const statusCfg = statusMap[status] || statusMap.draft;

  // For "Approved By": show the person who actually approved (if approved), else show configured approver
  const approverDisplay = approvedByName || configuredApproverName || '—';

  return (
    <>
      {/* Approved By field */}
      <div>
        <label className="block text-xs text-slate-500 mb-1">Approved By</label>
        <div className="w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 text-slate-700">
          {approverDisplay}
        </div>
      </div>

      {/* Approval Status field */}
      <div>
        <label className="block text-xs text-slate-500 mb-1">Approval Status</label>
        <div className={`w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 font-medium ${statusCfg.cls}`}>
          {statusCfg.label}
        </div>
      </div>
    </>
  );
}
