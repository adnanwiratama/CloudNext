import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { usePermissions } from '../../hooks/usePermissions';

interface Props {
  type: string;        // source_type key, e.g. 'invoice', 'purchase_order'
  id: string;          // record id
  listPath: string;    // where to go after delete
  label?: string;      // document label for the confirm text
}

// Shared Delete button for transaction detail pages. Calls the generic
// DELETE /api/transactions/:type/:id (which reverses GL/inventory) and returns
// to the list. Hidden for roles without delete (FULL) access.
export default function DeleteTransactionButton({ type, id, listPath, label = 'this record' }: Props) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const { canDelete } = usePermissions();

  const mutation = useMutation({
    mutationFn: () => api.delete(`/api/transactions/${type}/${id}`),
    onSuccess: (res: any) => { toast.success(res.data?.message || 'Record deleted'); navigate(listPath); },
    onError: (e: any) => { setBusy(false); toast.error(e.response?.data?.error || 'Failed to delete'); },
  });

  if (!canDelete(type)) return null;

  return (
    <button
      onClick={() => { if (confirm(`Delete ${label}? This cannot be undone and will reverse its GL/inventory impact.`)) { setBusy(true); mutation.mutate(); } }}
      disabled={busy || mutation.isPending}
      className="flex items-center gap-1 px-3 py-1.5 border border-red-300 bg-white text-sm text-red-600 rounded hover:bg-red-50 disabled:opacity-60">
      {busy || mutation.isPending ? <Loader2 size={13} className="animate-spin"/> : <Trash2 size={13}/>} Delete
    </button>
  );
}
