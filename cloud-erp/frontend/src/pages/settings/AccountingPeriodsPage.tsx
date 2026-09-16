import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Lock, Unlock, Loader2 } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
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

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Setup', path: '/settings' }, { label: 'Accounting Periods' }]}
        title="Manage Accounting Periods"
        subtitle="Control which periods are open or closed for journal entries"
        actions={<button className="btn-primary btn-sm" onClick={() => setShowForm(!showForm)}><Plus size={13} /> New Period</button>}
      />
      {showForm && (
        <div className="erp-card mb-4">
          <div className="form-section-title">New Accounting Period</div>
          <div className="form-grid-3">
            <div><label className="erp-label">Period Name *</label><input type="text" className="erp-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. January 2026" /></div>
            <div><label className="erp-label">Start Date *</label><input type="date" className="erp-input" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
            <div><label className="erp-label">End Date *</label><input type="date" className="erp-input" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
            <div><label className="erp-label">Fiscal Year</label><input type="text" className="erp-input" value={form.fiscalYear} onChange={e => setForm(f => ({ ...f, fiscalYear: e.target.value }))} /></div>
          </div>
          <div className="px-4 pb-4 flex gap-2">
            <button className="btn-primary btn-sm" onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create Period
            </button>
            <button className="btn-secondary btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="erp-card">
        {isLoading ? <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-blue-500" /></div> : (
          <table className="erp-table">
            <thead><tr><th>Period Name</th><th>Fiscal Year</th><th>Start Date</th><th>End Date</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {(!data || data.length === 0) ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-400">No accounting periods defined yet.</td></tr>
              ) : data.map((p: any) => (
                <tr key={p.id}>
                  <td className="font-medium">{p.name}</td>
                  <td>{p.fiscal_year}</td>
                  <td className="text-sm">{p.start_date}</td>
                  <td className="text-sm">{p.end_date}</td>
                  <td><span className={`badge ${STATUS_CLASS[p.status] || 'badge-gray'}`}>{p.status}</span></td>
                  <td>
                    <div className="flex items-center gap-2">
                      {p.status === 'open' && <button className="btn-secondary btn-sm text-xs" onClick={() => toggleMutation.mutate({ id: p.id, action: 'close' })}><Lock size={11} /> Close</button>}
                      {p.status === 'closed' && <button className="btn-secondary btn-sm text-xs" onClick={() => toggleMutation.mutate({ id: p.id, action: 'reopen' })}><Unlock size={11} /> Reopen</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
