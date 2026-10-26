import { useState } from 'react';
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import toast from 'react-hot-toast';

// Approval status badge — shows current approval state inline.
export function ApprovalBadge({ status }: { status?: string | null }) {
  if (!status || status === 'approved') return null; // approved = no badge needed (normal flow)
  if (status === 'pending_approval')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
        <Clock size={11} /> Pending Approval
      </span>
    );
  if (status === 'rejected')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
        <XCircle size={11} /> Rejected
      </span>
    );
  return null;
}

// Approve / Reject action bar — shown on detail pages when approval_status is pending.
// approveUrl  : e.g. '/api/sales/invoices/ID/approve'
// rejectUrl   : e.g. '/api/sales/invoices/ID/reject'
// queryKeys   : react-query keys to invalidate on success
// approvedBy  : the user name who approved (shown when status=approved)
// approvedAt  : ISO date string when approved
export default function ApprovalBar({
  approvalStatus,
  approvedByName,
  approvedAt,
  approveUrl,
  rejectUrl,
  queryKeys,
}: {
  approvalStatus?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  approveUrl: string;
  rejectUrl: string;
  queryKeys: (string | undefined)[];
}) {
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const approveMutation = useMutation({
    mutationFn: () => api.post(approveUrl),
    onSuccess: () => {
      toast.success('Approved — GL posted and inventory updated');
      qc.invalidateQueries({ queryKey: queryKeys.filter(Boolean) as string[] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to approve'),
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.post(rejectUrl, { reason: rejectReason || 'Rejected by approver' }),
    onSuccess: () => {
      toast.success('Rejected');
      setRejecting(false);
      qc.invalidateQueries({ queryKey: queryKeys.filter(Boolean) as string[] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to reject'),
  });

  // Show "Approved by" info when already approved (and an approver name is available).
  if (approvalStatus === 'approved' && approvedByName) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-700">
        <CheckCircle2 size={13} />
        <span>Approved by <strong>{approvedByName}</strong>{approvedAt ? ` on ${new Date(approvedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}</span>
      </div>
    );
  }

  // Pending approval — show Approve / Reject buttons.
  if (approvalStatus === 'pending_approval') {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
          <Clock size={11} /> Pending Approval
        </span>
        <button
          onClick={() => approveMutation.mutate()}
          disabled={approveMutation.isPending}
          className="flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white text-xs font-medium rounded hover:bg-emerald-700 disabled:opacity-60">
          {approveMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Approve
        </button>

        {rejecting ? (
          <div className="flex items-center gap-1">
            <input
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason (optional)"
              className="border border-slate-300 rounded text-xs px-2 py-1 w-44" />
            <button
              onClick={() => rejectMutation.mutate()}
              disabled={rejectMutation.isPending}
              className="flex items-center gap-1 px-3 py-1 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 disabled:opacity-60">
              {rejectMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />} Confirm Reject
            </button>
            <button onClick={() => setRejecting(false)} className="text-xs text-slate-500 hover:text-slate-700 px-1">Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setRejecting(true)}
            className="flex items-center gap-1 px-3 py-1 border border-red-300 text-red-600 text-xs font-medium rounded hover:bg-red-50">
            <XCircle size={11} /> Reject
          </button>
        )}
      </div>
    );
  }

  // Rejected state.
  if (approvalStatus === 'rejected') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
        <XCircle size={13} /> Rejected — GL not posted
      </div>
    );
  }

  return null;
}
