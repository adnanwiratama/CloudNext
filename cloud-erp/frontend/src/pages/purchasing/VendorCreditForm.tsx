import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Plus, Trash2, Receipt } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import toast from 'react-hot-toast';

interface CreditLine { itemId: string; description: string; qty: number; unitPrice: number; }

export default function VendorCreditForm() {
  const navigate = useNavigate();
  const { vendors, items, locations, departments } = useFormOptions();
  const { data: subsidiariesData } = useQuery({ queryKey: ['subsidiaries'], queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []) });
  const subsidiaries: any[] = subsidiariesData || [];

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [lineTab, setLineTab] = useState<'lines'|'files'>('lines');
  const [fileRows, setFileRows] = useState<FileRow[]>([]);

  const [form, setForm] = useState({
    vendorId: '',
    creditDate: new Date().toISOString().split('T')[0],
    creditMemoNumber: '',
    originalBillNumber: '',
    reason: '',
    memo: '',
    departmentId: '',
    locationId: '',
    subsidiaryId: '',
  });
  const [lines, setLines] = useState<CreditLine[]>([{ itemId: '', description: '', qty: 1, unitPrice: 0 }]);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const total = lines.reduce((s, l) => s + Number(l.qty) * Number(l.unitPrice), 0);
  const addLine = () => setLines(p => [...p, { itemId: '', description: '', qty: 1, unitPrice: 0 }]);
  const removeLine = (i: number) => setLines(p => p.filter((_, idx) => idx !== i));
  const setLine = (i: number, k: keyof CreditLine, v: any) =>
    setLines(p => p.map((l, idx) => {
      if (idx !== i) return l;
      const u = { ...l, [k]: v };
      if (k === 'itemId') { const it = items.find((x: any) => x.id === v); if (it) u.description = it.name; }
      return u;
    }));

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/purchasing/vendor-credits', data),
    onSuccess: async (res) => {
      const savedId = res.data?.data?.id;
      if (savedId) { try { await uploadFileRows(fileRows, 'vendor_credit', String(savedId), api.post.bind(api)); } catch(_) {} }
      toast.success('Vendor credit memo recorded');
      navigate('/purchasing/vendor-credits');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vendorId) { toast.error('Vendor is required'); return; }
    mutation.mutate({
      ...form,
      departmentId: form.departmentId || null,
      locationId: form.locationId || null,
      subsidiaryId: form.subsidiaryId || null,
      lines,
      totalAmount: total,
    });
  };

  const dis = 'w-full border border-slate-300 rounded text-sm px-2 py-1.5';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-amber-500 flex items-center justify-center text-white"><Receipt size={15}/></div>
              <span className="text-xl font-bold text-slate-800">Vendor Credit</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/purchasing/vendor-credits')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=vendor_credit')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button type="submit" form="vendor-credit-form" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {mutation.isPending&&<Loader2 size={12} className="animate-spin"/>} Save
          </button>
          <button type="button" onClick={() => navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>

      <form id="vendor-credit-form" onSubmit={handleSubmit}>
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
                    <div><label className="block text-xs text-slate-500 mb-1">Credit Date <span className="text-red-500">*</span></label>
                      <input type="date" value={form.creditDate} onChange={e=>set('creditDate',e.target.value)} className={dis} required/></div>
                  </div>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Vendor Credit Memo #</label>
                      <input value={form.creditMemoNumber} onChange={e=>set('creditMemoNumber',e.target.value)} className={dis} placeholder="Vendor's credit memo number"/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Original Bill Number</label>
                      <input value={form.originalBillNumber} onChange={e=>set('originalBillNumber',e.target.value)} className={dis} placeholder="BILL-XXXX"/></div>
                  </div>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Reason</label>
                      <select value={form.reason} onChange={e=>set('reason',e.target.value)} className={dis}>
                        <option value="">-- Select Reason --</option>
                        <option value="return">Goods Return</option>
                        <option value="price_adjustment">Price Adjustment</option>
                        <option value="discount">Discount</option>
                        <option value="damaged">Damaged Goods</option>
                        <option value="other">Other</option>
                      </select></div>
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

          {/* Lines + Files */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <div className="border-b border-slate-200 px-4 flex">
              {(['lines','files'] as const).map(tab=>(
                <button key={tab} type="button" onClick={()=>setLineTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${lineTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {tab==='lines'?'Credit Items':'Files'}
                </button>
              ))}
            </div>
            <div className="p-4">
              {lineTab==='lines' && (
                <div>
                  <div className="border border-slate-200 rounded overflow-x-auto">
                    <table className="w-full text-xs min-w-max">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 w-8">#</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-48">Item</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-48">Description</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-24">Qty</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Unit Price</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Total</th>
                          <th className="px-3 py-2 w-8"/>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line,i)=>(
                          <tr key={i} className="border-t border-slate-100">
                            <td className="px-3 py-1 text-slate-400">{i+1}</td>
                            <td className="px-1 py-1"><select value={line.itemId} onChange={e=>setLine(i,'itemId',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 bg-white text-xs"><option value="">-- Item --</option>{items.map((it:any)=><option key={it.id} value={it.id}>{it.item_code} - {it.name}</option>)}</select></td>
                            <td className="px-1 py-1"><input value={line.description} onChange={e=>setLine(i,'description',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 text-xs"/></td>
                            <td className="px-1 py-1"><input type="number" min="0.01" step="0.01" value={line.qty} onChange={e=>setLine(i,'qty',parseFloat(e.target.value))} className="w-full border border-slate-200 rounded px-1 py-0.5 text-right text-xs"/></td>
                            <td className="px-1 py-1"><input type="number" min="0" step="0.01" value={line.unitPrice} onChange={e=>setLine(i,'unitPrice',parseFloat(e.target.value)||0)} className="w-full border border-slate-200 rounded px-1 py-0.5 text-right text-xs"/></td>
                            <td className="px-3 py-1 text-right font-medium">{(Number(line.qty)*Number(line.unitPrice)).toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                            <td className="px-2 py-1"><button type="button" onClick={()=>removeLine(i)} className="text-red-400 hover:text-red-600"><Trash2 size={12}/></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" onClick={addLine} className="mt-2 flex items-center gap-1 px-3 py-1.5 border border-dashed border-slate-300 text-xs text-slate-500 rounded hover:border-blue-400 hover:text-blue-600"><Plus size={11}/> Add Item</button>
                  <div className="mt-4 flex justify-end"><div className="w-60 space-y-1 text-xs">
                    <div className="flex justify-between py-1.5 font-bold text-sm"><span>Total Credit</span><span className="text-emerald-600">{total.toLocaleString('id-ID',{minimumFractionDigits:2})}</span></div>
                  </div></div>
                  <div className="mt-4 rounded border border-emerald-200 bg-emerald-50/30 p-4 text-sm text-emerald-800">
                    <p className="font-medium">GL Impact</p>
                    <p className="text-xs text-emerald-700 mt-1"><strong>Dr. Accounts Payable → Cr. Inventory / Expense Account</strong></p>
                  </div>
                </div>
              )}
              {lineTab==='files' && <TransactionFileUploadRow rows={fileRows} setRows={setFileRows}/>}
            </div>
          </div>

          {/* Bottom bar */}
          <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
            <button type="submit" form="vendor-credit-form" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
              {mutation.isPending&&<Loader2 size={12} className="animate-spin"/>} Save
            </button>
            <button type="button" onClick={()=>navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      </form>
    </div>
  );
}
