import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Plus, Trash2 } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import { formatCurrency, formatDate } from '../../utils/format';
import toast from 'react-hot-toast';

export default function BillPaymentForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { vendors, accounts, locations, departments } = useFormOptions();
  const bankAccounts = accounts.filter((a: any) => a.is_bank || ['1010','1020','1025'].includes(a.code));
  const { data: subsidiariesData } = useQuery({ queryKey: ['subsidiaries'], queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []) });
  const subsidiaries: any[] = subsidiariesData || [];

  const preVendorId = searchParams.get('vendorId') || '';
  const preBillId   = searchParams.get('billId')   || '';
  const preAmount   = parseFloat(searchParams.get('amount') || '0');

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [lineTab, setLineTab] = useState<'bills'|'files'>('bills');
  const [fileRows, setFileRows] = useState<FileRow[]>([]);

  const [form, setForm] = useState({
    vendorId: preVendorId, paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'bank_transfer', reference: '', currency: 'IDR',
    amount: preAmount, bankAccountId: '', locationId: '', departmentId: '', subsidiaryId: '', memo: '',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const [applications, setApplications] = useState<{ billId: string; amount: number }[]>(
    preBillId && preAmount > 0 ? [{ billId: preBillId, amount: preAmount }] : []
  );

  const { data: openBills = [] } = useQuery({
    queryKey: ['open-bills', form.vendorId],
    queryFn: () => api.get('/api/purchasing/bills', { params: { vendorId: form.vendorId, limit: 100 } })
      .then(r => (r.data.data || []).filter((b: any) => ['open','partially_paid'].includes(b.status))),
    enabled: !!form.vendorId,
  });

  const totalApplied = applications.reduce((s, a) => s + Number(a.amount || 0), 0);
  const unapplied = Number(form.amount) - totalApplied;

  const addApplication = (billId: string, amountDue: number) => {
    if (applications.find(a => a.billId === billId)) return;
    const remaining = Number(form.amount) - totalApplied;
    setApplications(prev => [...prev, { billId, amount: Math.min(amountDue, remaining > 0 ? remaining : amountDue) }]);
  };

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/purchasing/vendor-payments', data),
    onSuccess: async (res) => {
      const savedId = res.data.data.id;
      try { await uploadFileRows(fileRows, 'vendor_payment', String(savedId), api.post.bind(api)); } catch (_) {}
      toast.success(`Payment ${res.data.data.payment_number} posted`);
      navigate(`/purchasing/payments/${savedId}`, { state: { justSaved: true } });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to record payment'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vendorId) { toast.error('Vendor is required'); return; }
    if (!form.amount || form.amount <= 0) { toast.error('Amount must be > 0'); return; }
    if (!form.bankAccountId) { toast.error('Bank account is required'); return; }
    mutation.mutate({ ...form, amount: Number(form.amount), locationId: form.locationId||null, departmentId: form.departmentId||null, subsidiaryId: form.subsidiaryId||null, applications: applications.map(a => ({ billId: a.billId, amount: Number(a.amount) })) });
  };

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-emerald-600 flex items-center justify-center text-white font-bold text-sm">$</div>
              <span className="text-xl font-bold text-slate-800">Bill Payment</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/purchasing/payments')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=vendor_payment')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button type="submit" form="billpay-form" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {mutation.isPending&&<Loader2 size={12} className="animate-spin"/>} Post Payment
          </button>
          <button type="button" onClick={() => navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>

      <form id="billpay-form" onSubmit={handleSubmit}>
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
                    <div><label className="block text-xs text-slate-500 mb-1">Vendor <span className="text-red-500">*</span></label>
                      <select value={form.vendorId} onChange={e=>{set('vendorId',e.target.value);setApplications([]);}} className={dis} required>
                        <option value="">-- Select Vendor --</option>{vendors.map((v:any)=><option key={v.id} value={v.id}>{v.name}</option>)}
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
                      <input type="number" min="0" step="0.01" value={form.amount} onChange={e=>set('amount',parseFloat(e.target.value)||0)} className={`${dis} text-right font-medium`}/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Pay From (Bank Account) <span className="text-red-500">*</span></label>
                      <select value={form.bankAccountId} onChange={e=>set('bankAccountId',e.target.value)} className={dis} required>
                        <option value="">-- Select Account --</option>{bankAccounts.map((a:any)=><option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                      </select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Reference / Cheque No.</label>
                      <input value={form.reference} onChange={e=>set('reference',e.target.value)} className={dis} placeholder="Transfer ref, cheque no"/></div>
                  </div>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Location</label>
                      <select value={form.locationId} onChange={e=>set('locationId',e.target.value)} className={dis}><option value="">--</option>{locations.map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Department</label>
                      <select value={form.departmentId} onChange={e=>set('departmentId',e.target.value)} className={dis}><option value="">--</option>{departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
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

          {/* Bills + Files */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <div className="border-b border-slate-200 px-4 flex">
              {(['bills','files'] as const).map(tab=>(
                <button key={tab} type="button" onClick={()=>setLineTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${lineTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {tab==='bills'?'Apply to Bills':'Files'}
                </button>
              ))}
            </div>
            <div className="p-4">
              {lineTab==='bills' && (
                <div>
                  {/* Summary bar */}
                  <div className="flex items-center gap-6 text-sm mb-3 px-1">
                    <span>Payment: <strong>{Number(form.amount).toLocaleString('id-ID',{minimumFractionDigits:2})}</strong></span>
                    <span>Applied: <strong className="text-blue-600">{totalApplied.toLocaleString('id-ID',{minimumFractionDigits:2})}</strong></span>
                    <span className={unapplied < 0 ? 'text-red-600' : 'text-slate-600'}>Unapplied: <strong>{unapplied.toLocaleString('id-ID',{minimumFractionDigits:2})}</strong></span>
                  </div>
                  {form.vendorId && openBills.length > 0 ? (
                    <div className="border border-slate-200 rounded overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600">Bill #</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600">Bill Date</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600">Due Date</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-600">Balance Due</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-600 w-36">Apply Amount</th>
                            <th className="px-3 py-2 w-20"/>
                          </tr>
                        </thead>
                        <tbody>
                          {openBills.map((bill: any) => {
                            const app = applications.find(a => a.billId === bill.id);
                            return (
                              <tr key={bill.id} className="border-t border-slate-100">
                                <td className="px-3 py-1.5 font-mono text-xs text-blue-600">{bill.bill_number}</td>
                                <td className="px-3 py-1.5">{formatDate(bill.bill_date)}</td>
                                <td className="px-3 py-1.5">{formatDate(bill.due_date)}</td>
                                <td className="px-3 py-1.5 text-right font-medium text-red-600">{formatCurrency(bill.amount_due)}</td>
                                <td className="px-1.5 py-1 text-right">
                                  {app ? (
                                    <input type="number" min="0" step="0.01" value={app.amount}
                                      onChange={e=>setApplications(prev=>prev.map(a=>a.billId===bill.id?{...a,amount:Math.min(parseFloat(e.target.value)||0,parseFloat(bill.amount_due))}:a))}
                                      className="w-32 border border-slate-300 rounded px-1.5 py-0.5 text-right text-xs"/>
                                  ) : '—'}
                                </td>
                                <td className="px-3 py-1.5">
                                  {app
                                    ? <button type="button" onClick={()=>setApplications(prev=>prev.filter(a=>a.billId!==bill.id))} className="text-red-400 hover:text-red-600"><Trash2 size={12}/></button>
                                    : <button type="button" onClick={()=>addApplication(bill.id,parseFloat(bill.amount_due))} className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"><Plus size={11}/> Apply</button>
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
                      {form.vendorId ? 'No open bills for this vendor.' : 'Select a vendor to see open bills.'}
                    </div>
                  )}
                </div>
              )}
              {lineTab==='files' && <TransactionFileUploadRow rows={fileRows} setRows={setFileRows}/>}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
            <button type="submit" form="billpay-form" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
              {mutation.isPending&&<Loader2 size={12} className="animate-spin"/>} Post Payment
            </button>
            <button type="button" onClick={()=>navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      </form>
    </div>
  );
}
