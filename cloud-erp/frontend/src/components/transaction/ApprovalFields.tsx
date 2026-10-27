import { Edit3, Clock, CheckCircle2, XCircle } from 'lucide-react';

/**
 * ApprovalFields — read-only display of Approved By + Approval Status
 * for use in transaction forms (edit mode).
 * 
 * Shows:
 * - Approved By: the configured approver name (from GET /:id response)
 * - Approval Status: Draft / Pending Approval / Approved / Rejected
 */
export default function ApprovalFields({
  approvalStatus,
  configuredApproverName,
  approvedByName,
}: {
  approvalStatus?: string | null;
  configuredApproverName?: string | null;
  approvedByName?: string | null;
}) {
  // Don't render if there's no approval_status (no approval flow configured or old record)
  if (!approvalStatus && !configuredApproverName) return null;

  const statusMap: Record<string, { label: string; icon: any; cls: string }> = {
    draft: { label: 'Draft', icon: Edit3, cls: 'text-slate-600' },
    pending_approval: { label: 'Pending Approval', icon: Clock, cls: 'text-amber-600' },
    approved: { label: 'Approved', icon: CheckCircle2, cls: 'text-emerald-600' },
    rejected: { label: 'Rejected / Draft', icon: XCircle, cls: 'text-red-600' },
  };
  const status = approvalStatus || 'draft';
  const statusCfg = statusMap[status] || statusMap.draft;
  const StatusIcon = statusCfg.icon;

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
        <div className={`w-full border border-slate-200 rounded text-sm px-2 py-1.5 bg-slate-50 flex items-center gap-1.5 font-medium ${statusCfg.cls}`}>
          <StatusIcon size={14} />
          {statusCfg.label}
        </div>
      </div>
    </>
  );
}
