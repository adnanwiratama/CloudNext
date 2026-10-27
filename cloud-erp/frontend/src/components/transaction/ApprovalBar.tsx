import { useState } from 'react';
import { CheckCircle2, XCircle, Clock, Loader2, Send, Edit3 } from 'lucide-react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';

// ── Approval status badge (compact, shown anywhere) ───────────────────────────
export function ApprovalBadge({ status }: { status?: string | null }) {
  if (!status || status === 'approved') return null;
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-600' },
    pending_approval: { label: 'Pending Approval', cls: 'bg-amber-100 text-amber-700' },
    rejected: { label: 'Rejected / Draft', cls: 'bg-red-100 text-red-700' },
  };
  const cfg = map[status] || map.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      {status === 'pending_approval' && <Clock size={11} />}
      {(status === 'draft' || status === 'rejected') && <Edit3 size={11} />}
      {cfg.label}
    </span>
  );
}

// ── ApprovalBar — full action bar for detail pages ────────────────────────────
// Props:
//   recordType : e.g. 'invoices'  (used to fetch configured approver from settings)
//   approvalStatus : current value of the record's approval_status field
//   approvedByName : name shown after approval (from approved_by_name)
//   approvedAt : ISO date string when the record was approved
//   submitUrl  : POST /:id/submit  (any user can submit)
//   approveUrl : POST /:id/approve  (configured approver + admins only)
//   rejectUrl  : POST /:id/reject   (configured approver + admins only)
//   queryKeys  : react-query keys to invalidate on any action
export default function ApprovalBar({
  recordType,
  approvalStatus,
  approvedByName,
  approvedAt,
  submitUrl,
  approveUrl,
  rejectUrl,
  queryKeys,
  // Optionally pass configured_approver_id/name directly from the detail response
  // (if the backend already includes it); otherwise it's fetched here.
  configuredApproverId,
  configuredApproverName,
}: {
  recordType: string;
  approvalStatus?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  submitUrl?: string;
  approveUrl?: string;
  rejectUrl?: string;
  queryKeys: (string | undefined)[];
  configuredApproverId?: string | null;
  configuredApproverName?: string | null;
}) {
  const qc = useQueryClient();
  const user = useAuthStore(s => s.user);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Fetch configured approver from settings if not already provided.
  const { data: settingsData } = useQuery({
    queryKey: ['approval-setting', recordType],
    queryFn: () => api.get(`/api/settings/approvals/${recordType}`).then(r => r.data.data),
    enabled: !!recordType && !configuredApproverId,
    staleTime: 60000,
  });
  const cfgApproverId = configuredApproverId || settingsData?.approverUserId || null;
  const cfgApproverName = configuredApproverName
    || (settingsData?.approverUserId ? 'Configured Approver' : null); // backend doesn't return name from this endpoint; use passed prop

  // Who can Approve/Reject?
  // - The configured approver (by id match)
  // - Any admin user
  const canApproveReject = user?.isAdmin || (cfgApproverId && user?.id === cfgApproverId);

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.filter(Boolean) as string[] });

  const submitMutation = useMutation({
    mutationFn: () => submitUrl ? api.post(submitUrl) : Promise.reject(new Error('No submit URL')),
    onSuccess: () => { toast.success('Submitted for approval'); invalidate(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to submit'),
  });

  const approveMutation = useMutation({
    mutationFn: () => approveUrl ? api.post(approveUrl) : Promise.reject(new Error('No approve URL')),
    onSuccess: () => { toast.success('Approved — GL posted'); invalidate(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to approve'),
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectUrl ? api.post(rejectUrl, { reason: rejectReason || 'Rejected by approver' }) : Promise.reject(new Error('No reject URL')),
    onSuccess: () => { toast.success('Rejected — record returned to Draft'); setRejecting(false); invalidate(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to reject'),
  });

  const status = approvalStatus || 'approved'; // default to approved (no gate) when field absent

  // ── APPROVED ────────────────────────────────────────────────────────────────
  if (status === 'approved' && approvedByName) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-700">
        <CheckCircle2 size={13} />
        <span>Approved by <strong>{approvedByName}</strong>
          {approvedAt ? ` · ${new Date(approvedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
        </span>
      </div>
    );
  }

  // ── DRAFT (or rejected back to draft) ────────────────────────────────────────
  if (status === 'draft' || status === 'rejected') {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
          <Edit3 size={11} /> {status === 'rejected' ? 'Returned to Draft' : 'Draft'}
        </span>
        {cfgApproverName && (
          <span className="text-xs text-slate-400">Approver: <strong className="text-slate-600">{cfgApproverName}</strong></span>
        )}
        <button
          onClick={() => submitMutation.mutate()}
          disabled={submitMutation.isPending}
          className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-60">
          {submitMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
          Submit for Approval
        </button>
      </div>
    );
  }

  // ── PENDING APPROVAL ──────────────────────────────────────────────────────────
  if (status === 'pending_approval') {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
          <Clock size={11} /> Pending Approval
          {cfgApproverName && <span className="opacity-70"> · {cfgApproverName}</span>}
        </span>

        {/* Approve / Reject visible only to the configured approver and admins */}
        {canApproveReject && (
          <>
            <button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white text-xs font-medium rounded hover:bg-emerald-700 disabled:opacity-60">
              {approveMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Approve
            </button>

            {rejecting ? (
              <div className="flex items-center gap-1">
                <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                  placeholder="Reason (optional)" className="border border-slate-300 rounded text-xs px-2 py-1 w-44" />
                <button onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}
                  className="flex items-center gap-1 px-3 py-1 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 disabled:opacity-60">
                  {rejectMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />} Confirm
                </button>
                <button onClick={() => setRejecting(false)} className="text-xs text-slate-500 hover:text-slate-700 px-1">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setRejecting(true)}
                className="flex items-center gap-1 px-3 py-1 border border-red-300 text-red-600 text-xs font-medium rounded hover:bg-red-50">
                <XCircle size={11} /> Reject
              </button>
            )}
          </>
        )}
        {!canApproveReject && (
          <span className="text-xs text-slate-400 italic">Waiting for approver to action</span>
        )}
      </div>
    );
  }

  return null;
}
