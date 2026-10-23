import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Wallet } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import toast from 'react-hot-toast';

export default function VendorPrepaymentForm() {
  const navigate = useNavigate();
  const { vendors, accounts, locations, departments } = useFormOptions();
  const bankAccounts = accounts.filter((a: any) => a.is_bank || ['1010','1020','1025'].includes(a.code));
  const { data: subsidiariesData } = useQuery({ queryKey: ['subsidiaries'], queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []) });
  const subsidiaries: any[] = subsidiariesData || [];

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [lineTab, setLineTab] = useState<'details'|'files'>('details');
  const [fileRows, setFileRows] = useState<FileRow[]>([]);

  const [form, setForm] = useState({
    vendorId: '',
    paymentDate: new Date().toISOString().split('T')[0],
    amount: 0,
    bankAccountId: '',
    paymentMethod: 'bank_transfer',
    reference: '',
    purchaseOrderId: '',
    memo: '',
    departmentId: '',
    locationId: '',
    subsidiaryId: '',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/purchasing/prepayments', data),
    onSuccess: async (res) => {
      const savedId = res.data?.data?.id;
      if (savedId) { try { await uploadFileRows(fileRows, 'vendor_prepayment', String(savedId), api.post.bind(api)); } catch(_) {} }
      toast.success('Vendor prepayment recorded');
      if (savedId) navigate(`/purchasing/prepayments/${savedId}`, { state: { justSaved: true } });
      else navigate('/purchasing/prepayments');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to record prepayment'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vendorId) { toast.error('Vendor is required'); return; }
    if (!form.amount || form.amount <= 0) { toast.error('Amount must be greater than 0'); return; }
    if (!form.bankAccountId) { toast.error('Bank Account is required'); return; }
    mutation.mutate({
      ...form,
      amount: Number(form.amount),
      purchaseOrderId: form.purchaseOrderId || null,
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
              <div className="w-8 h-8 rounded bg-violet-600 flex items-center justify-center text-white"><Wallet size={15}/></div>
              <span className="text-xl font-bold text-slate-800">Vendor Prepayment</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/purchasing/prepayments')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=vendor_prepayment')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button type="submit" form="prepayment-form" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {mutation.isPending&&<Loader2 size={12} className="animate-spin"/>} Save
          </button>
          <button type="button" onClick={() => navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>

      <form id="prepayment-form" onSubmit={handleSubmit}>
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
                      <select value={form.vendorId} onChange={e=>set('vendorId',e.target.value)} className={dis} required>
                        <option value="">-- Select Vendor --</option>{vendors.map((v:any)=><option key={v.id} value={v.id}>{v.name}</option>)}
                      </select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Payment Date <span className="text-red-500">*</span></label>
                      <input type="date" value={form.paymentDate} onChange={e=>set('paymentDate',e.target.value)} className={dis} required/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Amount <span className="text-red-500">*</span></label>
                      <input type="number" min="0" step="0.01" value={form.amount} onChange={e=>set('amount',e.target.value)} className={dis + ' text-right'} placeholder="0"/></div>
                  </div>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Pay From (Bank/Cash) <span className="text-red-500">*</span></label>
                      <select value={form.bankAccountId} onChange={e=>set('bankAccountId',e.target.value)} className={dis} required>
                        <option value="">-- Select Account --</option>{bankAccounts.map((a:any)=><option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                      </select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Payment Method</label>
                      <select value={form.paymentMethod} onChange={e=>set('paymentMethod',e.target.value)} className={dis}>
                        <option value="bank_transfer">Bank Transfer</option><option value="cash">Cash</option><option value="check">Check / Giro</option>
                      </select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Reference</label>
                      <input value={form.reference} onChange={e=>set('reference',e.target.value)} className={dis} placeholder="Transfer ref / cheque no"/></div>
                  </div>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">PO Reference</label>
                      <input value={form.purchaseOrderId} onChange={e=>set('purchaseOrderId',e.target.value)} className={dis} placeholder="PO ID..."/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Memo</label>
                      <input value={form.memo} onChange={e=>set('memo',e.target.value)} className={dis} placeholder="Purpose of prepayment"/></div>
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
                <div className="rounded border border-emerald-200 bg-emerald-50/30 p-4 text-sm text-emerald-800">
                  <p className="font-medium">GL Impact</p>
                  <p className="text-xs text-emerald-700 mt-1"><strong>Dr. Vendor Prepayment (1130) → Cr. Bank Account</strong><br/>
                  Prepayment akan di-apply ke Vendor Bill saat tagihan diterima.</p>
                </div>
              )}
              {lineTab==='files' && <TransactionFileUploadRow rows={fileRows} setRows={setFileRows}/>}
            </div>
          </div>

          {/* Bottom bar */}
          <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
            <button type="submit" form="prepayment-form" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
              {mutation.isPending&&<Loader2 size={12} className="animate-spin"/>} Save
            </button>
            <button type="button" onClick={()=>navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      </form>
    </div>
  );
}
