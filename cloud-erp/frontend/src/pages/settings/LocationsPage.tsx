import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Loader2 } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import toast from 'react-hot-toast';

interface LocForm { name: string; code: string; type: string; address: string; isActive: boolean; }
const EMPTY: LocForm = { name: '', code: '', type: 'warehouse', address: '', isActive: true };

export default function LocationsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<LocForm>(EMPTY);
  const setF = (k: keyof LocForm, v: any) => setForm(f => ({ ...f, [k]: v }));

  const { data, isLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get('/api/settings/locations').then(r => r.data.data || []),
  });

  const saveMutation = useMutation({
    mutationFn: (d: any) => editId ? api.put(`/api/settings/locations/${editId}`, d) : api.post('/api/settings/locations', d),
    onSuccess: () => { toast.success('Saved'); qc.invalidateQueries({ queryKey: ['locations'] }); setShowForm(false); setEditId(null); setForm(EMPTY); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const openEdit = (l: any) => { setForm({ name: l.name, code: l.code || '', type: l.type || 'warehouse', address: l.address || '', isActive: l.is_active }); setEditId(l.id); setShowForm(true); };

  const TYPE_BADGE: Record<string, string> = { warehouse: 'badge-blue', store: 'badge-purple', office: 'badge-gray', virtual: 'badge-yellow' };

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Setup', path: '/settings' }, { label: 'Locations' }]}
        title="Locations"
        subtitle="Manage operational locations for inventory tracking"
        actions={<button className="btn-primary btn-sm" onClick={() => { setForm(EMPTY); setEditId(null); setShowForm(true); }}><Plus size={13} /> New Location</button>}
      />
      {showForm && (
        <div className="erp-card mb-4">
          <div className="form-section-title">{editId ? 'Edit Location' : 'New Location'}</div>
          <div className="form-grid-3">
            <div><label className="erp-label">Location Name *</label><input type="text" className="erp-input" value={form.name} onChange={e => setF('name', e.target.value)} required /></div>
            <div><label className="erp-label">Code</label><input type="text" className="erp-input" value={form.code} onChange={e => setF('code', e.target.value)} placeholder="e.g. WH-001" /></div>
            <div>
              <label className="erp-label">Type</label>
              <select className="erp-select" value={form.type} onChange={e => setF('type', e.target.value)}>
                <option value="warehouse">Warehouse</option>
                <option value="store">Store / Retail</option>
                <option value="office">Office</option>
                <option value="virtual">Virtual (Transit)</option>
              </select>
            </div>
            <div className="col-span-2"><label className="erp-label">Address</label><input type="text" className="erp-input" value={form.address} onChange={e => setF('address', e.target.value)} placeholder="Full address" /></div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" id="locActive" checked={form.isActive} onChange={e => setF('isActive', e.target.checked)} className="w-4 h-4 accent-blue-600" />
              <label htmlFor="locActive" className="erp-label mb-0">Active</label>
            </div>
          </div>
          <div className="px-4 pb-4 flex gap-2">
            <button className="btn-primary btn-sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : null} Save
            </button>
            <button className="btn-secondary btn-sm" onClick={() => { setShowForm(false); setEditId(null); }}>Cancel</button>
          </div>
        </div>
      )}
      <div className="erp-card">
        {isLoading ? <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-blue-500" /></div> : (
          <table className="erp-table">
            <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Address</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(!data || data.length === 0)
                ? <tr><td colSpan={6} className="text-center py-8 text-slate-400">No locations defined yet.</td></tr>
                : data.map((l: any) => (
                  <tr key={l.id}>
                    <td className="font-mono text-xs text-slate-500">{l.code || '—'}</td>
                    <td className="font-medium">{l.name}</td>
                    <td><span className={`badge ${TYPE_BADGE[l.type] || 'badge-gray'}`}>{l.type}</span></td>
                    <td className="text-slate-500 text-sm">{l.address || '—'}</td>
                    <td><span className={`badge ${l.is_active ? 'badge-green' : 'badge-gray'}`}>{l.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td><button className="btn-ghost btn-sm" onClick={() => openEdit(l)}><Pencil size={12} /></button></td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
