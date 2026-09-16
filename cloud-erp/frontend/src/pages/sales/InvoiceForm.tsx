import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Plus, Trash2, FileText } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import toast from 'react-hot-toast';

interface InvoiceLine {
  id: number; itemId: string; description: string;
  quantity: number; unitPrice: number; taxCode: string; taxRate: number;
  taxAmount: number; amount: number; departmentId: string; locationId: string;
}
const blankLine = (n: number): InvoiceLine => ({
  id: n, itemId: '', description: '', quantity: 1, unitPrice: 0,
  taxCode: '', taxRate: 0, taxAmount: 0, amount: 0, departmentId: '', locationId: '',
});

export default function InvoiceForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const soId = searchParams.get('soId');
  const isEdit = !!id && id !== 'new';

  const { customers, items, locations, departments, taxCodes } = useFormOptions();
  const { data: subsidiariesData } = useQuery({ queryKey: ['subsidiaries'], queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []) });
  const subsidiaries: any[] = subsidiariesData || [];

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [lineTab, setLineTab] = useState<'items'|'files'>('items');
  const [lineCounter, setLineCounter] = useState(1000);
  const [fileRows, setFileRows] = useState<FileRow[]>([{ id: `f_${Date.now()}`, file: null, title: '', description: '', folder: 'Attachments' }]);

  const [form, setForm] = useState({
    customerId: '', invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: '', soId: soId || '', currency: 'IDR', paymentTerms: 'Net30',
    locationId: '', departmentId: '', subsidiaryId: '', memo: '',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const [lines, setLines] = useState<InvoiceLine[]>([blankLine(1000)]);

  const { data: soData } = useQuery({ queryKey: ['so-for-invoice', soId], queryFn: () => api.get(`/api/sales/orders/${soId}`).then(r => r.data.data), enabled: !!soId });
  useEffect(() => {
    if (soData) {
      set('customerId', soData.customer_id);
      set('currency', soData.currency);
      set('locationId', soData.location_id || '');
      set('departmentId', soData.department_id || '');
      if (soData.lines?.length) {
        setLines(soData.lines.map((l: any, i: number) => ({
          id: 1000+i, itemId: l.item_id||'', description: l.description||'',
          quantity: parseFloat(l.quantity)||1, unitPrice: parseFloat(l.unit_price)||0,
          taxCode: '', taxRate: 0, taxAmount: 0, amount: parseFloat(l.amount)||0,
          departmentId: l.department_id||'', locationId: l.location_id||'',
        })));
      }
    }
  }, [soData]);

  const updateLine = useCallback((lid: number, key: string, value: any) => {
    setLines(prev => prev.map(l => {
      if (l.id !== lid) return l;
      const u = { ...l, [key]: value };
      if (['quantity','unitPrice'].includes(key)) {
        const qty = key==='quantity' ? Number(value) : Number(u.quantity);
        const price = key==='unitPrice' ? Number(value) : Number(u.unitPrice);
        u.amount = qty * price;
        u.taxAmount = u.amount * (u.taxRate / 100);
      }
      if (key==='itemId') { const it = items.find((i:any)=>i.id===value); if(it){u.description=it.name;u.unitPrice=parseFloat(it.sale_price||it.standard_cost||0);u.amount=Number(u.quantity)*u.unitPrice;} }
      if (key==='taxCode') { const tc = taxCodes.find((t:any)=>t.code===value||t.id===value); if(tc){u.taxRate=parseFloat(tc.rate||0);u.taxAmount=u.amount*(u.taxRate/100);} }
      return u;
    }));
  }, [items, taxCodes]);

  const addLine = () => { const n=lineCounter+1; setLineCounter(n); setLines(p=>[...p, blankLine(n)]); };
  const removeLine = (lid: number) => setLines(p=>p.filter(l=>l.id!==lid));

  const subtotal = lines.reduce((s,l)=>s+l.amount,0);
  const taxTotal = lines.reduce((s,l)=>s+l.taxAmount,0);
  const total = subtotal + taxTotal;

  const mutation = useMutation({
    mutationFn: (data: any) => isEdit ? api.put(`/api/sales/invoices/${id}`, data) : api.post('/api/sales/invoices', data),
    onSuccess: async (res) => {
      const savedId = res.data.data.id || id;
      try { await uploadFileRows(fileRows, 'invoice', String(savedId), api.post.bind(api)); } catch(_) {}
      toast.success(isEdit ? 'Invoice updated' : `Invoice ${res.data.data.invoice_number} created`);
      navigate(`/sales/invoices/${savedId}`, { state: { justSaved: true } });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save invoice'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId) { toast.error('Customer is required'); return; }
    const validLines = lines.filter(l => l.itemId || l.description);
    if (!validLines.length) { toast.error('At least one line is required'); return; }
    mutation.mutate({
      ...form, soId: form.soId || null, locationId: form.locationId||null, departmentId: form.departmentId||null, subsidiaryId: form.subsidiaryId||null,
      lines: validLines.map(l => ({ itemId: l.itemId||null, description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), taxCode: l.taxCode||null, taxAmount: Number(l.taxAmount), amount: Number(l.amount), departmentId: l.departmentId||null, locationId: l.locationId||null })),
    });
  };

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white"><FileText size={15}/></div>
              <span className="text-xl font-bold text-slate-800">Invoice</span>
              {soData && <span className="text-sm text-slate-500">from SO: {soData.so_number}</span>}
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/sales/invoices')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=invoice')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <div className="flex">
            <button type="submit" form="inv-form" disabled={mutation.isPending} className="px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded-l hover:bg-blue-800 disabled:opacity-60 flex items-center gap-1">
              {mutation.isPending && <Loader2 size={12} className="animate-spin"/>} {isEdit?'Save Changes':'Save'}
            </button>
            <button type="button" className="px-2 py-1.5 bg-blue-700 text-white border-l border-blue-600 rounded-r hover:bg-blue-800">▾</button>
          </div>
          <button type="button" onClick={() => navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>

      <form id="inv-form" onSubmit={handleSubmit}>
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
                    <div><label className="block text-xs text-slate-500 mb-1">Invoice Date <span className="text-red-500">*</span></label>
                      <input type="date" value={form.invoiceDate} onChange={e=>set('invoiceDate',e.target.value)} className={dis} required/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Due Date</label>
                      <input type="date" value={form.dueDate} onChange={e=>set('dueDate',e.target.value)} className={dis}/></div>
                  </div>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Currency</label>
                      <select value={form.currency} onChange={e=>set('currency',e.target.value)} className={dis}>
                        <option value="IDR">IDR</option><option value="USD">USD</option><option value="EUR">EUR</option>
                      </select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Payment Terms</label>
                      <select value={form.paymentTerms} onChange={e=>set('paymentTerms',e.target.value)} className={dis}>
                        <option value="Net30">Net 30</option><option value="Net60">Net 60</option><option value="Immediate">Immediate</option>
                      </select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Location</label>
                      <select value={form.locationId} onChange={e=>set('locationId',e.target.value)} className={dis}>
                        <option value="">--</option>{locations.map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}
                      </select></div>
                  </div>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Department</label>
                      <select value={form.departmentId} onChange={e=>set('departmentId',e.target.value)} className={dis}>
                        <option value="">--</option>{departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}
                      </select></div>
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
              {(['items','files'] as const).map(tab=>(
                <button key={tab} type="button" onClick={()=>setLineTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${lineTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {tab==='items'?'Items':'Files'}
                </button>
              ))}
            </div>
            <div className="p-4">
              {lineTab==='items' && (
                <div>
                  <div className="border border-slate-200 rounded overflow-x-auto">
                    <table className="w-full text-xs min-w-max">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-8">#</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-44">Item</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-40">Description</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Qty</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Unit Price</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Tax Code</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Tax Amt</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Amount</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                          <th className="px-3 py-2 w-8"/>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l,idx)=>(
                          <tr key={l.id} className="border-t border-slate-100">
                            <td className="px-3 py-1 text-slate-400">{idx+1}</td>
                            <td className="px-1 py-1"><select value={l.itemId} onChange={e=>updateLine(l.id,'itemId',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 bg-white text-xs"><option value="">--</option>{items.map((it:any)=><option key={it.id} value={it.id}>{it.item_code} – {it.name}</option>)}</select></td>
                            <td className="px-1 py-1"><input value={l.description} onChange={e=>updateLine(l.id,'description',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 text-xs"/></td>
                            <td className="px-1 py-1"><input type="number" min="0.001" step="0.001" value={l.quantity} onChange={e=>updateLine(l.id,'quantity',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 text-right text-xs"/></td>
                            <td className="px-1 py-1"><input type="number" min="0" step="0.01" value={l.unitPrice} onChange={e=>updateLine(l.id,'unitPrice',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 text-right text-xs"/></td>
                            <td className="px-1 py-1"><select value={l.taxCode} onChange={e=>updateLine(l.id,'taxCode',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 bg-white text-xs"><option value="">None</option>{taxCodes.map((t:any)=><option key={t.id} value={t.code||t.id}>{t.code} ({t.rate}%)</option>)}</select></td>
                            <td className="px-3 py-1 text-right text-slate-600">{l.taxAmount>0?l.taxAmount.toLocaleString('id-ID',{minimumFractionDigits:2}):'-'}</td>
                            <td className="px-3 py-1 text-right font-medium">{l.amount.toLocaleString('id-ID',{minimumFractionDigits:2})}</td>
                            <td className="px-1 py-1"><select value={l.departmentId} onChange={e=>updateLine(l.id,'departmentId',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 bg-white text-xs"><option value="">—</option>{departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}</select></td>
                            <td className="px-1 py-1"><select value={l.locationId} onChange={e=>updateLine(l.id,'locationId',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 bg-white text-xs"><option value="">—</option>{locations.map((loc:any)=><option key={loc.id} value={loc.id}>{loc.name}</option>)}</select></td>
                            <td className="px-2 py-1"><button type="button" onClick={()=>removeLine(l.id)} className="text-red-400 hover:text-red-600"><Trash2 size={12}/></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" onClick={addLine} className="mt-2 flex items-center gap-1 px-3 py-1.5 border border-dashed border-slate-300 text-xs text-slate-500 rounded hover:border-blue-400 hover:text-blue-600"><Plus size={11}/> Add Line</button>
                  <div className="mt-4 flex justify-end">
                    <div className="w-60 space-y-1 text-xs">
                      <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-slate-500">Subtotal</span><span>{subtotal.toLocaleString('id-ID',{minimumFractionDigits:2})}</span></div>
                      <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-slate-500">Tax</span><span>{taxTotal.toLocaleString('id-ID',{minimumFractionDigits:2})}</span></div>
                      <div className="flex justify-between py-1.5 font-bold text-sm"><span>Total</span><span className="text-blue-700">{total.toLocaleString('id-ID',{minimumFractionDigits:2})}</span></div>
                    </div>
                  </div>
                </div>
              )}
              {lineTab==='files' && <TransactionFileUploadRow rows={fileRows} setRows={setFileRows}/>}
            </div>
          </div>

          {/* Bottom bar */}
          <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
            <button type="submit" form="inv-form" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
              {mutation.isPending&&<Loader2 size={12} className="animate-spin"/>} {isEdit?'Save Changes':'Save'}
            </button>
            <button type="button" onClick={()=>navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      </form>
    </div>
  );
}
