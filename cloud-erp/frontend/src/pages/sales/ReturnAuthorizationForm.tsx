import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Plus, Trash2, RotateCcw } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import { formatCurrency } from '../../utils/format';
import toast from 'react-hot-toast';

interface RALine { itemId: string; description: string; qty: number; unitPrice: number; reason: string; departmentId: string; locationId: string; }
const blankLine = (): RALine => ({ itemId: '', description: '', qty: 1, unitPrice: 0, reason: '', departmentId: '', locationId: '' });

export default function ReturnAuthorizationForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { customers, items, locations, departments } = useFormOptions();

  const { data: subsidiariesData } = useQuery({ queryKey: ['subsidiaries'], queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []) });
  const subsidiaries: any[] = subsidiariesData || [];

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [lineTab, setLineTab] = useState<'lines'|'files'>('lines');
  const [fileRows, setFileRows] = useState<FileRow[]>([{ id: `f_${Date.now()}`, file: null, title: '', description: '', folder: 'Attachments' }]);

  const [form, setForm] = useState({
    customerId: searchParams.get('customerId') || '',
    returnDate: new Date().toISOString().split('T')[0],
    originalInvoiceNumber: searchParams.get('invoiceNumber') || '',
    returnReason: '',
    locationId: '',
    memo: '',
    departmentId: '',
    subsidiaryId: '',
  });
  const [lines, setLines] = useState<RALine[]>([blankLine()]);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const total = lines.reduce((s, l) => s + Number(l.qty) * Number(l.unitPrice), 0);
  const addLine = () => setLines(p => [...p, blankLine()]);
  const removeLine = (i: number) => setLines(p => p.filter((_, idx) => idx !== i));
  const setLine = (i: number, k: keyof RALine, v: any) =>
    setLines(p => p.map((l, idx) => {
      if (idx !== i) return l;
      const u = { ...l, [k]: v };
      if (k === 'itemId') { const it = items.find((x: any) => x.id === v); if (it) { u.description = it.name; u.unitPrice = it.sale_price || 0; } }
      return u;
    }));

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/sales/return-authorizations', data),
    onSuccess: async (res) => {
      const savedId = res.data?.data?.id;
      try { if (savedId) await uploadFileRows(fileRows, 'return_authorization', String(savedId), api.post.bind(api)); } catch (_) {}
      toast.success('Return Authorization created');
      navigate('/sales/return-authorizations');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId) { toast.error('Customer is required'); return; }
    mutation.mutate({
      ...form,
      departmentId: form.departmentId || null,
      locationId: form.locationId || null,
      subsidiaryId: form.subsidiaryId || null,
      lines: lines.map(l => ({ ...l, departmentId: l.departmentId || null, locationId: l.locationId || null })),
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
              <div className="w-8 h-8 rounded bg-orange-500 flex items-center justify-center text-white"><RotateCcw size={15}/></div>
              <span className="text-xl font-bold text-slate-800">Return Authorization</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/sales/return-authorizations')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=return_authorization')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <div className="flex">
            <button type="submit" form="ra-form" disabled={mutation.isPending} className="px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded-l hover:bg-blue-800 disabled:opacity-60 flex items-center gap-1">
              {mutation.isPending && <Loader2 size={12} className="animate-spin"/>} Save
            </button>
            <button type="button" className="px-2 py-1.5 bg-blue-700 text-white border-l border-blue-600 rounded-r hover:bg-blue-800">▾</button>
          </div>
          <button type="button" onClick={() => navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>

      <form id="ra-form" onSubmit={handleSubmit}>
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
                    <div><label className="block text-xs text-slate-500 mb-1">Return Date <span className="text-red-500">*</span></label>
                      <input type="date" value={form.returnDate} onChange={e=>set('returnDate',e.target.value)} className={dis} required/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Original Invoice #</label>
                      <input type="text" value={form.originalInvoiceNumber} onChange={e=>set('originalInvoiceNumber',e.target.value)} className={dis} placeholder="INV-XXXX"/></div>
                  </div>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Return Reason <span className="text-red-500">*</span></label>
                      <select value={form.returnReason} onChange={e=>set('returnReason',e.target.value)} className={dis} required>
                        <option value="">-- Select Reason --</option>
                        <option value="defective">Defective / Damaged</option>
                        <option value="wrong_item">Wrong Item Delivered</option>
                        <option value="wrong_qty">Wrong Quantity</option>
                        <option value="quality">Quality Issue</option>
                        <option value="customer_change">Customer Changed Mind</option>
                        <option value="other">Other</option>
                      </select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Return To Location</label>
                      <select value={form.locationId} onChange={e=>set('locationId',e.target.value)} className={dis}>
                        <option value="">-- Select Location --</option>
                        {locations.map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}
                      </select></div>
                  </div>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Memo</label>
                      <textarea value={form.memo} onChange={e=>set('memo',e.target.value)} rows={3} className={`${dis} resize-none`}/></div>
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

          {/* Lines + Files */}
          <div className="bg-white border border-slate-200 rounded shadow-sm">
            <div className="border-b border-slate-200 px-4 flex">
              {(['lines','files'] as const).map(tab=>(
                <button key={tab} type="button" onClick={()=>setLineTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${lineTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {tab==='lines'?'Return Items':'Files'}
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
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-8">#</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-44">Item <span className="text-red-500">*</span></th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Description</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Qty</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Unit Price</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-32">Reason</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Total</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                          <th className="px-3 py-2 w-8"/>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="px-3 py-1 text-slate-400">{i+1}</td>
                            <td className="px-1 py-1"><select value={line.itemId} onChange={e=>setLine(i,'itemId',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 bg-white text-xs" required><option value="">-- Select Item --</option>{items.map((it:any)=><option key={it.id} value={it.id}>{it.item_code} - {it.name}</option>)}</select></td>
                            <td className="px-1 py-1"><input value={line.description} onChange={e=>setLine(i,'description',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 text-xs"/></td>
                            <td className="px-1 py-1"><input type="number" min="0.01" step="0.01" value={line.qty} onChange={e=>setLine(i,'qty',parseFloat(e.target.value))} className="w-full border border-slate-200 rounded px-1 py-0.5 text-right text-xs"/></td>
                            <td className="px-1 py-1"><input type="number" min="0" step="0.01" value={line.unitPrice} onChange={e=>setLine(i,'unitPrice',parseFloat(e.target.value)||0)} className="w-full border border-slate-200 rounded px-1 py-0.5 text-right text-xs"/></td>
                            <td className="px-1 py-1"><input value={line.reason} onChange={e=>setLine(i,'reason',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 text-xs"/></td>
                            <td className="px-3 py-1 text-right font-medium">{formatCurrency(Number(line.qty) * Number(line.unitPrice))}</td>
                            <td className="px-1 py-1"><select value={line.departmentId} onChange={e=>setLine(i,'departmentId',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 bg-white text-xs"><option value="">—</option>{departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}</select></td>
                            <td className="px-1 py-1"><select value={line.locationId} onChange={e=>setLine(i,'locationId',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 bg-white text-xs"><option value="">—</option>{locations.map((loc:any)=><option key={loc.id} value={loc.id}>{loc.name}</option>)}</select></td>
                            <td className="px-2 py-1"><button type="button" onClick={()=>removeLine(i)} className="text-red-400 hover:text-red-600"><Trash2 size={12}/></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" onClick={addLine} className="mt-2 flex items-center gap-1 px-3 py-1.5 border border-dashed border-slate-300 text-xs text-slate-500 rounded hover:border-blue-400 hover:text-blue-600"><Plus size={11}/> Add Item</button>
                  <div className="mt-4 flex justify-end">
                    <div className="w-60 space-y-1 text-xs">
                      <div className="flex justify-between py-1.5 font-bold text-sm"><span>Total Return Value</span><span className="text-blue-700">{formatCurrency(total)}</span></div>
                    </div>
                  </div>
                </div>
              )}
              {lineTab==='files' && <TransactionFileUploadRow rows={fileRows} setRows={setFileRows}/>}
            </div>
          </div>

          {/* Bottom bar */}
          <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
            <button type="submit" form="ra-form" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
              {mutation.isPending&&<Loader2 size={12} className="animate-spin"/>} Save
            </button>
            <button type="button" onClick={()=>navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      </form>
    </div>
  );
}
