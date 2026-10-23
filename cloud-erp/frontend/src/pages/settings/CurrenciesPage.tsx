import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Loader2, RefreshCw, Coins, X } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

interface CurrencyForm { name: string; isoCode: string; symbol: string; isBase: boolean; isActive: boolean; }
const EMPTY: CurrencyForm = { name: '', isoCode: '', symbol: '', isBase: false, isActive: true };

export default function CurrenciesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CurrencyForm>(EMPTY);
  const setF = (k: keyof CurrencyForm, v: any) => setForm(f => ({ ...f, [k]: v }));

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['currencies', showInactive],
    queryFn: () => api.get('/api/settings/currencies', { params: { includeInactive: showInactive } }).then(r => r.data.data || []),
  });

  const saveMutation = useMutation({
    mutationFn: (d: CurrencyForm) => editId ? api.put(`/api/settings/currencies/${editId}`, d) : api.post('/api/settings/currencies', d),
    onSuccess: () => { toast.success('Currency saved'); qc.invalidateQueries({ queryKey: ['currencies'] }); closeForm(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save currency'),
  });

  const openNew = () => { setForm(EMPTY); setEditId(null); setShowForm(true); };
  const openEdit = (c: any) => { setForm({ name: c.name, isoCode: c.iso_code, symbol: c.symbol || '', isBase: c.is_base, isActive: c.is_active }); setEditId(c.id); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditId(null); setForm(EMPTY); };

  const rows: any[] = data || [];
  const inp = 'w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400';
  const lbl = 'block text-xs text-slate-500 mb-1';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white"><Coins size={15} /></div>
            <h1 className="text-xl font-semibold text-slate-800">Currencies</h1>
            <span className="text-sm text-slate-500">Reference list of currencies used across the company</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/settings/exchange-rates')} className="text-sm text-blue-600 hover:underline">Currency Exchange Rate History</button>
            <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">
              <Plus size={14} /> New
            </button>
          </div>
        </div>
        <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center gap-3 flex-wrap border-t border-slate-100">
          <button onClick={() => refetch()} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-600 rounded hover:bg-slate-50"><RefreshCw size={13} /> Refresh</button>
          <label className="flex items-center gap-2 text-sm text-slate-600 ml-auto cursor-pointer select-none">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="w-4 h-4 accent-blue-600" />
            Show Inactives
          </label>
        </div>
      </div>

      <div className="p-4 max-w-screen-2xl mx-auto space-y-3">
        {showForm && (
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
              <span className="text-sm font-semibold text-slate-800">{editId ? 'Edit Currency' : 'New Currency'}</span>
              <button onClick={closeForm} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-3 gap-x-10 gap-y-4">
                <div><label className={lbl}>Name <span className="text-red-500">*</span></label><input type="text" className={inp} value={form.name} onChange={e => setF('name', e.target.value)} placeholder="e.g. US Dollar" /></div>
                <div><label className={lbl}>ISO Code <span className="text-red-500">*</span></label><input type="text" maxLength={3} className={`${inp} uppercase`} value={form.isoCode} onChange={e => setF('isoCode', e.target.value.toUpperCase())} placeholder="e.g. USD" /></div>
                <div><label className={lbl}>Symbol</label><input type="text" maxLength={5} className={inp} value={form.symbol} onChange={e => setF('symbol', e.target.value)} placeholder="e.g. $" /></div>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none pt-6">
                  <input type="checkbox" checked={form.isBase} onChange={e => setF('isBase', e.target.checked)} className="w-4 h-4 accent-blue-600" /> Base Currency
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none pt-6">
                  <input type="checkbox" checked={form.isActive} onChange={e => setF('isActive', e.target.checked)} className="w-4 h-4 accent-blue-600" /> Active
                </label>
              </div>
              <div className="flex gap-2 mt-4">
                <button className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || !form.name || !form.isoCode}>
                  {saveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : null} Save
                </button>
                <button className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50" onClick={closeForm}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-blue-500" /></div>
          ) : (
            <table className="w-full text-sm min-w-max">
              <thead>
                <tr className="bg-slate-200/70 border-b border-slate-300 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  <th className="px-3 py-1.5 text-right w-28">Internal ID</th>
                  <th className="px-3 py-1.5 text-left">Name</th>
                  <th className="px-3 py-1.5 text-left w-32">ISO Code</th>
                  <th className="px-3 py-1.5 text-left w-24">Symbol</th>
                  <th className="px-3 py-1.5 text-center w-36">Base Currency</th>
                  <th className="px-3 py-1.5 text-center w-28">Inactive</th>
                  <th className="px-3 py-1.5 text-right w-20">Edit</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-slate-400">No currencies defined yet.</td></tr>
                ) : rows.map((c: any) => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1.5 text-right text-slate-500 font-mono text-xs">{c.internal_id}</td>
                    <td className="px-3 py-1.5"><button onClick={() => openEdit(c)} className="font-medium text-blue-600 hover:underline">{c.name}</button></td>
                    <td className="px-3 py-1.5 font-mono text-slate-600">{c.iso_code}</td>
                    <td className="px-3 py-1.5 text-slate-500">{c.symbol || '—'}</td>
                    <td className="px-3 py-1.5 text-center text-slate-600">{c.is_base ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-1.5 text-center text-slate-600">{c.is_active ? 'No' : 'Yes'}</td>
                    <td className="px-3 py-1.5 text-right">
                      <button title="Edit" className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50" onClick={() => openEdit(c)}><Pencil size={13} /></button>
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
