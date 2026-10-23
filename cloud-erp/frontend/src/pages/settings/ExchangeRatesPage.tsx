import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, RefreshCw, TrendingUp, X, Trash2, Calculator } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

interface RateForm { baseCurrency: string; sourceCurrency: string; rate: string; effectiveDate: string; }
const today = () => new Date().toISOString().split('T')[0];

export default function ExchangeRatesPage() {
  const qc = useQueryClient();
  const [asOf, setAsOf] = useState(today());
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<RateForm>({ baseCurrency: '', sourceCurrency: '', rate: '1', effectiveDate: today() });
  const [prev, setPrev] = useState<{ rate: number; effectiveDate: string } | null>(null);
  const [revaluing, setRevaluing] = useState(false);
  const setF = (k: keyof RateForm, v: any) => setForm(f => ({ ...f, [k]: v }));

  const { data: currencies = [] } = useQuery<any[]>({
    queryKey: ['currencies', false],
    queryFn: () => api.get('/api/settings/currencies').then(r => r.data.data || []),
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['exchange-rates', asOf],
    queryFn: () => api.get('/api/settings/exchange-rates', { params: { asOf } }).then(r => r.data.data || []),
  });

  // When base/source/effectiveDate change in the form, fetch the previous rate for reference.
  useEffect(() => {
    if (!showForm || !form.baseCurrency || !form.sourceCurrency) { setPrev(null); return; }
    let active = true;
    api.get('/api/settings/exchange-rate-previous', { params: { base: form.baseCurrency, source: form.sourceCurrency, before: form.effectiveDate } })
      .then(r => { if (active) setPrev(r.data.data); })
      .catch(() => { if (active) setPrev(null); });
    return () => { active = false; };
  }, [showForm, form.baseCurrency, form.sourceCurrency, form.effectiveDate]);

  const saveMutation = useMutation({
    mutationFn: (d: RateForm) => editId ? api.put(`/api/settings/exchange-rates/${editId}`, d) : api.post('/api/settings/exchange-rates', d),
    onSuccess: () => { toast.success('Exchange rate saved'); qc.invalidateQueries({ queryKey: ['exchange-rates'] }); closeForm(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save rate'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/settings/exchange-rates/${id}`),
    onSuccess: () => { toast.success('Rate deleted'); qc.invalidateQueries({ queryKey: ['exchange-rates'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const baseIso = currencies.find((c: any) => c.is_base)?.iso_code || 'IDR';
  const openNew = () => {
    setForm({ baseCurrency: baseIso, sourceCurrency: '', rate: '1', effectiveDate: today() });
    setEditId(null); setShowForm(true);
  };
  const openEdit = (r: any) => {
    setForm({ baseCurrency: r.base_currency, sourceCurrency: r.source_currency, rate: String(r.rate), effectiveDate: r.effective_date?.slice(0, 10) || today() });
    setEditId(r.id); setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditId(null); setPrev(null); };

  const runRevaluation = async () => {
    setRevaluing(true);
    try {
      const res = await api.post('/api/settings/currency-revaluation', { asOf });
      const d = res.data.data;
      if (!d.posted) { toast(d.message || 'No FX difference to revalue', { icon: 'ℹ️' }); }
      else {
        toast.success(`Revaluation posted ${d.journalNumber} · net ${Number(d.netGainLoss).toLocaleString('id-ID')}`);
      }
      if (d.missingRates?.length) toast(`Missing rates for: ${d.missingRates.join(', ')}`, { icon: '⚠️' });
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Revaluation failed');
    } finally { setRevaluing(false); }
  };

  const rows: any[] = data || [];
  const inp = 'w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400';
  const sel = `${inp} bg-white`;
  const lbl = 'block text-xs text-slate-500 mb-1';
  const nameFor = (iso: string) => currencies.find((c: any) => c.iso_code === iso)?.name || iso;

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white"><TrendingUp size={15} /></div>
            <h1 className="text-xl font-semibold text-slate-800">Currency Exchange Rates</h1>
            <span className="text-sm text-slate-500">Exchange rate values per effective date</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={runRevaluation} disabled={revaluing}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50 disabled:opacity-60" title="Post FX gain/loss journal for open foreign-currency balances">
              {revaluing ? <Loader2 size={13} className="animate-spin" /> : <Calculator size={13} />} Monthly Revaluation
            </button>
            <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800">
              <Plus size={14} /> New
            </button>
          </div>
        </div>
        {/* Filters */}
        <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center gap-3 flex-wrap border-t border-slate-100">
          <span className="text-xs font-semibold text-slate-500 uppercase">As of</span>
          <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="border border-slate-300 rounded text-sm px-2 py-1" />
          <button onClick={() => refetch()} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-600 rounded hover:bg-slate-50"><RefreshCw size={13} /> Refresh</button>
          <span className="text-sm text-slate-400 ml-auto">Total: {rows.length}</span>
        </div>
      </div>

      <div className="p-4 max-w-screen-2xl mx-auto space-y-3">
        {showForm && (
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
              <span className="text-sm font-semibold text-slate-800">{editId ? 'Edit Currency Exchange Rate' : 'New Currency Exchange Rate'}</span>
              <button onClick={closeForm} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-x-10 gap-y-4 max-w-3xl">
                <div>
                  <label className={lbl}>Base Currency <span className="text-red-500">*</span></label>
                  <select className={sel} value={form.baseCurrency} onChange={e => setF('baseCurrency', e.target.value)}>
                    <option value="">-- Select --</option>
                    {currencies.map((c: any) => <option key={c.id} value={c.iso_code}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Effective Date <span className="text-red-500">*</span></label>
                  <input type="date" className={inp} value={form.effectiveDate} onChange={e => setF('effectiveDate', e.target.value)} />
                </div>
                <div>
                  <label className={lbl}>Currency <span className="text-red-500">*</span></label>
                  <select className={sel} value={form.sourceCurrency} onChange={e => setF('sourceCurrency', e.target.value)}>
                    <option value="">-- Select --</option>
                    {currencies.map((c: any) => <option key={c.id} value={c.iso_code}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Previous Effective Date</label>
                  <input type="date" className={`${inp} bg-slate-50 text-slate-500`} value={prev?.effectiveDate?.slice(0, 10) || ''} readOnly disabled />
                </div>
                <div>
                  <label className={lbl}>Exchange Rate <span className="text-red-500">*</span></label>
                  <input type="number" step="any" className={inp} value={form.rate} onChange={e => setF('rate', e.target.value)} placeholder="units of base per 1 currency" />
                </div>
                <div>
                  <label className={lbl}>Previous Exchange Rate</label>
                  <input type="text" className={`${inp} bg-slate-50 text-slate-500`} value={prev ? Number(prev.rate).toLocaleString('en-US', { maximumFractionDigits: 12 }) : ''} readOnly disabled />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60"
                  onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || !form.baseCurrency || !form.sourceCurrency || !form.rate || !form.effectiveDate}>
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
                  <th className="px-3 py-1.5 text-left">Base Currency</th>
                  <th className="px-3 py-1.5 text-left">Source Currency</th>
                  <th className="px-3 py-1.5 text-right w-48">Exchange Rate</th>
                  <th className="px-3 py-1.5 text-left w-40">Effective Date</th>
                  <th className="px-3 py-1.5 text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-10 text-slate-400">No exchange rates as of {asOf}.</td></tr>
                ) : rows.map((r: any) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1.5 text-slate-700">{r.base_name || nameFor(r.base_currency)}</td>
                    <td className="px-3 py-1.5 text-slate-700">{r.source_name || nameFor(r.source_currency)}</td>
                    <td className="px-3 py-1.5 text-right font-mono"><button onClick={() => openEdit(r)} className="text-blue-600 hover:underline">{Number(r.rate).toLocaleString('en-US', { maximumFractionDigits: 12 })}</button></td>
                    <td className="px-3 py-1.5 text-slate-500">{r.effective_date?.slice(0, 10)}</td>
                    <td className="px-3 py-1.5 text-right">
                      <button title="Delete" className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50" onClick={() => { if (confirm('Delete this exchange rate?')) deleteMutation.mutate(r.id); }}><Trash2 size={13} /></button>
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
