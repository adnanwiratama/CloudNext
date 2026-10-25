import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Save, ShieldCheck } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

interface ApprovalType { value: string; label: string; approverUserId: string | null; }
interface UserRow { id: string; name: string; role_name?: string | null; is_active?: boolean; }

export default function ApprovalSettingsPage() {
  const [map, setMap] = useState<Record<string, string>>({}); // record_type -> user id ('' = none)
  const [saving, setSaving] = useState(false);

  const { data: types, isLoading } = useQuery({
    queryKey: ['approval-settings'],
    queryFn: () => api.get('/api/settings/approvals').then(r => r.data.data as ApprovalType[]),
  });

  const { data: users } = useQuery({
    queryKey: ['approval-users'],
    queryFn: () => api.get('/api/settings/users', { params: { limit: 500 } }).then(r => r.data.data as UserRow[]),
  });

  // Seed the editable map from the loaded settings.
  useEffect(() => {
    if (!types) return;
    const m: Record<string, string> = {};
    for (const t of types) m[t.value] = t.approverUserId || '';
    setMap(m);
  }, [types]);

  // Group active users by role for the dropdown optgroups.
  const grouped = useMemo(() => {
    const g: Record<string, UserRow[]> = {};
    for (const u of (users || [])) {
      if (u.is_active === false) continue;
      const role = u.role_name || 'No Role';
      (g[role] = g[role] || []).push(u);
    }
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  }, [users]);

  const save = async () => {
    setSaving(true);
    try {
      const approvals = Object.entries(map).map(([recordType, approverUserId]) => ({ recordType, approverUserId: approverUserId || null }));
      await api.put('/api/settings/approvals', { approvals });
      toast.success('Approval settings saved');
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to save');
    } finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-blue-700 flex items-center justify-center text-white"><ShieldCheck size={16} /></div>
            <h1 className="text-xl font-semibold text-slate-800">Approval Settings</h1>
          </div>
          <button onClick={save} disabled={saving || isLoading} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
          </button>
        </div>
      </div>

      <div className="p-4 max-w-screen-xl mx-auto space-y-3">
        <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2 text-xs text-slate-500">
          Set a default <span className="font-medium text-slate-700">Approved By</span> for each transaction type. The chosen user will be used as the default approver on related transactions.
        </div>

        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600">Transaction Type</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 w-96">Approved By</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={2} className="px-4 py-16 text-center"><Loader2 size={26} className="animate-spin text-blue-500 mx-auto" /></td></tr>
                ) : (types || []).length === 0 ? (
                  <tr><td colSpan={2} className="px-4 py-12 text-center text-slate-400">No transaction types.</td></tr>
                ) : (types || []).map(t => (
                  <tr key={t.value} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-700">{t.label}</td>
                    <td className="px-3 py-2">
                      <select
                        value={map[t.value] || ''}
                        onChange={e => setMap(m => ({ ...m, [t.value]: e.target.value }))}
                        className="w-full border border-slate-300 rounded text-sm px-2 py-1.5 bg-white">
                        <option value="">— None —</option>
                        {grouped.map(([role, list]) => (
                          <optgroup key={role} label={role}>
                            {list.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
