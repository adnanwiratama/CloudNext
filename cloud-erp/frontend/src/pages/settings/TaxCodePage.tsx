import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Loader2, Percent, X } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

interface TaxForm { name: string; code: string; rate: number; description: string; isActive: boolean; taxType: string; }
const EMPTY: TaxForm = { name: '', code: '', rate: 0, description: '', isActive: true, taxType: 'vat' };

export default function TaxCodePage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<TaxForm>(EMPTY);
  const setF = (k: keyof TaxForm, v: any) => setForm(f => ({ ...f, [k]: v }));

  const { data, isLoading } = useQuery({
    queryKey: ['tax-codes'],
    queryFn: () => api.get('/api/settings/tax-codes').then(r => r.data.data || []),
  });

  const saveMutation = useMutation({
    mutationFn: (d: any) => editId ? api.put(`/api/settings/tax-codes/${editId}`, d) : api.post('/api/settings/tax-codes', d),
    onSuccess: () => { toast.success(editId ? 'Tax code updated' : 'Tax code created'); qc.invalidateQueries({ queryKey: ['tax-codes'] }); closeForm(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const openNew = () => { setForm(EMPTY); setEditId(null); setShowForm(true); };
  const openEdit = (t: any) => { setForm({ name: t.name, code: t.code, rate: t.rate, description: t.description, isActive: t.is_active, taxType: t.tax_type }); setEditId(t.id); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditId(null); setForm(EMPTY); };

  const rows: any[] = data || [];
  const inp = 'w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400';
  const sel = `${inp} bg-white`;
  const lbl = 'block text-xs text-slate-500 mb-1';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white"><Percent size={15} /></div>
            <h1 className="text-xl font-semibold text-slate-800">Tax Code</h1>
            <span className="text-sm text-slate-500">Manage tax rates and codes for transactions</span>
          </div>
          <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">
            <Plus size={14} /> New Tax Code
          </button>
        </div>
      </div>

      <div className="p-4 max-w-screen-xl mx-auto space-y-3">
        {showForm && (
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
              <span className="text-sm font-semibold text-slate-800">{editId ? 'Edit Tax Code' : 'New Tax Code'}</span>
              <button onClick={closeForm} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4">
                <div><label className={lbl}>Tax Name <span className="text-red-500">*</span></label><input type="text" className={inp} value={form.name} onChange={e => setF('name', e.target.value)} placeholder="e.g. PPN 11%" /></div>
                <div><label className={lbl}>Tax Code <span className="text-red-500">*</span></label><input type="text" className={inp} value={form.code} onChange={e => setF('code', e.target.value)} placeholder="e.g. PPN11" /></div>
                <div><label className={lbl}>Rate (%) <span className="text-red-500">*</span></label><input type="number" min="0" max="100" step="0.01" className={inp} value={form.rate} onChange={e => setF('rate', parseFloat(e.target.value) || 0)} /></div>
                <div>
                  <label className={lbl}>Tax Type</label>
                  <select className={sel} value={form.taxType} onChange={e => setF('taxType', e.target.value)}>
                    <option value="vat">VAT / PPN</option>
                    <option value="withholding">Withholding Tax / PPh</option>
                    <option value="sales_tax">Sales Tax</option>
                    <option value="other">Other</option>
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
                  <th className="px-3 py-1.5 text-left w-28">Code</th><th className="px-3 py-1.5 text-left">Name</th><th className="px-3 py-1.5 text-left w-32">Type</th><th className="px-3 py-1.5 text-right w-24">Rate (%)</th><th className="px-3 py-1.5 text-left">Description</th><th className="px-3 py-1.5 text-left w-24">Status</th><th className="px-3 py-1.5 text-center w-16">Edit</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-slate-400">No tax codes defined. Click "New Tax Code" to add one.</td></tr>
                ) : rows.map((t: any) => (
                  <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1.5 font-mono text-sm font-semibold text-blue-600">{t.code}</td>
                    <td className="px-3 py-1.5 font-medium text-slate-700">{t.name}</td>
                    <td className="px-3 py-1.5"><span className="badge badge-blue text-2xs">{t.tax_type}</span></td>
                    <td className="px-3 py-1.5 text-right font-semibold">{t.rate}%</td>
                    <td className="px-3 py-1.5 text-slate-500">{t.description}</td>
                    <td className="px-3 py-1.5"><span className={`badge text-2xs ${t.is_active ? 'badge-green' : 'badge-gray'}`}>{t.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td className="px-3 py-1.5 text-center"><button className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50" onClick={() => openEdit(t)}><Pencil size={13} /></button></td>
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
