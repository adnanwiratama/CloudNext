import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Plus, X, Trash2 } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import NumberInput from '../../components/common/NumberInput';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import toast from 'react-hot-toast';

interface ExpenseLine {
  id: number; date: string; category: string; description: string;
  amount: number; receipt: string; accountId: string; departmentId: string; locationId: string;
}

const blankLine = (n: number): ExpenseLine => ({
  id: n, date: new Date().toISOString().split('T')[0],
  category: '', description: '', amount: 0,
  receipt: '', accountId: '', departmentId: '', locationId: '',
});

// Turn an expense account name into a Category label by removing the word "Expense(s)".
const categoryLabel = (name: string): string =>
  String(name || '').replace(/\bexpenses?\b/ig, '').replace(/\s{2,}/g, ' ').replace(/[-–\s]+$/,'').trim() || name;

export default function ExpenseReportForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== 'new';
  const { accounts, locations, departments } = useFormOptions();
  // Category options come from expense accounts (label = account name without "Expense(s)").
  const expenseAccounts = accounts.filter((a: any) => a.type === 'expense');
  // Header Account options: accounts whose subtype is a payable
  const payableAccounts = accounts.filter((a: any) =>
    String(a.subtype || '').toLowerCase().includes('payable') || a.type === 'liability');
  const { data: subsidiariesData } = useQuery({ queryKey: ['subsidiaries'], queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []) });
  const subsidiaries: any[] = subsidiariesData || [];

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [lineTab, setLineTab] = useState<'lines'|'files'>('lines');
  const [lineCounter, setLineCounter] = useState(1000);
  const [fileRows, setFileRows] = useState<FileRow[]>([]);

  const [form, setForm] = useState({
    employeeName: '', accountId: '', departmentId: '', locationId: '', subsidiaryId: '',
    reportPeriodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    reportPeriodEnd: new Date().toISOString().split('T')[0],
    purpose: '', memo: '',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const [lines, setLines] = useState<ExpenseLine[]>([]);

  // ── Line editing (PO-style Add / Cancel / Remove) ─────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null); // -1 = new
  const [editLine, setEditLine] = useState<ExpenseLine>(blankLine(0));

  const setEdit = (key: string, value: any) => {
    setEditLine(l => {
      const u: any = { ...l, [key]: value };
      // Category IS the expense account — selecting it sets the account.
      if (key === 'category') { u.accountId = value; }
      return u;
    });
  };

  const startNewLine = () => { setLineCounter(c => c + 1); setEditLine({ ...blankLine(lineCounter + 1), departmentId: form.departmentId, locationId: form.locationId }); setEditingId(-1); };
  const editExistingLine = (l: ExpenseLine) => { setEditLine({ ...l }); setEditingId(l.id); };
  const cancelEdit = () => { setEditLine(blankLine(0)); setEditingId(null); };
  const commitEdit = () => {
    if (!editLine.category && !editLine.accountId) { toast.error('Category is required'); return; }
    if (editingId === -1) { setLineCounter(c => c + 1); setLines(prev => [...prev, { ...editLine, id: lineCounter + 1 }]); }
    else setLines(prev => prev.map(l => l.id === editingId ? editLine : l));
    setEditLine(blankLine(0)); setEditingId(null);
  };
  const removeEditing = () => {
    if (editingId !== null && editingId !== -1) setLines(prev => prev.filter(l => l.id !== editingId));
    setEditLine(blankLine(0)); setEditingId(null);
  };

  // EDIT MODE: load the existing report
  const { data: existingReport } = useQuery({
    queryKey: ['expense-report-edit', id],
    queryFn: () => api.get(`/api/employee/expenses/${id}`).then(r => r.data.data),
    enabled: isEdit,
  });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!isEdit || !existingReport || loaded) return;
    setForm(f => ({
      ...f,
      employeeName: existingReport.employee_name || '',
      accountId: existingReport.account_id || '',
      departmentId: existingReport.department_id || '',
      locationId: existingReport.location_id || '',
      subsidiaryId: existingReport.subsidiary_id || '',
      reportPeriodStart: existingReport.report_period_start?.split('T')[0] || f.reportPeriodStart,
      reportPeriodEnd: existingReport.report_period_end?.split('T')[0] || f.reportPeriodEnd,
      purpose: existingReport.purpose || '',
      memo: existingReport.memo || '',
    }));
    if (existingReport.lines?.length) {
      setLines(existingReport.lines.map((l: any, i: number) => ({
        id: 1000 + i,
        date: l.expense_date?.split('T')[0] || new Date().toISOString().split('T')[0],
        category: l.account_id || l.category || '',
        description: l.description || '',
        amount: parseFloat(l.amount) || 0,
        receipt: l.receipt_number || '',
        accountId: l.account_id || '',
        departmentId: l.department_id || '',
        locationId: l.location_id || '',
      })));
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingReport, isEdit, loaded]);

  const total = lines.reduce((s, l) => s + Number(l.amount || 0), 0);
  const acctLabel = (aid: string) => { const a = expenseAccounts.find((x:any)=>x.id===aid); return a ? categoryLabel(a.name) : (aid || '-'); };

  const mutation = useMutation({
    mutationFn: (data: any) => isEdit ? api.put(`/api/employee/expenses/${id}`, data) : api.post('/api/employee/expenses', data),
    onSuccess: async (res) => {
      const savedId = res.data.data?.id || id;
      if (savedId) try { await uploadFileRows(fileRows, 'expense_report', String(savedId), api.post.bind(api)); } catch (_) {}
      toast.success(isEdit ? 'Expense report updated' : 'Expense report submitted');
      if (savedId) navigate(`/employee/expenses/${savedId}`, { state: { justSaved: true } });
      else navigate('/employee/expenses');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to submit'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employeeName) { toast.error('Employee name is required'); return; }
    const validLines = lines.filter(l => l.accountId || l.category);
    mutation.mutate({
      ...form, totalAmount: total, accountId: form.accountId || null,
      departmentId: form.departmentId || null, locationId: form.locationId || null, subsidiaryId: form.subsidiaryId || null,
      lines: validLines.map(l => ({
        date: l.date, category: l.accountId ? acctLabel(l.accountId) : l.category, description: l.description,
        amount: Number(l.amount), receipt: l.receipt,
        accountId: l.accountId || l.category || null,
        departmentId: l.departmentId || null, locationId: l.locationId || null,
      })),
    });
  };

  const dis = 'w-full border border-slate-300 rounded text-sm px-2 py-1.5 focus:outline-none focus:border-blue-400';
  const sel = `${dis} bg-white`;
  const cell = 'w-full border border-slate-300 rounded text-xs px-1.5 py-1 focus:outline-none focus:border-blue-400';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-orange-500 flex items-center justify-center text-white font-bold text-xs">EXP</div>
              <span className="text-xl font-bold text-slate-800">{isEdit ? 'Edit Expense Report' : 'Expense Report'}</span>
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
            {mutation.isPending && <Loader2 size={12} className="animate-spin"/>} {isEdit ? 'Save Changes' : 'Submit Report'}
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
                    <div><label className="block text-xs text-slate-500 mb-1">Account (Payable)</label>
                      <select value={form.accountId} onChange={e=>set('accountId',e.target.value)} className={sel}>
                        <option value="">-- Select Account --</option>
                        {payableAccounts.map((a:any)=><option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                      </select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Period Start</label>
                      <input type="date" value={form.reportPeriodStart} onChange={e=>set('reportPeriodStart',e.target.value)} className={dis}/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Period End</label>
                      <input type="date" value={form.reportPeriodEnd} onChange={e=>set('reportPeriodEnd',e.target.value)} className={dis}/></div>
                  </div>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Purpose</label>
                      <input value={form.purpose} onChange={e=>set('purpose',e.target.value)} className={dis} placeholder="Business purpose"/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Notes / Memo</label>
                      <textarea value={form.memo} onChange={e=>set('memo',e.target.value)} rows={3} className={`${dis} resize-none`}/></div>
                  </div>
                  <div className="space-y-3">
                    <div className="border border-slate-200 rounded overflow-hidden">
                      <div className="bg-slate-600 text-white text-xs font-semibold px-3 py-1.5">Summary</div>
                      <div className="text-sm">
                        <div className="flex justify-between px-3 py-1.5 font-bold bg-slate-50"><span>Total Expenses</span><span>{total.toLocaleString('id-ID',{minimumFractionDigits:2})}</span></div>
                      </div>
                    </div>
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
                <div className="border border-slate-200 rounded overflow-x-auto">
                  <table className="w-full text-xs min-w-max">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Date</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-48">Category (Account)</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-44">Description</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">Receipt #</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Amount</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map(l => (
                        <tr key={l.id} onClick={()=>editExistingLine(l)} className="border-t border-slate-100 hover:bg-blue-50 cursor-pointer">
                          <td className="px-3 py-1.5">{l.date || '-'}</td>
                          <td className="px-3 py-1.5 text-slate-700">{acctLabel(l.accountId || l.category)}</td>
                          <td className="px-3 py-1.5 text-slate-600">{l.description || '-'}</td>
                          <td className="px-3 py-1.5 text-slate-500">{l.receipt || '-'}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{l.amount.toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                          <td className="px-3 py-1.5 text-slate-500">{departments.find((d:any)=>d.id===l.departmentId)?.name || '-'}</td>
                          <td className="px-3 py-1.5 text-slate-500">{locations.find((loc:any)=>loc.id===l.locationId)?.name || '-'}</td>
                        </tr>
                      ))}
                      {editingId !== null && (
                        <tr className="border-t border-blue-300 bg-blue-50/40">
                          <td className="px-1.5 py-1"><input type="date" value={editLine.date} onChange={e=>setEdit('date',e.target.value)} className={cell}/></td>
                          <td className="px-1.5 py-1">
                            <select value={editLine.category} onChange={e=>setEdit('category',e.target.value)} autoFocus className={`${cell} bg-white`}>
                              <option value=""></option>
                              {expenseAccounts.map((a:any)=><option key={a.id} value={a.id}>{categoryLabel(a.name)}</option>)}
                            </select>
                          </td>
                          <td className="px-1.5 py-1"><input value={editLine.description} onChange={e=>setEdit('description',e.target.value)} className={cell} placeholder="Details"/></td>
                          <td className="px-1.5 py-1"><input value={editLine.receipt} onChange={e=>setEdit('receipt',e.target.value)} className={cell} placeholder="REF-XXX"/></td>
                          <td className="px-1.5 py-1"><NumberInput value={editLine.amount} min={0} onChange={v=>setEdit('amount',v)} className={`${cell} text-right`}/></td>
                          <td className="px-1.5 py-1"><select value={editLine.departmentId} onChange={e=>setEdit('departmentId',e.target.value)} className={`${cell} bg-white`}><option value="">—</option>{departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}</select></td>
                          <td className="px-1.5 py-1"><select value={editLine.locationId} onChange={e=>setEdit('locationId',e.target.value)} className={`${cell} bg-white`}><option value="">—</option>{locations.map((loc:any)=><option key={loc.id} value={loc.id}>{loc.name}</option>)}</select></td>
                        </tr>
                      )}
                      {editingId === null && (
                        <tr onClick={startNewLine} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                          <td colSpan={7} className="px-3 py-2 text-slate-400 text-xs italic">Click to add an expense line...</td>
                        </tr>
                      )}
                    </tbody>
                    {lines.length>0 && (
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                          <td colSpan={4} className="px-3 py-2 text-right text-slate-600 text-xs">Total Expenses</td>
                          <td className="px-3 py-2 text-right text-blue-700">{total.toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                          <td colSpan={2}/>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                  {editingId !== null && (
                    <div className="px-3 py-2 border-t border-slate-200 bg-white flex gap-2">
                      <button type="button" onClick={commitEdit} className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 text-white text-xs font-medium rounded hover:bg-blue-800"><Plus size={11}/> Add</button>
                      <button type="button" onClick={cancelEdit} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs text-slate-700 rounded hover:bg-slate-50"><X size={11}/> Cancel</button>
                      <button type="button" onClick={removeEditing} className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-xs text-red-600 rounded hover:bg-red-50"><Trash2 size={11}/> Remove</button>
                    </div>
                  )}
                </div>
              )}
              {lineTab === 'files' && <TransactionFileUploadRow rows={fileRows} setRows={setFileRows}/>}
            </div>
          </div>

          {/* Bottom bar */}
          <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
            <button type="submit" form="expense-form" disabled={mutation.isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
              {mutation.isPending && <Loader2 size={12} className="animate-spin"/>} {isEdit ? 'Save Changes' : 'Submit Report'}
            </button>
            <button type="button" onClick={() => navigate('/employee/expenses')}
              className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
          </div>

        </div>
      </form>
    </div>
  );
}
