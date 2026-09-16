import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Loader2 } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import toast from 'react-hot-toast';

interface DeptForm { name: string; code: string; parentId: string; description: string; isActive: boolean; }
const EMPTY: DeptForm = { name: '', code: '', parentId: '', description: '', isActive: true };

export default function DepartmentsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<DeptForm>(EMPTY);
  const setF = (k: keyof DeptForm, v: any) => setForm(f => ({ ...f, [k]: v }));

  const { data, isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/api/settings/departments').then(r => r.data.data || []),
  });

  const saveMutation = useMutation({
    mutationFn: (d: any) => editId ? api.put(`/api/settings/departments/${editId}`, d) : api.post('/api/settings/departments', d),
    onSuccess: () => { toast.success('Saved'); qc.invalidateQueries({ queryKey: ['departments'] }); setShowForm(false); setEditId(null); setForm(EMPTY); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const openEdit = (d: any) => { setForm({ name: d.name, code: d.code || '', parentId: d.parent_id || '', description: d.description || '', isActive: d.is_active }); setEditId(d.id); setShowForm(true); };

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Setup', path: '/settings' }, { label: 'Departments' }]}
        title="Departments"
        subtitle="Manage company departments"
        actions={<button className="btn-primary btn-sm" onClick={() => { setForm(EMPTY); setEditId(null); setShowForm(true); }}><Plus size={13} /> New Department</button>}
      />
      {showForm && (
        <div className="erp-card mb-4">
          <div className="form-section-title">{editId ? 'Edit Department' : 'New Department'}</div>
          <div className="form-grid-3">
            <div><label className="erp-label">Department Name *</label><input type="text" className="erp-input" value={form.name} onChange={e => setF('name', e.target.value)} required /></div>
            <div><label className="erp-label">Code</label><input type="text" className="erp-input" value={form.code} onChange={e => setF('code', e.target.value)} placeholder="e.g. DEPT-001" /></div>
            <div>
              <label className="erp-label">Parent Department</label>
              <select className="erp-select" value={form.parentId} onChange={e => setF('parentId', e.target.value)}>
                <option value="">-- No Parent (Top Level) --</option>
                {(data || []).filter((d: any) => d.id !== editId).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="col-span-2"><label className="erp-label">Description</label><input type="text" className="erp-input" value={form.description} onChange={e => setF('description', e.target.value)} /></div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" id="deptActive" checked={form.isActive} onChange={e => setF('isActive', e.target.checked)} className="w-4 h-4 accent-blue-600" />
              <label htmlFor="deptActive" className="erp-label mb-0">Active</label>
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
            <thead><tr><th>Code</th><th>Name</th><th>Parent</th><th>Description</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(!data || data.length === 0)
                ? <tr><td colSpan={6} className="text-center py-8 text-slate-400">No departments defined yet.</td></tr>
                : data.map((d: any) => (
                  <tr key={d.id}>
                    <td className="font-mono text-xs text-slate-500">{d.code || '—'}</td>
                    <td className="font-medium">{d.name}</td>
                    <td className="text-slate-500 text-sm">{d.parent_name || '—'}</td>
                    <td className="text-slate-500 text-sm">{d.description || '—'}</td>
                    <td><span className={`badge ${d.is_active ? 'badge-green' : 'badge-gray'}`}>{d.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td><button className="btn-ghost btn-sm" onClick={() => openEdit(d)}><Pencil size={12} /></button></td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
