import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Lock, Unlock, Loader2, CalendarDays, X } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function AccountingPeriodsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '', fiscalYear: new Date().getFullYear().toString() });

  const { data, isLoading } = useQuery({
    queryKey: ['accounting-periods'],
    queryFn: () => api.get('/api/settings/accounting-periods').then(r => r.data.data || []),
  });

  const createMutation = useMutation({
    mutationFn: (d: any) => api.post('/api/settings/accounting-periods', d),
    onSuccess: () => { toast.success('Period created'); qc.invalidateQueries({ queryKey: ['accounting-periods'] }); setShowForm(false); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => api.post(`/api/settings/accounting-periods/${id}/${action}`),
    onSuccess: () => { toast.success('Period updated'); qc.invalidateQueries({ queryKey: ['accounting-periods'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const STATUS_CLASS: Record<string, string> = { open: 'badge-green', closed: 'badge-gray', locked: 'badge-red' };
  const rows: any[] = data || [];
  const inp = 'w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400';
  const lbl = 'block text-xs text-slate-500 mb-1';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white"><CalendarDays size={15} /></div>
            <h1 className="text-xl font-semibold text-slate-800">Manage Accounting Periods</h1>
            <span className="text-sm text-slate-500">Control which periods are open or closed for journal entries</span>
          </div>
          <button onClick={() => setShowForm(s => !s)} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">
            <Plus size={14} /> New Period
          </button>
        </div>
      </div>

      <div className="p-4 max-w-screen-xl mx-auto space-y-3">
        {showForm && (
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
              <span className="text-sm font-semibold text-slate-800">New Accounting Period</span>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4">
                <div><label className={lbl}>Period Name <span className="text-red-500">*</span></label><input type="text" className={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. January 2026" /></div>
                <div><label className={lbl}>Start Date <span className="text-red-500">*</span></label><input type="date" className={inp} value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
                <div><label className={lbl}>End Date <span className="text-red-500">*</span></label><input type="date" className={inp} value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
                <div><label className={lbl}>Fiscal Year</label><input type="text" className={inp} value={form.fiscalYear} onChange={e => setForm(f => ({ ...f, fiscalYear: e.target.value }))} /></div>
              </div>
              <div className="flex gap-2 mt-4">
                <button className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60" onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending}>
                  {createMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create Period
                </button>
                <button className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
          {isLoading ? <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-blue-500" /></div> : (
            <table className="w-full text-sm min-w-max">
              <thead>
                <tr className="bg-slate-200/70 border-b border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  <th className="px-3 py-1.5 text-left">Period Name</th><th className="px-3 py-1.5 text-left w-28">Fiscal Year</th><th className="px-3 py-1.5 text-left w-32">Start Date</th><th className="px-3 py-1.5 text-left w-32">End Date</th><th className="px-3 py-1.5 text-left w-24">Status</th><th className="px-3 py-1.5 text-left w-40">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-slate-400">No accounting periods defined yet.</td></tr>
                ) : rows.map((p: any) => (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1.5 font-medium text-slate-700">{p.name}</td>
                    <td className="px-3 py-1.5 text-slate-600">{p.fiscal_year}</td>
                    <td className="px-3 py-1.5 text-slate-500">{p.start_date}</td>
                    <td className="px-3 py-1.5 text-slate-500">{p.end_date}</td>
                    <td className="px-3 py-1.5"><span className={`badge text-2xs ${STATUS_CLASS[p.status] || 'badge-gray'}`}>{p.status}</span></td>
                    <td className="px-3 py-1.5">
                      {p.status === 'open' && <button className="flex items-center gap-1 px-2 py-1 border border-slate-300 bg-white text-xs text-slate-700 rounded hover:bg-slate-50" onClick={() => toggleMutation.mutate({ id: p.id, action: 'close' })}><Lock size={11} /> Close</button>}
                      {p.status === 'closed' && <button className="flex items-center gap-1 px-2 py-1 border border-slate-300 bg-white text-xs text-slate-700 rounded hover:bg-slate-50" onClick={() => toggleMutation.mutate({ id: p.id, action: 'reopen' })}><Unlock size={11} /> Reopen</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
