import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Plus, Trash2 } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import NumberInput from '../../components/common/NumberInput';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import { formatCurrency, formatDate } from '../../utils/format';
import toast from 'react-hot-toast';

export default function ExpensePaymentForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { accounts, locations, departments } = useFormOptions();
  const bankAccounts = accounts.filter((a: any) => a.is_bank || ['1010','1020','1025'].includes(a.code));
  const payableAccounts = accounts.filter((a: any) =>
    String(a.subtype || '').toLowerCase().includes('payable') || a.type === 'liability');
  const { data: subsidiariesData } = useQuery({ queryKey: ['subsidiaries'], queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []) });
  const subsidiaries: any[] = subsidiariesData || [];

  const preAccountId = searchParams.get('accountId') || '';
  const preReportId  = searchParams.get('reportId')  || '';
  const preAmount    = parseFloat(searchParams.get('amount') || '0');

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [lineTab, setLineTab] = useState<'reports'|'files'>('reports');
  const [fileRows, setFileRows] = useState<FileRow[]>([]);

  const [form, setForm] = useState({
    accountId: preAccountId, paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'bank_transfer', reference: '',
    amount: preAmount, bankAccountId: '', locationId: '', departmentId: '', subsidiaryId: '', memo: '',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const [applications, setApplications] = useState<{ reportId: string; amount: number }[]>(
    preReportId && preAmount > 0 ? [{ reportId: preReportId, amount: preAmount }] : []
  );

  const { data: openReports = [] } = useQuery({
    queryKey: ['expense-open', form.accountId],
    queryFn: () => api.get('/api/employee/expense-open', { params: { accountId: form.accountId } })
      .then(r => (r.data.data || [])),
    enabled: !!form.accountId,
  });

  const selectedBank = accounts.find((a: any) => a.id === form.bankAccountId);
  const bankBalance = selectedBank ? Number(selectedBank.net_balance || 0) : null;

  const totalApplied = applications.reduce((s, a) => s + Number(a.amount || 0), 0);
  const unapplied = Number(form.amount) - totalApplied;

  const addApplication = (reportId: string, balanceDue: number) => {
    if (applications.find(a => a.reportId === reportId)) return;
    const remaining = Number(form.amount) - totalApplied;
    setApplications(prev => [...prev, { reportId, amount: Math.min(balanceDue, remaining > 0 ? remaining : balanceDue) }]);
  };

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/employee/expense-payments', data),
    onSuccess: async (res) => {
      const savedId = res.data.data?.id;
      if (savedId) try { await uploadFileRows(fileRows, 'expense_payment', String(savedId), api.post.bind(api)); } catch (_) {}
      toast.success('Expense payment posted');
      if (savedId) navigate(`/employee/expense-payments/${savedId}`, { state: { justSaved: true } });
      else navigate('/employee/expense-payments');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save payment'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.accountId) { toast.error('Account is required'); return; }
    if (!form.amount || Number(form.amount) <= 0) { toast.error('Amount must be > 0'); return; }
    if (!form.bankAccountId) { toast.error('Bank account is required'); return; }
    if (unapplied < -0.009) { toast.error('Harus isi Amount'); return; }
    mutation.mutate({
      ...form, amount: Number(form.amount),
      locationId: form.locationId||null, departmentId: form.departmentId||null, subsidiaryId: form.subsidiaryId||null,
      applications: applications.map(a => ({ reportId: a.reportId, amount: Number(a.amount) })),
    });
  };

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-orange-500 flex items-center justify-center text-white font-bold text-xs">EP</div>
              <span className="text-xl font-bold text-slate-800">Expense Payment</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/employee/expense-payments')} className="hover:underline">List</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button type="submit" form="exppay-form" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {mutation.isPending&&<Loader2 size={12} className="animate-spin"/>} Post Payment
          </button>
          <button type="button" onClick={() => navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>

      <form id="exppay-form" onSubmit={handleSubmit}>
        <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
          {/* Primary */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <button type="button" onClick={()=>setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              {primaryOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Primary Information
            </button>
            {primaryOpen && (
              <div className="px-4 pb-5 border-t border-slate-100">
                <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Account (Payable) <span className="text-red-500">*</span></label>
                      <select value={form.accountId} onChange={e=>{set('accountId',e.target.value);setApplications([]);}} className={dis} required>
                        <option value="">-- Select Account --</option>{payableAccounts.map((a:any)=><option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                      </select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Payment Date <span className="text-red-500">*</span></label>
                      <input type="date" value={form.paymentDate} onChange={e=>set('paymentDate',e.target.value)} className={dis} required/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Payment Method</label>
                      <select value={form.paymentMethod} onChange={e=>set('paymentMethod',e.target.value)} className={dis}>
                        <option value="bank_transfer">Bank Transfer</option><option value="cash">Cash</option><option value="check">Check / Giro</option>
                      </select></div>
                  </div>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Amount <span className="text-red-500">*</span></label>
                      <NumberInput value={form.amount} min={0} onChange={v=>set('amount',v)} className={`${dis} text-right font-medium`}/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Pay From (Bank Account) <span className="text-red-500">*</span></label>
                      <select value={form.bankAccountId} onChange={e=>set('bankAccountId',e.target.value)} className={dis} required>
                        <option value="">-- Select Account --</option>{bankAccounts.map((a:any)=><option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                      </select>
                      {selectedBank && (
                        <div className="mt-1 text-xs flex items-center justify-between px-1">
                          <span className="text-slate-500">Available Balance</span>
                          <span className={`font-semibold ${(bankBalance ?? 0) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(bankBalance ?? 0)}</span>
                        </div>
                      )}
                    </div>
                    <div><label className="block text-xs text-slate-500 mb-1">Reference / Cheque No.</label>
                      <input value={form.reference} onChange={e=>set('reference',e.target.value)} className={dis} placeholder="Transfer ref, cheque no"/></div>
                  </div>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Memo</label>
                      <input value={form.memo} onChange={e=>set('memo',e.target.value)} className={dis}/></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Classification */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <button type="button" onClick={()=>setClassOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              {classOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Classification
            </button>
            {classOpen && (
              <div className="px-4 pb-4 border-t border-slate-100">
                <div className="grid grid-cols-3 gap-x-10 mt-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label>
                    <select value={form.subsidiaryId} onChange={e=>set('subsidiaryId',e.target.value)} className={dis}><option value="">--</option>{subsidiaries.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Department</label>
                    <select value={form.departmentId} onChange={e=>set('departmentId',e.target.value)} className={dis}><option value="">--</option>{departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Location</label>
                    <select value={form.locationId} onChange={e=>set('locationId',e.target.value)} className={dis}><option value="">--</option>{locations.map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
                </div>
              </div>
            )}
          </div>

          {/* Reports + Files */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <div className="border-b border-slate-200 px-4 flex">
              {(['reports','files'] as const).map(tab=>(
                <button key={tab} type="button" onClick={()=>setLineTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${lineTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {tab==='reports'?'Apply to Expense Reports':'Files'}
                </button>
              ))}
            </div>
            <div className="p-4">
              {lineTab==='reports' && (
                <div>
                  <div className="flex items-center gap-6 text-sm mb-3 px-1 flex-wrap">
                    <span>Amount: <strong>{Number(form.amount).toLocaleString('id-ID',{minimumFractionDigits:2})}</strong></span>
                    <span>Applied: <strong className="text-blue-600">{totalApplied.toLocaleString('id-ID',{minimumFractionDigits:2})}</strong></span>
                    <span className={unapplied < 0 ? 'text-red-600' : 'text-slate-600'}>Unapplied: <strong>{unapplied.toLocaleString('id-ID',{minimumFractionDigits:2})}</strong></span>
                  </div>
                  {form.accountId && openReports.length > 0 ? (
                    <div className="border border-slate-200 rounded overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600">Report #</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600">Employee</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-600">Orig. Amt.</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-600">Balance Due</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-600 w-36">Apply Amount</th>
                            <th className="px-3 py-2 w-20"/>
                          </tr>
                        </thead>
                        <tbody>
                          {openReports.map((rep: any) => {
                            const app = applications.find(a => a.reportId === rep.id);
                            return (
                              <tr key={rep.id} className="border-t border-slate-100">
                                <td className="px-3 py-1.5 font-mono text-xs text-blue-600">{rep.report_number}</td>
                                <td className="px-3 py-1.5 text-slate-600">{rep.employee_name}</td>
                                <td className="px-3 py-1.5">{rep.report_period_end?formatDate(rep.report_period_end):'-'}</td>
                                <td className="px-3 py-1.5 text-right text-slate-600">{formatCurrency(rep.total_amount)}</td>
                                <td className="px-3 py-1.5 text-right font-medium text-red-600">{formatCurrency(rep.balance_due)}</td>
                                <td className="px-1.5 py-1 text-right">
                                  {app ? (
                                    <NumberInput value={app.amount} min={0}
                                      onChange={v=>setApplications(prev=>prev.map(a=>a.reportId===rep.id?{...a,amount:Math.min(v,Number(rep.balance_due))}:a))}
                                      className="w-32 border border-slate-300 rounded px-1.5 py-0.5 text-right text-xs"/>
                                  ) : '—'}
                                </td>
                                <td className="px-3 py-1.5">
                                  {app
                                    ? <button type="button" onClick={()=>setApplications(prev=>prev.filter(a=>a.reportId!==rep.id))} className="text-red-400 hover:text-red-600"><Trash2 size={12}/></button>
                                    : <button type="button" onClick={()=>addApplication(rep.id,Number(rep.balance_due))} className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"><Plus size={11}/> Apply</button>
                                  }
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="py-6 text-center text-slate-400 text-sm border border-dashed border-slate-200 rounded">
                      {form.accountId ? 'No approved unpaid expense reports for this account.' : 'Select an account to see open expense reports.'}
                    </div>
                  )}
                  <div className="mt-4 rounded border border-emerald-200 bg-emerald-50/30 p-3 text-xs text-emerald-800">
                    <strong>GL Impact:</strong> Dr. {payableAccounts.find((a:any)=>a.id===form.accountId)?.name || 'Payable account'} → Cr. Bank/Cash
                  </div>
                </div>
              )}
              {lineTab==='files' && <TransactionFileUploadRow rows={fileRows} setRows={setFileRows}/>}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
            <button type="submit" form="exppay-form" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
              {mutation.isPending&&<Loader2 size={12} className="animate-spin"/>} Post Payment
            </button>
            <button type="button" onClick={()=>navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      </form>
    </div>
  );
}
