import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown, Plus, Trash2, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import toast from 'react-hot-toast';

interface JournalLine {
  id: number; accountId: string; memo: string;
  debit: number; credit: number; departmentId: string; locationId: string;
}
const blankLine = (n: number): JournalLine => ({ id: n, accountId: '', memo: '', debit: 0, credit: 0, departmentId: '', locationId: '' });

export default function JournalEntryForm() {
  const navigate = useNavigate();
  const { accounts, locations, departments } = useFormOptions();
  const { data: subsidiariesData } = useQuery({ queryKey: ['subsidiaries'], queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []) });
  const subsidiaries: any[] = subsidiariesData || [];

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [lineTab, setLineTab] = useState<'lines'|'files'>('lines');
  const [lineCounter, setLineCounter] = useState(1000);
  const [fileRows, setFileRows] = useState<FileRow[]>([]);

  const [form, setForm] = useState({
    entryDate: new Date().toISOString().split('T')[0],
    currency: 'IDR', memo: '', reference: '',
    departmentId: '', locationId: '', subsidiaryId: '',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const [lines, setLines] = useState<JournalLine[]>([blankLine(1000), blankLine(1001)]);

  const updateLine = useCallback((lid: number, key: string, value: any) => {
    setLines(prev => prev.map(l => {
      if (l.id !== lid) return l;
      const u = { ...l, [key]: value };
      if (key === 'debit'  && Number(value) > 0) u.credit = 0;
      if (key === 'credit' && Number(value) > 0) u.debit  = 0;
      return u;
    }));
  }, []);

  const addLine = () => { const n = lineCounter+1; setLineCounter(n); setLines(p => [...p, blankLine(n)]); };
  const removeLine = (lid: number) => { if (lines.length > 2) setLines(p => p.filter(l => l.id !== lid)); };

  const totalDebit  = lines.reduce((s, l) => s + Number(l.debit  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/accounting/journals', data),
    onSuccess: async (res) => {
      const savedId = res.data.data?.id;
      if (savedId) try { await uploadFileRows(fileRows, 'journal_entry', String(savedId), api.post.bind(api)); } catch (_) {}
      toast.success('Journal Entry posted to General Ledger');
      navigate(`/accounting/journals/${savedId}`, { state: { justSaved: true } });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to post journal entry'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBalanced) { toast.error('Journal entry is not balanced. Debit must equal Credit.'); return; }
    const validLines = lines.filter(l => l.accountId && (Number(l.debit) > 0 || Number(l.credit) > 0));
    if (validLines.length < 2) { toast.error('At least 2 lines with accounts are required'); return; }
    mutation.mutate({
      ...form, departmentId: form.departmentId||null, locationId: form.locationId||null, subsidiaryId: form.subsidiaryId||null,
      lines: validLines.map(l => ({ accountId: l.accountId, memo: l.memo, debit: Number(l.debit), credit: Number(l.credit), departmentId: l.departmentId||null, locationId: l.locationId||null })),
    });
  };

  const dis = 'w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400';
  const sel = `${dis} bg-white`;

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-slate-700 flex items-center justify-center text-white font-bold text-xs">JE</div>
              <span className="text-xl font-bold text-slate-800">Journal Entry</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/accounting/journals')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=journal_entry')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button type="submit" form="je-form" disabled={mutation.isPending || !isBalanced}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {mutation.isPending && <Loader2 size={12} className="animate-spin"/>} Post to GL
          </button>
          <button type="button" onClick={() => navigate('/accounting/journals')}
            className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
          {isBalanced
            ? <span className="flex items-center gap-1 text-xs text-emerald-600 ml-2"><CheckCircle size={13}/> Balanced</span>
            : totalDebit > 0
              ? <span className="flex items-center gap-1 text-xs text-red-500 ml-2"><AlertCircle size={13}/> Diff: {(totalDebit-totalCredit).toLocaleString('id-ID',{minimumFractionDigits:2})}</span>
              : null
          }
        </div>
      </div>

      <form id="je-form" onSubmit={handleSubmit}>
        <div className="p-4 space-y-3 max-w-screen-xl mx-auto">

          {/* Primary */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <button type="button" onClick={() => setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              {primaryOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Primary Information
            </button>
            {primaryOpen && (
              <div className="px-4 pb-5 border-t border-slate-100">
                <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Entry Date <span className="text-red-500">*</span></label>
                      <input type="date" value={form.entryDate} onChange={e=>set('entryDate',e.target.value)} className={dis} required/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Currency</label>
                      <select value={form.currency} onChange={e=>set('currency',e.target.value)} className={sel}>
                        {['IDR','USD','EUR','SGD'].map(c=><option key={c} value={c}>{c}</option>)}
                      </select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Reference</label>
                      <input value={form.reference} onChange={e=>set('reference',e.target.value)} className={dis} placeholder="e.g. DOC-001"/></div>
                  </div>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Department</label>
                      <select value={form.departmentId} onChange={e=>set('departmentId',e.target.value)} className={sel}>
                        <option value="">--</option>{departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}
                      </select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Location</label>
                      <select value={form.locationId} onChange={e=>set('locationId',e.target.value)} className={sel}>
                        <option value="">--</option>{locations.map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}
                      </select></div>
                  </div>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Description / Memo <span className="text-red-500">*</span></label>
                      <textarea value={form.memo} onChange={e=>set('memo',e.target.value)} rows={4} className={`${dis} resize-none`}
                        placeholder="e.g. Accrual for depreciation - Sep 2026" required/></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Classification */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <button type="button" onClick={() => setClassOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              {classOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Classification
            </button>
            {classOpen && (
              <div className="px-4 pb-4 border-t border-slate-100">
                <div className="grid grid-cols-3 gap-x-10 mt-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label>
                    <select value={form.subsidiaryId} onChange={e=>set('subsidiaryId',e.target.value)} className={sel}>
                      <option value="">--</option>{subsidiaries.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}
                    </select></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Department</label>
                    <select value={form.departmentId} onChange={e=>set('departmentId',e.target.value)} className={sel}>
                      <option value="">--</option>{departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}
                    </select></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Location</label>
                    <select value={form.locationId} onChange={e=>set('locationId',e.target.value)} className={sel}>
                      <option value="">--</option>{locations.map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}
                    </select></div>
                </div>
              </div>
            )}
          </div>

          {/* Lines + Files */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <div className="border-b border-slate-200 px-4 flex">
              {(['lines','files'] as const).map(tab => (
                <button key={tab} type="button" onClick={() => setLineTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${lineTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {tab==='lines'?'Journal Lines (Double-Entry)':'Files'}
                </button>
              ))}
            </div>
            <div className="p-4">
              {lineTab === 'lines' && (
                <div>
                  <div className="border border-slate-200 rounded overflow-x-auto">
                    <table className="w-full text-xs min-w-max">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-8">#</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-56">Account <span className="text-red-500">*</span></th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Memo</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-36">Debit (Dr)</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-36">Credit (Cr)</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                          <th className="px-3 py-2 w-8"/>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l, idx) => (
                          <tr key={l.id} className="border-t border-slate-100">
                            <td className="px-3 py-1 text-slate-400 text-center">{idx+1}</td>
                            <td className="px-1 py-1">
                              <select value={l.accountId} onChange={e=>updateLine(l.id,'accountId',e.target.value)}
                                className="w-full border border-slate-200 rounded px-1 py-0.5 bg-white text-xs">
                                <option value="">-- Select Account --</option>
                                {accounts.map((a:any)=><option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                              </select>
                            </td>
                            <td className="px-1 py-1">
                              <input value={l.memo} onChange={e=>updateLine(l.id,'memo',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 text-xs" placeholder="Line description"/>
                            </td>
                            <td className="px-1 py-1">
                              <input type="number" min="0" step="0.01" value={l.debit||''} placeholder="0"
                                onChange={e=>updateLine(l.id,'debit',e.target.value)}
                                className={`w-full border rounded px-1 py-0.5 text-right text-xs ${Number(l.debit)>0?'border-blue-400 bg-blue-50':'border-slate-200'}`}/>
                            </td>
                            <td className="px-1 py-1">
                              <input type="number" min="0" step="0.01" value={l.credit||''} placeholder="0"
                                onChange={e=>updateLine(l.id,'credit',e.target.value)}
                                className={`w-full border rounded px-1 py-0.5 text-right text-xs ${Number(l.credit)>0?'border-emerald-400 bg-emerald-50':'border-slate-200'}`}/>
                            </td>
                            <td className="px-1 py-1">
                              <select value={l.departmentId} onChange={e=>updateLine(l.id,'departmentId',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 bg-white text-xs">
                                <option value="">—</option>{departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}
                              </select>
                            </td>
                            <td className="px-1 py-1">
                              <select value={l.locationId} onChange={e=>updateLine(l.id,'locationId',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 bg-white text-xs">
                                <option value="">—</option>{locations.map((loc:any)=><option key={loc.id} value={loc.id}>{loc.name}</option>)}
                              </select>
                            </td>
                            <td className="px-2 py-1">
                              <button type="button" onClick={()=>removeLine(l.id)} disabled={lines.length<=2} className="text-red-400 hover:text-red-600 disabled:opacity-30">
                                <Trash2 size={12}/>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 bg-slate-50">
                          <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-slate-600">TOTAL</td>
                          <td className="px-3 py-2 text-right font-bold text-blue-700">{totalDebit.toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                          <td className={`px-3 py-2 text-right font-bold ${isBalanced?'text-emerald-700':'text-red-600'}`}>{totalCredit.toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                          <td colSpan={3}/>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <button type="button" onClick={addLine}
                    className="mt-2 flex items-center gap-1 px-3 py-1.5 border border-dashed border-slate-300 text-xs text-slate-500 rounded hover:border-blue-400 hover:text-blue-600">
                    <Plus size={11}/> Add Line
                  </button>
                </div>
              )}
              {lineTab === 'files' && <TransactionFileUploadRow rows={fileRows} setRows={setFileRows}/>}
            </div>
          </div>

          {/* Bottom bar */}
          <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
            <button type="submit" form="je-form" disabled={mutation.isPending || !isBalanced}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
              {mutation.isPending && <Loader2 size={12} className="animate-spin"/>} Post to GL
            </button>
            <button type="button" onClick={() => navigate('/accounting/journals')}
              className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
          </div>

        </div>
      </form>
    </div>
  );
}
