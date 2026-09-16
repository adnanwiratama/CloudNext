import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Banknote } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import toast from 'react-hot-toast';

export default function RefundCustomerForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { customers, accounts, locations, departments } = useFormOptions();
  const bankAccounts = accounts.filter((a: any) => a.is_bank || ['1010','1020','1025'].includes(a.code));

  const { data: subsidiariesData } = useQuery({ queryKey: ['subsidiaries'], queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []) });
  const subsidiaries: any[] = subsidiariesData || [];

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [lineTab, setLineTab] = useState<'details'|'files'>('details');
  const [fileRows, setFileRows] = useState<FileRow[]>([{ id: `f_${Date.now()}`, file: null, title: '', description: '', folder: 'Attachments' }]);

  const [form, setForm] = useState({
    customerId: searchParams.get('customerId') || '',
    refundDate: new Date().toISOString().split('T')[0],
    amount: parseFloat(searchParams.get('amount') || '0'),
    bankAccountId: '',
    paymentMethod: 'bank_transfer',
    reference: '',
    creditMemoNumber: searchParams.get('creditMemoNumber') || '',
    reason: '',
    memo: '',
    departmentId: '',
    locationId: '',
    subsidiaryId: '',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/sales/refunds', data),
    onSuccess: async (res) => {
      const savedId = res.data?.data?.id;
      try { if (savedId) await uploadFileRows(fileRows, 'customer_refund', String(savedId), api.post.bind(api)); } catch (_) {}
      toast.success('Customer refund recorded');
      navigate('/sales/refunds');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to record refund'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId) { toast.error('Customer is required'); return; }
    if (!form.amount || form.amount <= 0) { toast.error('Amount must be greater than 0'); return; }
    if (!form.bankAccountId) { toast.error('Bank Account is required'); return; }
    mutation.mutate({
      ...form,
      amount: Number(form.amount),
      departmentId: form.departmentId || null,
      locationId: form.locationId || null,
      subsidiaryId: form.subsidiaryId || null,
    });
  };

  const dis = 'w-full border border-slate-300 rounded text-sm px-2 py-1.5';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-amber-500 flex items-center justify-center text-white"><Banknote size={15}/></div>
              <span className="text-xl font-bold text-slate-800">Refund Customer</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/sales/refunds')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=customer_refund')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <div className="flex">
            <button type="submit" form="refund-form" disabled={mutation.isPending} className="px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded-l hover:bg-blue-800 disabled:opacity-60 flex items-center gap-1">
              {mutation.isPending && <Loader2 size={12} className="animate-spin"/>} Save
            </button>
            <button type="button" className="px-2 py-1.5 bg-blue-700 text-white border-l border-blue-600 rounded-r hover:bg-blue-800">▾</button>
          </div>
          <button type="button" onClick={() => navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>

      <form id="refund-form" onSubmit={handleSubmit}>
        <div className="p-4 space-y-3 max-w-screen-xl mx-auto">
          {/* Primary Information */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <button type="button" onClick={() => setPrimaryOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              {primaryOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Primary Information
            </button>
            {primaryOpen && (
              <div className="px-4 pb-5 border-t border-slate-100">
                <div className="grid grid-cols-3 gap-x-10 gap-y-4 mt-4">
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Customer <span className="text-red-500">*</span></label>
                      <select value={form.customerId} onChange={e=>set('customerId',e.target.value)} className={dis} required>
                        <option value="">-- Select Customer --</option>
                        {customers.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}
                      </select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Refund Date <span className="text-red-500">*</span></label>
                      <input type="date" value={form.refundDate} onChange={e=>set('refundDate',e.target.value)} className={dis} required/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Payment Method</label>
                      <select value={form.paymentMethod} onChange={e=>set('paymentMethod',e.target.value)} className={dis}>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="cash">Cash</option>
                        <option value="check">Check / Giro</option>
                      </select></div>
                  </div>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Refund Amount <span className="text-red-500">*</span></label>
                      <input type="number" min="0" step="0.01" value={form.amount} onChange={e=>set('amount',parseFloat(e.target.value)||0)} className={dis + ' text-right'} placeholder="0"/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Refund From (Bank/Cash) <span className="text-red-500">*</span></label>
                      <select value={form.bankAccountId} onChange={e=>set('bankAccountId',e.target.value)} className={dis} required>
                        <option value="">-- Select Account --</option>
                        {bankAccounts.map((a:any)=><option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                      </select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Reference</label>
                      <input type="text" value={form.reference} onChange={e=>set('reference',e.target.value)} className={dis} placeholder="Transfer ref"/></div>
                  </div>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Credit Memo #</label>
                      <input type="text" value={form.creditMemoNumber} onChange={e=>set('creditMemoNumber',e.target.value)} className={dis} placeholder="CM-XXXX"/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Reason</label>
                      <select value={form.reason} onChange={e=>set('reason',e.target.value)} className={dis}>
                        <option value="">-- Select Reason --</option>
                        <option value="return">Goods Return</option>
                        <option value="overpayment">Overpayment</option>
                        <option value="cancellation">Order Cancellation</option>
                        <option value="other">Other</option>
                      </select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Memo</label>
                      <textarea value={form.memo} onChange={e=>set('memo',e.target.value)} rows={2} className={`${dis} resize-none`}/></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Classification */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <button type="button" onClick={() => setClassOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              {classOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} Classification
            </button>
            {classOpen && (
              <div className="px-4 pb-4 border-t border-slate-100">
                <div className="grid grid-cols-3 gap-x-10 mt-3">
                  <div><label className="block text-xs text-slate-500 mb-1">Subsidiary</label>
                    <select value={form.subsidiaryId} onChange={e=>set('subsidiaryId',e.target.value)} className={dis}>
                      <option value="">--</option>{subsidiaries.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}
                    </select></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Department</label>
                    <select value={form.departmentId} onChange={e=>set('departmentId',e.target.value)} className={dis}>
                      <option value="">--</option>{departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}
                    </select></div>
                  <div><label className="block text-xs text-slate-500 mb-1">Location</label>
                    <select value={form.locationId} onChange={e=>set('locationId',e.target.value)} className={dis}>
                      <option value="">--</option>{locations.map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}
                    </select></div>
                </div>
              </div>
            )}
          </div>

          {/* Details + Files */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <div className="border-b border-slate-200 px-4 flex">
              {(['details','files'] as const).map(tab=>(
                <button key={tab} type="button" onClick={()=>setLineTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${lineTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {tab==='details'?'Details':'Files'}
                </button>
              ))}
            </div>
            <div className="p-4">
              {lineTab==='details' && (
                <div className="rounded border border-amber-200 bg-amber-50/30 p-4 text-sm text-amber-800">
                  <p className="font-medium">GL Impact</p>
                  <p className="text-xs text-amber-700 mt-1"><strong>Dr. Accounts Receivable / Customer Deposit → Cr. Bank Account</strong></p>
                </div>
              )}
              {lineTab==='files' && <TransactionFileUploadRow rows={fileRows} setRows={setFileRows}/>}
            </div>
          </div>

          {/* Bottom bar */}
          <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
            <button type="submit" form="refund-form" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
              {mutation.isPending&&<Loader2 size={12} className="animate-spin"/>} Save
            </button>
            <button type="button" onClick={()=>navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      </form>
    </div>
  );
}
