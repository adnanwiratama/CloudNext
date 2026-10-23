import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

/**
 * Transaction Number field for transaction forms, driven by the
 * Setup → Auto Generated Number configuration (transaction_sequences).
 *
 * - New record, override OFF  → shows muted "Auto Generated Number" (backend assigns on save).
 * - New record, override ON    → editable input (placeholder "Auto Generated Number");
 *                                leave blank to auto-generate, or type a manual number.
 * - Existing record            → shows the already-assigned number (read-only).
 *
 * The parent passes the current value + onChange; when override is off the parent
 * should send an empty documentNumber so the backend auto-generates.
 */
export default function AutoNumberField({
  type, isEdit, value, assignedNumber, onChange, label = 'Transaction Number',
}: {
  type: string;                 // transaction_sequences type, e.g. 'sales_order'
  isEdit: boolean;
  value: string;                // the manual documentNumber being entered (new + override)
  assignedNumber?: string;      // the saved number when editing
  onChange: (v: string) => void;
  label?: string;
}) {
  const { data } = useQuery({
    queryKey: ['auto-number', type],
    queryFn: () => api.get(`/api/settings/auto-numbers/by-type/${type}`).then(r => r.data.data),
    enabled: !!type,
  });
  const allowOverride = !!data?.allowOverride;

  return (
    <div>
      <div className="text-xs text-slate-500 mb-0.5">{label}</div>
      {isEdit ? (
        <div className="text-sm font-medium text-slate-800">{assignedNumber || '—'}</div>
      ) : allowOverride ? (
        <>
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="Auto Generated Number"
            className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400"
          />
          <div className="text-2xs text-slate-400 mt-0.5">Leave blank to auto-generate</div>
        </>
      ) : (
        <div className="text-sm font-medium text-slate-400 italic">Auto Generated Number</div>
      )}
    </div>
  );
}
