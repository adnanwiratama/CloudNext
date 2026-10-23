import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Loader2, Building2, X } from 'lucide-react';
import api from '../../services/api';
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
    onSuccess: () => { toast.success('Saved'); qc.invalidateQueries({ queryKey: ['departments'] }); closeForm(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const openNew = () => { setForm(EMPTY); setEditId(null); setShowForm(true); };
  const openEdit = (d: any) => { setForm({ name: d.name, code: d.code || '', parentId: d.parent_id || '', description: d.description || '', isActive: d.is_active }); setEditId(d.id); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditId(null); setForm(EMPTY); };

  const rows: any[] = data || [];
  const inp = 'w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400';
  const sel = `${inp} bg-white`;
  const lbl = 'block text-xs text-slate-500 mb-1';

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white"><Building2 size={15} /></div>
            <h1 className="text-xl font-semibold text-slate-800">Departments</h1>
            <span className="text-sm text-slate-500">Manage company departments</span>
          </div>
          <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">
            <Plus size={14} /> New Department
          </button>
        </div>
      </div>

      <div className="p-4 max-w-screen-xl mx-auto space-y-3">
        {showForm && (
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
              <span className="text-sm font-semibold text-slate-800">{editId ? 'Edit Department' : 'New Department'}</span>
              <button onClick={closeForm} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4">
                <div><label className={lbl}>Department Name <span className="text-red-500">*</span></label><input type="text" className={inp} value={form.name} onChange={e => setF('name', e.target.value)} /></div>
                <div><label className={lbl}>Code</label><input type="text" className={inp} value={form.code} onChange={e => setF('code', e.target.value)} placeholder="e.g. DEPT-001" /></div>
                <div>
                  <label className={lbl}>Parent Department</label>
                  <select className={sel} value={form.parentId} onChange={e => setF('parentId', e.target.value)}>
                    <option value="">-- No Parent (Top Level) --</option>
                    {rows.filter((d: any) => d.id !== editId).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2"><label className={lbl}>Description</label><input type="text" className={inp} value={form.description} onChange={e => setF('description', e.target.value)} /></div>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none pt-6">
                  <input type="checkbox" checked={form.isActive} onChange={e => setF('isActive', e.target.checked)} className="w-4 h-4 accent-blue-600" /> Active
                </label>
              </div>
              <div className="flex gap-2 mt-4">
                <button className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : null} Save
                </button>
                <button className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50" onClick={closeForm}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
          {isLoading ? <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-blue-500" /></div> : (
            <table className="w-full text-sm min-w-max">
              <thead>
                <tr className="bg-slate-200/70 border-b border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  <th className="px-3 py-1.5 text-left w-32">Code</th><th className="px-3 py-1.5 text-left">Name</th><th className="px-3 py-1.5 text-left">Parent</th><th className="px-3 py-1.5 text-left">Description</th><th className="px-3 py-1.5 text-left w-24">Status</th><th className="px-3 py-1.5 text-center w-16">Edit</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0
                  ? <tr><td colSpan={6} className="text-center py-10 text-slate-400">No departments defined yet.</td></tr>
                  : rows.map((d: any) => (
                    <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{d.code || '—'}</td>
                      <td className="px-3 py-1.5 font-medium text-slate-700">{d.name}</td>
                      <td className="px-3 py-1.5 text-slate-500">{d.parent_name || '—'}</td>
                      <td className="px-3 py-1.5 text-slate-500">{d.description || '—'}</td>
                      <td className="px-3 py-1.5"><span className={`badge text-2xs ${d.is_active ? 'badge-green' : 'badge-gray'}`}>{d.is_active ? 'Active' : 'Inactive'}</span></td>
                      <td className="px-3 py-1.5 text-center"><button className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50" onClick={() => openEdit(d)}><Pencil size={13} /></button></td>
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
