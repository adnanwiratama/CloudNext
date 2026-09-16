import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown, Loader2, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useFormOptions } from '../../hooks/useFormOptions';
import TransactionFileUploadRow, { FileRow, uploadFileRows } from '../../components/transaction/TransactionFileUploadRow';
import { formatCurrency } from '../../utils/format';
import toast from 'react-hot-toast';

interface QuoteLine { id: number; itemId: string; description: string; qty: number; unitPrice: number; discount: number; departmentId: string; locationId: string; }

export default function QuotationForm() {
  const navigate = useNavigate();
  const { customers, items, locations, departments } = useFormOptions();
  const { data: subsidiariesData } = useQuery({ queryKey: ['subsidiaries'], queryFn: () => api.get('/api/settings/subsidiaries').then(r => r.data.data || []) });
  const subsidiaries: any[] = subsidiariesData || [];

  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [classOpen, setClassOpen] = useState(true);
  const [lineTab, setLineTab] = useState<'items'|'files'>('items');
  const [fileRows, setFileRows] = useState<FileRow[]>([{ id: `f_${Date.now()}`, file: null, title: '', description: '', folder: 'Attachments' }]);

  const [form, setForm] = useState({
    customerId: '', quotationDate: new Date().toISOString().split('T')[0],
    validUntil: '', currency: 'IDR', paymentTerms: 'net30',
    locationId: '', departmentId: '', subsidiaryId: '', salesRep: '', memo: '', taxRate: 11,
  });
  const [lines, setLines] = useState<QuoteLine[]>([{ id: 1, itemId: '', description: '', qty: 1, unitPrice: 0, discount: 0, departmentId: '', locationId: '' }]);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const subtotal = lines.reduce((s, l) => { const lt = Number(l.qty)*Number(l.unitPrice); return s + lt - (lt*Number(l.discount)/100); }, 0);
  const taxAmount = subtotal * (Number(form.taxRate)/100);
  const total = subtotal + taxAmount;

  const addLine = () => setLines(p=>[...p,{id:Date.now(),itemId:'',description:'',qty:1,unitPrice:0,discount:0,departmentId:'',locationId:''}]);
  const removeLine = (id: number) => setLines(p=>p.filter(l=>l.id!==id));
  const setLine = (id: number, k: keyof QuoteLine, v: any) =>
    setLines(p=>p.map(l=>{
      if(l.id!==id)return l;
      const u={...l,[k]:v};
      if(k==='itemId'){const it=items.find((x:any)=>x.id===v);if(it){u.description=it.name;u.unitPrice=it.sale_price||0;}}
      return u;
    }));

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/api/sales/quotations', data),
    onSuccess: async (res) => {
      const savedId = res.data.data.id;
      try { await uploadFileRows(fileRows, 'quotation', String(savedId), api.post.bind(api)); } catch(_) {}
      toast.success('Quotation saved');
      navigate('/sales/quotations');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save quotation'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId) { toast.error('Customer is required'); return; }
    mutation.mutate({ ...form, lines, subtotal, taxAmount, totalAmount: total });
  };

  const dis = 'w-full border border-slate-200 rounded text-sm px-2 py-1.5';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="border-b border-slate-100">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-amber-500 flex items-center justify-center text-white font-bold text-sm">Q</div>
              <span className="text-xl font-bold text-slate-800">Quotation</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-blue-600">
              <button onClick={() => navigate('/sales/quotations')} className="hover:underline">List</button>
              <button onClick={() => navigate('/customization/forms?module=quotation')} className="hover:underline">Customize</button>
              <span className="cursor-pointer hover:underline">Search</span>
            </div>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center gap-2">
          <button type="submit" form="quote-form" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
            {mutation.isPending&&<Loader2 size={12} className="animate-spin"/>} Save
          </button>
          <button type="button" onClick={() => navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
        </div>
      </div>

      <form id="quote-form" onSubmit={handleSubmit}>
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
                    <div><label className="block text-xs text-slate-500 mb-1">Customer <span className="text-red-500">*</span></label>
                      <select value={form.customerId} onChange={e=>set('customerId',e.target.value)} className={dis} required>
                        <option value="">-- Select Customer --</option>{customers.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}
                      </select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Quotation Date <span className="text-red-500">*</span></label>
                      <input type="date" value={form.quotationDate} onChange={e=>set('quotationDate',e.target.value)} className={dis} required/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Valid Until</label>
                      <input type="date" value={form.validUntil} onChange={e=>set('validUntil',e.target.value)} className={dis}/></div>
                  </div>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Currency</label>
                      <select value={form.currency} onChange={e=>set('currency',e.target.value)} className={dis}><option value="IDR">IDR</option><option value="USD">USD</option></select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Payment Terms</label>
                      <select value={form.paymentTerms} onChange={e=>set('paymentTerms',e.target.value)} className={dis}>
                        <option value="immediate">Immediate</option><option value="net15">Net 15</option><option value="net30">Net 30</option><option value="net60">Net 60</option>
                      </select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Location</label>
                      <select value={form.locationId} onChange={e=>set('locationId',e.target.value)} className={dis}><option value="">--</option>{locations.map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
                  </div>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-500 mb-1">Department</label>
                      <select value={form.departmentId} onChange={e=>set('departmentId',e.target.value)} className={dis}><option value="">--</option>{departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Tax Rate (%)</label>
                      <input type="number" min="0" max="100" step="0.1" value={form.taxRate} onChange={e=>set('taxRate',parseFloat(e.target.value)||0)} className={dis}/></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Memo</label>
                      <textarea value={form.memo} onChange={e=>set('memo',e.target.value)} rows={2} className={`${dis} resize-none`}/></div>
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
                          <th className="px-3 py-2 w-8">#</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-44">Item</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-36">Description</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Qty</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Unit Price</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Disc %</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 w-32">Amount</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Department</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 w-28">Location</th>
                          <th className="px-3 py-2 w-8"/>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l,i)=>{
                          const lt=Number(l.qty)*Number(l.unitPrice);
                          const amt=lt-lt*Number(l.discount)/100;
                          return(
                            <tr key={l.id} className="border-t border-slate-100">
                              <td className="px-3 py-1 text-slate-400">{i+1}</td>
                              <td className="px-1 py-1"><select value={l.itemId} onChange={e=>setLine(l.id,'itemId',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 bg-white text-xs"><option value="">--</option>{items.map((it:any)=><option key={it.id} value={it.id}>{it.item_code} – {it.name}</option>)}</select></td>
                              <td className="px-1 py-1"><input value={l.description} onChange={e=>setLine(l.id,'description',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 text-xs"/></td>
                              <td className="px-1 py-1"><input type="number" value={l.qty} onChange={e=>setLine(l.id,'qty',parseFloat(e.target.value)||1)} className="w-full border border-slate-200 rounded px-1 py-0.5 text-right text-xs"/></td>
                              <td className="px-1 py-1"><input type="number" value={l.unitPrice} onChange={e=>setLine(l.id,'unitPrice',parseFloat(e.target.value)||0)} className="w-full border border-slate-200 rounded px-1 py-0.5 text-right text-xs"/></td>
                              <td className="px-1 py-1"><input type="number" min="0" max="100" value={l.discount} onChange={e=>setLine(l.id,'discount',parseFloat(e.target.value)||0)} className="w-full border border-slate-200 rounded px-1 py-0.5 text-right text-xs"/></td>
                              <td className="px-3 py-1 text-right font-medium">{formatCurrency(amt)}</td>
                              <td className="px-1 py-1"><select value={l.departmentId} onChange={e=>setLine(l.id,'departmentId',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 bg-white text-xs"><option value="">—</option>{departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}</select></td>
                              <td className="px-1 py-1"><select value={l.locationId} onChange={e=>setLine(l.id,'locationId',e.target.value)} className="w-full border border-slate-200 rounded px-1 py-0.5 bg-white text-xs"><option value="">—</option>{locations.map((loc:any)=><option key={loc.id} value={loc.id}>{loc.name}</option>)}</select></td>
                              <td className="px-2 py-1"><button type="button" onClick={()=>removeLine(l.id)} className="text-red-400 hover:text-red-600"><Trash2 size={12}/></button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50"><td colSpan={6} className="px-3 py-1.5 text-right text-xs text-slate-500">Subtotal</td><td className="px-3 py-1.5 text-right text-xs font-medium">{formatCurrency(subtotal)}</td><td colSpan={3}/></tr>
                        <tr className="bg-slate-50"><td colSpan={6} className="px-3 py-1.5 text-right text-xs text-slate-500">Tax ({form.taxRate}%)</td><td className="px-3 py-1.5 text-right text-xs font-medium">{formatCurrency(taxAmount)}</td><td colSpan={3}/></tr>
                        <tr className="bg-slate-50 font-bold"><td colSpan={6} className="px-3 py-2 text-right text-sm">Total</td><td className="px-3 py-2 text-right text-blue-700">{formatCurrency(total)}</td><td colSpan={3}/></tr>
                      </tfoot>
                    </table>
                  </div>
                  <button type="button" onClick={addLine} className="mt-2 flex items-center gap-1 px-3 py-1.5 border border-dashed border-slate-300 text-xs text-slate-500 rounded hover:border-blue-400 hover:text-blue-600"><Plus size={11}/> Add Line</button>
                </div>
              )}
              {lineTab==='files' && <TransactionFileUploadRow rows={fileRows} setRows={setFileRows}/>}
            </div>
          </div>

          {/* Bottom bar */}
          <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-2.5 flex items-center gap-2">
            <button type="submit" form="quote-form" disabled={mutation.isPending} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 disabled:opacity-60">
              {mutation.isPending&&<Loader2 size={12} className="animate-spin"/>} Save
            </button>
            <button type="button" onClick={()=>navigate(-1)} className="px-3 py-1.5 border border-slate-300 bg-white text-sm text-slate-700 rounded hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      </form>
    </div>
  );
}
