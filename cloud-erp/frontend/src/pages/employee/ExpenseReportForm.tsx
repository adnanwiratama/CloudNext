import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import toast from 'react-hot-toast';

interface ExpenseLine {
  id: number; date: string; category: string; description: string;
  amount: number; receipt: string; accountId: string; departmentId: string; locationId: string;
}

const CATEGORIES = [
  { value: 'transportation', label: 'Transportation' },
  { value: 'accommodation', label: 'Accommodation' },
  { value: 'meals', label: 'Meals & Entertainment' },
  { value: 'communication', label: 'Communication' },
  { value: 'office_supplies', label: 'Office Supplies' },
  { value: 'training', label: 'Training & Education' },
  { value: 'other', label: 'Other' },
];

const blankLine = (n: number): ExpenseLine => ({
  id: n, date: new Date().toISOString().split('T')[0],
  category: 'transportation', description: '', amount: 0,
  receipt: '', accountId: '', departmentId: '', locationId: '',
});

export default function ExpenseReportForm() {
  const navigate = useNavigate();
  const { accounts, locations, departments } = useFormOptions();
  const expenseAccounts = accounts.filter((a: any) => a.type === 'expense');
  const { data: subsidiariesData } = useQuery({ queryKey: ['subsidiaries'], queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []) });
  const subsidiaries: any[] = subsidiariesData || [];

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [lineTab, setLineTab] = useState<'lines'|'files'>('lines');
  const [lineCounter, setLineCounter] = useState(1000);
  const [fileRows, setFileRows] = useState<FileRow[]>([]);

  const [form, setForm] = useState({
    employeeName: '', departmentId: '', locationId: '', subsidiaryId: '',
    reportPeriodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    reportPeriodEnd: new Date().toISOString().split('T')[0],
    purpose: '', memo: '',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const [lines, setLines] = useState<ExpenseLine[]>([blankLine(1000)]);

  const updateLine = useCallback((lid: number, key: string, value: any) =>
    setLines(prev => prev.map(l => l.id !== lid ? l : { ...l, [key]: value })), []);

  const addLine = () => { const n = lineCounter+1; setLineCounter(n); setLines(p => [...p, blankLine(n)]); };
  const removeLine = (lid: number) => setLines(p => p.filter(l => l.id !== lid));

  const total = lines.reduce((s, l) => s + Number(l.amount || 0), 0);

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/employee/expenses', data),
    onSuccess: async (res) => {
      const savedId = res.data.data?.id;
      if (savedId) try { await uploadFileRows(fileRows, 'expense_report', String(savedId), api.post.bind(api)); } catch (_) {}
      toast.success('Expense report submitted');
      navigate('/employee/expenses', { state: { justSaved: true } });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to submit'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employeeName) { toast.error('Employee name is required'); return; }
    mutation.mutate({
      ...form, totalAmount: total,
      departmentId: form.departmentId || null, locationId: form.locationId || null, subsidiaryId: form.subsidiaryId || null,
      lines: lines.map(l => ({ ...l, accountId: l.accountId||null, departmentId: l.departmentId||null, locationId: l.locationId||null })),
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
              <div className="w-8 h-8 rounded bg-orange-500 flex items-center justify-center text-white font-bold text-xs">EXP</div>
              <span className="text-xl font-bold text-slate-800">Expense Report</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/employee/expenses')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=expense_report')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button type="submit" form="expense-form" disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {mutation.isPending && <Loader2 size={12} className="animate-spin"/>} Submit Report
          </button>
          <button type="button" onClick={() => navigate('/employee/expenses')}
            className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>

      <form id="expense-form" onSubmit={handleSubmit}>
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
                    <div><label className="block text-xs text-slate-500 mb-1">Employee Name <span className="text-red-500">*</span></label>
                      <input value={form.employeeName} onChange={e=>set('employeeName',e.target.value)} className={dis} placeholder="Full name" required/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Period Start</label>
                      <input type="date" value={form.reportPeriodStart} onChange={e=>set('reportPeriodStart',e.target.value)} className={dis}/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Period End</label>
                      <input type="date" value={form.reportPeriodEnd} onChange={e=>set('reportPeriodEnd',e.target.value)} className={dis}/></div>
                  </div>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Purpose</label>
                      <input value={form.purpose} onChange={e=>set('purpose',e.target.value)} className={dis} placeholder="Business purpose"/></div>
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
                    <div><label className="block text-xs text-slate-500 mb-1">Notes / Memo</label>
                      <textarea value={form.memo} onChange={e=>set('memo',e.target.value)} rows={4} className={`${dis} resize-none`}/></div>
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
                  {tab==='lines'?'Expense Lines':'Files'}
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
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Date</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-36">Category</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-44">Description</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Account</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">Receipt #</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Amount</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                          <th className="px-3 py-2 w-8"/>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l, idx) => (
                          <tr key={l.id} className="border-t border-slate-100">
                            <td className="px-3 py-1 text-slate-400">{idx+1}</td>
                            <td className="px-1 py-1"><input type="date" value={l.date} onChange={e=>updateLine(l.id,'date',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 text-xs"/></td>
                            <td className="px-1 py-1">
                              <select value={l.category} onChange={e=>updateLine(l.id,'category',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 bg-white text-xs">
                                {CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
                              </select>
                            </td>
                            <td className="px-1 py-1"><input value={l.description} onChange={e=>updateLine(l.id,'description',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 text-xs" placeholder="Details"/></td>
                            <td className="px-1 py-1">
                              <select value={l.accountId} onChange={e=>updateLine(l.id,'accountId',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 bg-white text-xs">
                                <option value="">--</option>{expenseAccounts.map((a:any)=><option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                              </select>
                            </td>
                            <td className="px-1 py-1"><input value={l.receipt} onChange={e=>updateLine(l.id,'receipt',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 text-xs" placeholder="REF-XXX"/></td>
                            <td className="px-1 py-1"><input type="number" min="0" step="0.01" value={l.amount||''} onChange={e=>updateLine(l.id,'amount',parseFloat(e.target.value)||0)} className="w-full border border-slate-200 rounded px-1 py-0.5 text-right text-xs"/></td>
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
                            <td className="px-2 py-1"><button type="button" onClick={()=>removeLine(l.id)} className="text-red-400 hover:text-red-600"><Trash2 size={12}/></button></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                          <td colSpan={6} className="px-3 py-2 text-right text-slate-600 text-xs">Total Expenses</td>
                          <td className="px-3 py-2 text-right text-blue-700">{total.toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                          <td colSpan={3}/>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <button type="button" onClick={addLine}
                    className="mt-2 flex items-center gap-1 px-3 py-1.5 border border-dashed border-slate-300 text-xs text-slate-500 rounded hover:border-blue-400 hover:text-blue-600">
                    <Plus size={11}/> Add Expense
                  </button>
                </div>
              )}
              {lineTab === 'files' && <TransactionFileUploadRow rows={fileRows} setRows={setFileRows}/>}
            </div>
          </div>

          {/* Bottom bar */}
          <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
            <button type="submit" form="expense-form" disabled={mutation.isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
              {mutation.isPending && <Loader2 size={12} className="animate-spin"/>} Submit Report
            </button>
            <button type="button" onClick={() => navigate('/employee/expenses')}
              className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
          </div>

        </div>
      </form>
    </div>
  );
}
