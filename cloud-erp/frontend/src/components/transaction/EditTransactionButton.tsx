import { useNavigate } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { usePermissions } from '../../hooks/usePermissions';

interface Props {
  permKey: string;     // role-matrix key, e.g. 'invoice', 'purchase_order'
  to: string;          // route to the edit form
  label?: string;      // button label (default 'Edit')
}

// Shared Edit button for transaction detail pages. Navigates to the edit form
// and is hidden for roles without edit (EDIT) access for the given key.
export default function EditTransactionButton({ permKey, to, label = 'Edit' }: Props) {
  const navigate = useNavigate();
  const { canEdit } = usePermissions();

  if (!canEdit(permKey)) return null;

  return (
    <button
      onClick={() => navigate(to)}
      className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">
      <Pencil size={13}/> {label}
    </button>
  );
}
